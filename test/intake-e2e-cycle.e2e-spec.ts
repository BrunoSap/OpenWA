// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { IntakeLead } from './../src/modules/intake/entities/intake-lead.entity';

/**
 * Full-cycle E2E for the intake bot (INTAKE-07). Where the tracer (Plan 01) proved the thinnest
 * happy slice and the export suite (Plan 02) proved each export path in isolation, THIS suite drives
 * the complete user journey end-to-end in one pass:
 *
 *   WhatsApp message -> conversational collection (5 fields, in order) -> lead persisted 'completed'
 *   on the 'data' connection -> qualified lead exported to an external receiver.
 *
 * The five inbound messages are sent sequentially over the real POST /messages route (the same route
 * the n8n workflow, Plan 03, calls per inbound WhatsApp message). After each message the reply must
 * carry the NEXT question of the flow (intake-flow.ts STEP_PROMPTS), so the conversation the bot
 * would hold with a real user is asserted turn by turn. The export target is an ephemeral node:http
 * server bound to 127.0.0.1:0 that captures the POSTed payload (threat T-04-01: loopback-only,
 * closed in afterAll).
 *
 * SSRF protection is ON by default and would reject the 127.0.0.1 receiver at delivery, so the suite
 * runs with WEBHOOK_SSRF_PROTECT=false (same precedent as intake-export.e2e-spec.ts / webhooks.e2e).
 * Auth mirrors the other intake suites: a real ADMIN key (covers OPERATOR routes) sent as X-API-Key.
 */
describe('Intake full cycle (e2e)', () => {
  let app: INestApplication<App>;
  let leadRepo: Repository<IntakeLead>;
  let apiKey: string;
  let receiver: http.Server;
  let receiverUrl: string;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];

  const prevSsrf = process.env.WEBHOOK_SSRF_PROTECT;
  const SESSION = 'test-session';
  const base = `/api/sessions/${SESSION}/intake`;

  // The five inbound messages, in the canonical collection order (name -> phone -> email ->
  // demand -> urgency), paired with a fragment of the question the bot should ask NEXT.
  const CONVERSATION: Array<{ text: string; expectNextQuestion: string }> = [
    { text: 'Maria Silva', expectNextQuestion: 'telefone' }, // after name -> asks phone
    { text: '+5511999998888', expectNextQuestion: 'e-mail' }, // after phone -> asks email
    { text: 'maria@example.com', expectNextQuestion: 'demanda' }, // after email -> asks demand
    { text: 'Caso trabalhista', expectNextQuestion: 'urgência' }, // after demand -> asks urgency
    { text: 'alta', expectNextQuestion: 'Registramos' }, // after urgency -> confirmation
  ];

  // Booting the full AppModule (every feature module + both data sources) can exceed jest's 5s
  // default on a cold run; give the boot room (same precedent as the other intake E2E suites).
  jest.setTimeout(60000);

  beforeAll(async () => {
    process.env.WEBHOOK_SSRF_PROTECT = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    leadRepo = app.get(getRepositoryToken(IntakeLead, 'data'));

    const authService = app.get(AuthService);
    apiKey = (await authService.createApiKey({ name: 'e2e-intake-full-cycle', role: ApiKeyRole.ADMIN })).rawKey;

    // Ephemeral loopback receiver capturing the export POST (threat T-04-01: 127.0.0.1, port 0).
    receiver = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>(resolve => receiver.listen(0, '127.0.0.1', resolve));
    receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/lead`;
  });

  afterAll(async () => {
    if (prevSsrf === undefined) delete process.env.WEBHOOK_SSRF_PROTECT;
    else process.env.WEBHOOK_SSRF_PROTECT = prevSsrf;
    await new Promise<void>(resolve => receiver?.close(() => resolve()));
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  // Fresh chat id per test so the unique chat_id index never collides across cases; delete the lead
  // afterEach so each test owns a clean slate on the 'data' connection.
  let chatSeq = 0;
  let currentChatId = '';
  const nextChatId = (): string => {
    currentChatId = `551177777${Date.now()}${chatSeq++}@c.us`;
    return currentChatId;
  };

  afterEach(async () => {
    if (currentChatId) {
      await leadRepo.delete({ chatId: currentChatId });
    }
    received = [];
  });

  it('Test 1: five sequential messages walk the flow, each reply carrying the next question', async () => {
    const chatId = nextChatId();

    for (const turn of CONVERSATION) {
      const res = await request(app.getHttpServer())
        .post(`${base}/messages`)
        .set('X-API-Key', apiKey)
        .send({ chatId, text: turn.text })
        .expect(201);

      const body = res.body as { chatId: string; reply: string; step: string; completed: boolean };
      expect(body.chatId).toBe(chatId);
      // Each reply must contain the fragment of the NEXT question the bot asks.
      expect(body.reply).toContain(turn.expectNextQuestion);
    }
  });

  it('Test 2: after the fifth message the lead is completed with all five fields', async () => {
    const chatId = nextChatId();
    for (const turn of CONVERSATION) {
      await request(app.getHttpServer())
        .post(`${base}/messages`)
        .set('X-API-Key', apiKey)
        .send({ chatId, text: turn.text })
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .get(`${base}/leads/${encodeURIComponent(chatId)}`)
      .set('X-API-Key', apiKey)
      .expect(200);

    const lead = res.body as {
      intakeStatus: string;
      fullName: string;
      phone: string;
      email: string;
      caseType: string;
      urgencyLevel: string;
    };
    expect(lead.intakeStatus).toBe('completed');
    expect(lead.fullName).toBe('Maria Silva');
    expect(lead.phone).toBe('+5511999998888');
    expect(lead.email).toBe('maria@example.com');
    expect(lead.caseType).toBe('Caso trabalhista');
    expect(lead.urgencyLevel).toBe('high'); // 'alta' normalizes to 'high'
  });

  it('Test 3: the qualified lead is exported to the receiver with the correct payload', async () => {
    const chatId = nextChatId();
    for (const turn of CONVERSATION) {
      await request(app.getHttpServer())
        .post(`${base}/messages`)
        .set('X-API-Key', apiKey)
        .send({ chatId, text: turn.text })
        .expect(201);
    }

    const res = await request(app.getHttpServer())
      .post(`${base}/leads/${encodeURIComponent(chatId)}/export`)
      .set('X-API-Key', apiKey)
      .send({ url: receiverUrl })
      .expect(200);

    const body = res.body as { delivered: boolean; status?: number };
    expect(body.delivered).toBe(true);
    expect(body.status).toBe(200);

    expect(received).toHaveLength(1);
    const payload = JSON.parse(received[0].body) as {
      chatId: string;
      fullName: string;
      email: string;
      urgencyLevel: string;
      intakeStatus: string;
    };
    expect(payload.chatId).toBe(chatId);
    expect(payload.fullName).toBe('Maria Silva');
    expect(payload.email).toBe('maria@example.com');
    expect(payload.urgencyLevel).toBe('high');
    expect(payload.intakeStatus).toBe('completed');
  });

  it('Test 4: exactly one lead persists on the data connection for the chat id', async () => {
    const chatId = nextChatId();
    for (const turn of CONVERSATION) {
      await request(app.getHttpServer())
        .post(`${base}/messages`)
        .set('X-API-Key', apiKey)
        .send({ chatId, text: turn.text })
        .expect(201);
    }

    const count = await leadRepo.count({ where: { chatId } });
    expect(count).toBe(1);
  });
});
