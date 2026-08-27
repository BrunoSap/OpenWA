// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';

/**
 * Phase 7 Plan 03 Task 3: Analytics dashboard operator-auth E2E test (DASH-UI-07).
 *
 * Verifies that:
 * - OPERATOR key can access all analytics endpoints (200)
 * - Non-operator (VIEWER) key is rejected (401/403)
 * - Export endpoint returns correct Content-Type
 *
 * Covers requirements: DASH-UI-04 (export), DASH-UI-05 (alerts CRUD), DASH-UI-07 (operator-auth gate).
 */
describe('Analytics Dashboard Auth (e2e)', () => {
  let app: INestApplication;
  let operatorKey: string;
  let viewerKey: string;

  jest.setTimeout(60000);

  beforeAll(async () => {
    process.env.ANALYTICS_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    const authService = app.get(AuthService);

    // Create OPERATOR key
    const operatorApiKey = await authService.createApiKey({
      name: 'e2e-analytics-dashboard-operator',
      role: ApiKeyRole.OPERATOR,
    });
    operatorKey = operatorApiKey.rawKey;

    // Create VIEWER key (non-operator)
    const viewerApiKey = await authService.createApiKey({
      name: 'e2e-analytics-dashboard-viewer',
      role: ApiKeyRole.VIEWER,
    });
    viewerKey = viewerApiKey.rawKey;
  });

  afterAll(async () => {
    delete process.env.ANALYTICS_ENABLED;
    try {
      await app?.close();
    } catch {
      /* ignore */
    }
  });

  describe('OPERATOR key access', () => {
    it('GET /api/analytics/overview returns 200 for operator', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/overview')
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);

      expect(res.body.kpis).toBeDefined();
      expect(res.body.kpis.resolutionRate).toBeDefined();
      expect(res.body.kpis.fallbackRate).toBeDefined();
    });

    it('GET /api/analytics/performance returns 200 for operator', async () => {
      await request(app.getHttpServer())
        .get('/analytics/performance')
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);
    });

    it('GET /api/analytics/cost returns 200 for operator', async () => {
      await request(app.getHttpServer())
        .get('/analytics/cost')
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);
    });

    it('GET /api/analytics/conversations returns 200 for operator', async () => {
      await request(app.getHttpServer())
        .get('/analytics/conversations')
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);
    });

    it('GET /api/analytics/export?format=csv returns 200 with text/csv Content-Type', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/export?format=csv')
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);

      expect(res.headers['content-type']).toMatch(/text\/csv/);
    });

    it('GET /api/analytics/alerts/rules returns 200 for operator', async () => {
      await request(app.getHttpServer())
        .get('/analytics/alerts/rules')
        .set('Authorization', `Bearer ${operatorKey}`)
        .expect(200);
    });
  });

  describe('Non-operator (VIEWER) access rejection', () => {
    it('GET /api/analytics/overview returns 401/403 for viewer', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/overview')
        .set('Authorization', `Bearer ${viewerKey}`);

      expect([401, 403]).toContain(res.status);
    });

    it('POST /api/analytics/alerts/rules returns 401/403 for viewer', async () => {
      const res = await request(app.getHttpServer())
        .post('/analytics/alerts/rules')
        .set('Authorization', `Bearer ${viewerKey}`)
        .send({
          name: 'Test Alert',
          metric: 'fallback_rate',
          condition: 'above',
          threshold: 10,
          enabled: true,
          notification_channels: {},
        });

      expect([401, 403]).toContain(res.status);
    });

    it('GET /api/analytics/export?format=csv returns 401/403 for viewer', async () => {
      const res = await request(app.getHttpServer())
        .get('/analytics/export?format=csv')
        .set('Authorization', `Bearer ${viewerKey}`);

      expect([401, 403]).toContain(res.status);
    });
  });
});
