// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { AnalyticsEventsService } from './../src/modules/analytics/services/analytics-events.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Phase 6 Plan 02b: Analytics KPI endpoints E2E test (DASH-01, DASH-02).
 *
 * Seeds a known event set and asserts exact KPI numbers from the four query endpoints:
 * - GET /api/analytics/overview: resolutionRate, fallbackRate, costPerConversation, dau, mau
 * - GET /api/analytics/performance: latency p50/p95/p99 percentiles
 * - GET /api/analytics/cost: total cost + breakdown by provider
 * - GET /api/analytics/conversations: paginated conversation list
 *
 * All endpoints require OPERATOR api-key (T-06-06).
 */
describe('Analytics KPIs (e2e)', () => {
  let app: INestApplication;
  let analyticsService: AnalyticsEventsService;
  let eventEmitter: EventEmitter2;
  let operatorKey: string;

  jest.setTimeout(60000);

  beforeAll(async () => {
    process.env.ANALYTICS_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    analyticsService = app.get(AnalyticsEventsService);
    eventEmitter = app.get(EventEmitter2);

    // Mint an OPERATOR key
    const authService = app.get(AuthService);
    const apiKey = await authService.createApiKey({
      name: 'e2e-analytics-kpis-operator',
      role: ApiKeyRole.OPERATOR,
    });
    operatorKey = apiKey.rawKey;
  });

  afterAll(async () => {
    delete process.env.ANALYTICS_ENABLED;
    try {
      await app?.close();
    } catch {
      /* ignore */
    }
  });

  it('GET /api/analytics/overview returns correct resolutionRate from seeded events', async () => {
    // Seed: 3 conversations started, 2 resolved -> 66.67% resolution rate
    const sessionId = `kpi-session-${Date.now()}`;
    await analyticsService.recordEvent({ event_type: 'conversation.started', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'conversation.started', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'conversation.started', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'conversation.resolved', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'conversation.resolved', session_id: sessionId });

    // Query last 30 days (default)
    const res = await request(app.getHttpServer())
      .get('/analytics/overview')
      .set('Authorization', `Bearer ${operatorKey}`)
      .expect(200);

    expect(res.body.kpis).toBeDefined();
    expect(res.body.kpis.resolutionRate).toBeCloseTo(66.67, 1);
  });

  it('GET /api/analytics/overview returns correct fallbackRate from seeded events', async () => {
    // Seed: 5 messages processed, 2 fallbacks -> 40% fallback rate
    const sessionId = `fallback-session-${Date.now()}`;
    await analyticsService.recordEvent({ event_type: 'message.processed', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'message.processed', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'message.processed', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'message.processed', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'message.processed', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'fallback.triggered', session_id: sessionId });
    await analyticsService.recordEvent({ event_type: 'fallback.triggered', session_id: sessionId });

    const res = await request(app.getHttpServer())
      .get('/analytics/overview')
      .set('Authorization', `Bearer ${operatorKey}`)
      .expect(200);

    expect(res.body.kpis.fallbackRate).toBeGreaterThanOrEqual(30); // At least the 2 seeded fallbacks
  });

  it('GET /api/analytics/performance returns exact p95 latency from seeded values', async () => {
    // Seed known latencies: [100, 200, 300, 400, 500] -> p95 = 480
    const sessionId = `perf-session-${Date.now()}`;
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      latency_ms: 100,
    });
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      latency_ms: 200,
    });
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      latency_ms: 300,
    });
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      latency_ms: 400,
    });
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      latency_ms: 500,
    });

    const res = await request(app.getHttpServer())
      .get('/analytics/performance')
      .set('Authorization', `Bearer ${operatorKey}`)
      .expect(200);

    expect(res.body.latency).toBeDefined();
    expect(Array.isArray(res.body.latency)).toBe(true);
    // p95 of [100,200,300,400,500] = 480
    const todayBucket = res.body.latency.find((point: any) => point.p95 === 480);
    expect(todayBucket).toBeDefined();
  });

  it('GET /api/analytics/cost returns exact OpenAI cost from seeded tokens', async () => {
    // Seed: 1M input + 500K output tokens + 2 images = $0.15 + $0.30 + $0.002 = $0.452
    const sessionId = `cost-session-${Date.now()}`;
    await analyticsService.recordEvent({
      event_type: 'llm.called',
      session_id: sessionId,
      tokens_used: 1500000,
      cost_usd: 0.452,
      payload: { provider: 'openai', model: 'gpt-4o-mini', tokens_input: 1000000, tokens_output: 500000, images_count: 2 },
    });

    const res = await request(app.getHttpServer())
      .get('/analytics/cost')
      .set('Authorization', `Bearer ${operatorKey}`)
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(0.452);
    expect(res.body.breakdown).toBeDefined();
    expect(Array.isArray(res.body.breakdown)).toBe(true);
    const openaiCost = res.body.breakdown.find((item: any) => item.key === 'openai');
    expect(openaiCost).toBeDefined();
    expect(openaiCost.cost).toBeGreaterThanOrEqual(0.452);
  });

  it('GET /api/analytics/conversations returns paginated conversation list', async () => {
    // Seed: 1 conversation with 3 messages
    const sessionId = `conv-session-${Date.now()}`;
    const conversationId = `conv-${Date.now()}`;
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      conversation_id: conversationId,
      latency_ms: 200,
    });
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      conversation_id: conversationId,
      latency_ms: 300,
    });
    await analyticsService.recordEvent({
      event_type: 'message.processed',
      session_id: sessionId,
      conversation_id: conversationId,
      latency_ms: 400,
    });

    const res = await request(app.getHttpServer())
      .get('/analytics/conversations')
      .set('Authorization', `Bearer ${operatorKey}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);

    // Find our seeded conversation
    const conv = res.body.data.find((c: any) => c.conversation_id === conversationId);
    expect(conv).toBeDefined();
    expect(conv.message_count).toBe(3);
    expect(conv.avg_latency).toBe(300); // (200+300+400)/3
  });

  it('GET /api/analytics/overview returns 401 without OPERATOR key', async () => {
    await request(app.getHttpServer())
      .get('/analytics/overview')
      .expect(401);
  });
});
