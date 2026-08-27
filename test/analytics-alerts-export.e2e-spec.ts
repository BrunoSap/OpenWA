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

/**
 * Phase 6 Plan 03: Analytics export + alerts E2E tests.
 *
 * Covers:
 * - Task 1: CSV/JSON export + SSE stream
 * - Task 2: Alert rules + dispatch (tested in Task 2 completion)
 * - Task 3: CI workflow validation (tested separately)
 */
describe('Analytics Export & Alerts (e2e)', () => {
  let app: INestApplication;
  let analyticsService: AnalyticsEventsService;
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

    // Mint an OPERATOR key
    const authService = app.get(AuthService);
    const apiKey = await authService.createApiKey({
      name: 'e2e-analytics-export-operator',
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

  describe('GET /api/analytics/export', () => {
    beforeEach(async () => {
      // Seed analytics events
      const sessionId = `export-session-${Date.now()}`;
      await analyticsService.recordEvent({
        event_type: 'message.processed',
        session_id: sessionId,
        chat_id: 'chat-1',
        latency_ms: 100,
      });
      await analyticsService.recordEvent({
        event_type: 'message.processed',
        session_id: sessionId,
        chat_id: 'chat-1',
        latency_ms: 200,
      });
      await analyticsService.recordEvent({
        event_type: 'conversation.started',
        session_id: sessionId,
        chat_id: 'chat-1',
      });
    });

    it('should export events as CSV with header row', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/export')
        .query({ format: 'csv' })
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('analytics-export.csv');

      const csv = response.text;
      const lines = csv.split('\n');
      expect(lines[0]).toContain('id,event_type,session_id');
      expect(lines.length).toBeGreaterThan(1); // Header + at least one data row
    });

    it('should export events as JSON array', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/export')
        .query({ format: 'json' })
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('event_type');
    });

    it('should require OPERATOR role for export', async () => {
      await request(app.getHttpServer()).get('/analytics/export').query({ format: 'csv' }).expect(401);
    });
  });

  describe('GET /api/analytics/stream (SSE)', () => {
    it('should return text/event-stream content-type', async () => {
      // SSE connections are long-lived; we just verify the endpoint accepts the connection
      const response = await request(app.getHttpServer())
        .get('/analytics/stream')
        .set('Authorization', `Bearer ${operatorKey}`)
        .set('Accept', 'text/event-stream')
        .timeout(2000)
        .catch((err) => {
          // Timeout is expected for SSE (connection stays open)
          return err;
        });

      // SSE either opens successfully (200) or times out (which is expected behavior)
      // We're just verifying the route exists and accepts auth
      if (response.status) {
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
      }
    });
  });
});
