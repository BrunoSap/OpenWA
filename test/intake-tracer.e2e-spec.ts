// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { IntakeLead } from './../src/modules/intake/entities/intake-lead.entity';

/**
 * Tracer E2E for the intake bot: the thinnest slice through every layer Phase 1 touches —
 * HTTP controller -> IntakeService -> IntakeLead entity on the 'data' connection -> persistence ->
 * read. Proves the module wiring (entity registered on both 'data' entity lists, IntakeModule in
 * AppModule imports[], repository injected via the named 'data' connection) with one real happy
 * path before the conversational flow and n8n workflow expand on it.
 *
 * Auth mirrors the existing authenticated E2E suites (webhooks.e2e-spec.ts): mint a real ADMIN key
 * — ADMIN covers the OPERATOR routes — and send it as X-API-Key.
 */
describe('Intake tracer (e2e)', () => {
  let app: INestApplication<App>;
  let leadRepo: Repository<IntakeLead>;
  let apiKey: string;

  const SESSION = 'test-session';
  const base = `/api/sessions/${SESSION}/intake`;

  // Booting the full AppModule (every feature module + both data sources) can exceed jest's 5s
  // default on a cold run, which would abort beforeAll mid-connect and surface as spurious
  // "Unable to connect to the database (data)" retries. Give the boot room.
  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    leadRepo = app.get(getRepositoryToken(IntakeLead, 'data'));

    const authService = app.get(AuthService);
    apiKey = (await authService.createApiKey({ name: 'e2e-intake-admin', role: ApiKeyRole.ADMIN })).rawKey;
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  // Fresh chat id per test so the unique chat_id index never collides across cases.
  let chatSeq = 0;
  const nextChatId = (): string => `551199999${Date.now()}${chatSeq++}@c.us`;

  it('POST /messages creates an in_progress lead (201)', async () => {
    const chatId = nextChatId();
    const res = await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('X-API-Key', apiKey)
      .send({ chatId, text: 'Olá, preciso de ajuda' })
      .expect(201);

    const body = res.body as { id: number; intakeStatus: string; chatId: string };
    expect(typeof body.id).toBe('number');
    expect(body.chatId).toBe(chatId);
    expect(body.intakeStatus).toBe('in_progress');
  });

  it('GET /leads/:chatId returns the persisted lead with the sent text in case_data.messages (200)', async () => {
    const chatId = nextChatId();
    const text = 'Quero abrir um caso trabalhista';
    await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('X-API-Key', apiKey)
      .send({ chatId, text })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`${base}/leads/${encodeURIComponent(chatId)}`)
      .set('X-API-Key', apiKey)
      .expect(200);

    const body = res.body as { chatId: string; caseData: { messages: string[] } };
    expect(body.chatId).toBe(chatId);
    expect(body.caseData.messages).toContain(text);
  });

  it('two POSTs with the same chatId produce exactly one lead (upsert by chat_id)', async () => {
    const chatId = nextChatId();
    await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('X-API-Key', apiKey)
      .send({ chatId, text: 'primeira mensagem' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('X-API-Key', apiKey)
      .send({ chatId, text: 'segunda mensagem' })
      .expect(201);

    const count = await leadRepo.count({ where: { chatId } });
    expect(count).toBe(1);

    // The upsert appended both messages onto the single lead.
    const lead = await leadRepo.findOneByOrFail({ chatId });
    expect(lead.caseData.messages).toEqual(['primeira mensagem', 'segunda mensagem']);
  });
});
