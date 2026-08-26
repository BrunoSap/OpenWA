// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as http from 'http';
import type { AddressInfo } from 'net';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';

/**
 * E2E for the qualified-lead export (Plan 02 Task 3). Proves the two export paths:
 * - GET /leads/:chatId returns the completed lead as JSON (export via API);
 * - POST /leads/:chatId/export POSTs the lead payload to a caller-supplied URL (webhook out);
 * - a lead still 'in_progress' is not exportable (409).
 *
 * SSRF protection is ON by default and would reject the 127.0.0.1 receiver at delivery, so the suite
 * runs with WEBHOOK_SSRF_PROTECT=false (same precedent as webhooks.e2e-spec.ts). Auth mirrors the
 * tracer: a real ADMIN key (covers OPERATOR routes) sent as X-API-Key.
 */
describe('Intake export (e2e)', () => {
  let app: INestApplication<App>;
  let apiKey: string;
  let receiver: http.Server;
  let receiverUrl: string;
  let received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];

  const prevSsrf = process.env.WEBHOOK_SSRF_PROTECT;
  const SESSION = 'test-session';
  const base = `/api/sessions/${SESSION}/intake`;

  jest.setTimeout(60000);

  beforeAll(async () => {
    process.env.WEBHOOK_SSRF_PROTECT = 'false';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    const authService = app.get(AuthService);
    apiKey = (await authService.createApiKey({ name: 'e2e-intake-export', role: ApiKeyRole.ADMIN })).rawKey;

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

  beforeEach(() => {
    received = [];
  });

  let chatSeq = 0;
  const nextChatId = (): string => `551188888${Date.now()}${chatSeq++}@c.us`;

  // Drive the conversational flow to completion over the ingest route.
  async function completeLead(chatId: string): Promise<void> {
    for (const text of ['Maria Silva', '+5511999998888', 'maria@example.com', 'Caso trabalhista', 'alta']) {
      await request(app.getHttpServer())
        .post(`${base}/messages`)
        .set('X-API-Key', apiKey)
        .send({ chatId, text })
        .expect(201);
    }
  }

  it('Test 1: GET /leads/:chatId returns the completed lead as JSON', async () => {
    const chatId = nextChatId();
    await completeLead(chatId);

    const res = await request(app.getHttpServer())
      .get(`${base}/leads/${encodeURIComponent(chatId)}`)
      .set('X-API-Key', apiKey)
      .expect(200);

    const body = res.body as {
      chatId: string;
      fullName: string;
      urgencyLevel: string;
      intakeStatus: string;
    };
    expect(body.chatId).toBe(chatId);
    expect(body.fullName).toBe('Maria Silva');
    expect(body.urgencyLevel).toBe('high');
    expect(body.intakeStatus).toBe('completed');
  });

  it('Test 2: POST /leads/:chatId/export POSTs the lead payload to the target URL', async () => {
    const chatId = nextChatId();
    await completeLead(chatId);

    const res = await request(app.getHttpServer())
      .post(`${base}/leads/${encodeURIComponent(chatId)}/export`)
      .set('X-API-Key', apiKey)
      .send({ url: receiverUrl })
      .expect(200);

    const body = res.body as { delivered: boolean; status?: number };
    expect(body.delivered).toBe(true);
    expect(body.status).toBe(200);

    expect(received).toHaveLength(1);
    const payload = JSON.parse(received[0].body) as { chatId: string; fullName: string; intakeStatus: string };
    expect(payload.chatId).toBe(chatId);
    expect(payload.fullName).toBe('Maria Silva');
    expect(payload.intakeStatus).toBe('completed');
  });

  it('Test 3: export of an in_progress lead returns 409', async () => {
    const chatId = nextChatId();
    // Only the first field collected — still in_progress.
    await request(app.getHttpServer())
      .post(`${base}/messages`)
      .set('X-API-Key', apiKey)
      .send({ chatId, text: 'Maria Silva' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`${base}/leads/${encodeURIComponent(chatId)}/export`)
      .set('X-API-Key', apiKey)
      .send({ url: receiverUrl })
      .expect(409);

    expect(received).toHaveLength(0);
  });
});
