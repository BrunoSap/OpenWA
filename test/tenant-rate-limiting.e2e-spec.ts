// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { applyGlobalValidation } from '../src/config/app-validation';
import { Tenant } from '../src/modules/tenant/tenant.entity';
import { ApiKey } from '../src/modules/auth/entities/api-key.entity';

/**
 * E2E proof of per-tenant rate limiting isolation
 *
 * Phase 9 Plan 2 scope:
 * - Per-tenant rate limits are enforced (tenant A exhausting limit does not affect tenant B)
 * - Response headers include X-RateLimit-Limit and X-RateLimit-Remaining
 * - 429 response when limit exceeded
 * - Rate limit resets after window expires
 */
describe('Tenant rate limiting E2E (Phase 9 Plan 2)', () => {
  let app: INestApplication<App>;
  let tenantRepo: Repository<Tenant>;
  let apiKeyRepo: Repository<ApiKey>;

  let tenantA: Tenant;
  let tenantB: Tenant;
  let apiKeyARaw: string; // Tenant A with rateLimitPerMinute = 5
  let apiKeyBRaw: string; // Tenant B with rateLimitPerMinute = 20

  beforeAll(async () => {
    // Skip if Redis not enabled (rate limiting requires Redis)
    if (process.env.REDIS_ENABLED !== 'true') {
      console.log('⚠️  Skipping rate limiting E2E tests - REDIS_ENABLED=false');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    tenantRepo = app.get(getRepositoryToken(Tenant, 'main'));
    apiKeyRepo = app.get(getRepositoryToken(ApiKey, 'main'));

    // Create two tenants with different rate limits
    tenantA = await tenantRepo.save(
      tenantRepo.create({
        name: `E2E Rate Limit Tenant A ${Date.now()}`,
        slug: `e2e-rate-limit-a-${Date.now()}`,
        plan: 'free',
        rateLimitPerMinute: 5, // Low limit to trigger 429 quickly
      }),
    );

    tenantB = await tenantRepo.save(
      tenantRepo.create({
        name: `E2E Rate Limit Tenant B ${Date.now()}`,
        slug: `e2e-rate-limit-b-${Date.now()}`,
        plan: 'pro',
        rateLimitPerMinute: 20, // Higher limit
      }),
    );

    // Create API keys for both tenants
    const crypto = await import('crypto');
    const rawKeyA = `owtest_${crypto.randomBytes(24).toString('hex')}`;
    const rawKeyB = `owtest_${crypto.randomBytes(24).toString('hex')}`;
    const hashKeyA = crypto.createHash('sha256').update(rawKeyA).digest('hex');
    const hashKeyB = crypto.createHash('sha256').update(rawKeyB).digest('hex');

    await apiKeyRepo.save(
      apiKeyRepo.create({
        name: 'e2e-rate-limit-tenant-a-key',
        keyHash: hashKeyA,
        keyPrefix: rawKeyA.substring(0, 12),
        role: 'operator',
        tenantId: tenantA.id,
        isActive: true,
      }),
    );

    await apiKeyRepo.save(
      apiKeyRepo.create({
        name: 'e2e-rate-limit-tenant-b-key',
        keyHash: hashKeyB,
        keyPrefix: rawKeyB.substring(0, 12),
        role: 'operator',
        tenantId: tenantB.id,
        isActive: true,
      }),
    );

    apiKeyARaw = rawKeyA;
    apiKeyBRaw = rawKeyB;
  });

  afterAll(async () => {
    if (!app) return;

    // Clean up test data
    if (tenantA) await tenantRepo.delete(tenantA.id);
    if (tenantB) await tenantRepo.delete(tenantB.id);

    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  describe('Per-tenant rate limiting enforcement', () => {
    it('should enforce rate limit for tenant A (5 requests/minute)', async () => {
      if (process.env.REDIS_ENABLED !== 'true') return;

      const results = [];

      // Fire 10 parallel requests with tenant A key (limit is 5)
      for (let i = 0; i < 10; i++) {
        const promise = request(app.getHttpServer())
          .get('/api/sessions')
          .set('X-API-Key', apiKeyARaw);
        results.push(promise);
      }

      const responses = await Promise.all(results);

      // Count successful and rate-limited responses
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;

      // First 5 should succeed, next 5 should be rate-limited
      expect(successCount).toBeLessThanOrEqual(5);
      expect(rateLimitedCount).toBeGreaterThan(0);

      // Check 429 response structure
      const rateLimitedResponse = responses.find(r => r.status === 429);
      if (rateLimitedResponse) {
        expect(rateLimitedResponse.body).toMatchObject({
          statusCode: 429,
          message: 'Rate limit exceeded',
        });
      }
    });

    it('should include rate limit headers in response', async () => {
      if (process.env.REDIS_ENABLED !== 'true') return;

      const res = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('X-API-Key', apiKeyARaw);

      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
      expect(res.headers['x-ratelimit-limit']).toBe('5');
    });
  });

  describe('Rate limit isolation between tenants', () => {
    it('should NOT affect tenant B when tenant A exhausts limit', async () => {
      if (process.env.REDIS_ENABLED !== 'true') return;

      // Exhaust tenant A's limit (5 requests)
      const tenantARequests = [];
      for (let i = 0; i < 10; i++) {
        tenantARequests.push(
          request(app.getHttpServer())
            .get('/api/sessions')
            .set('X-API-Key', apiKeyARaw),
        );
      }
      await Promise.all(tenantARequests);

      // Immediately fire requests with tenant B key (should all succeed)
      const tenantBRequests = [];
      for (let i = 0; i < 10; i++) {
        tenantBRequests.push(
          request(app.getHttpServer())
            .get('/api/sessions')
            .set('X-API-Key', apiKeyBRaw),
        );
      }

      const tenantBResponses = await Promise.all(tenantBRequests);
      const successCount = tenantBResponses.filter(r => r.status === 200).length;

      // All 10 requests should succeed (tenant B limit is 20, not affected by tenant A)
      expect(successCount).toBe(10);

      // Verify tenant B headers show correct limit
      expect(tenantBResponses[0].headers['x-ratelimit-limit']).toBe('20');
    });

    it('should enforce different limits for different tenants', async () => {
      if (process.env.REDIS_ENABLED !== 'true') return;

      // Test tenant A (limit: 5)
      const tenantARes = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('X-API-Key', apiKeyARaw);

      expect(tenantARes.headers['x-ratelimit-limit']).toBe('5');

      // Test tenant B (limit: 20)
      const tenantBRes = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('X-API-Key', apiKeyBRaw);

      expect(tenantBRes.headers['x-ratelimit-limit']).toBe('20');
    });
  });

  describe('Rate limit window expiry', () => {
    it.skip('should reset rate limit after 60 second window', async () => {
      // This test would take 61+ seconds to run - skipped by default
      // Manual verification: exhaust limit, wait 61s, verify requests succeed again
      if (process.env.REDIS_ENABLED !== 'true') return;

      // Exhaust limit
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(
          request(app.getHttpServer())
            .get('/api/sessions')
            .set('X-API-Key', apiKeyARaw),
        );
      }
      await Promise.all(requests);

      // Wait for window to expire (61 seconds)
      await new Promise(resolve => setTimeout(resolve, 61000));

      // Should succeed again
      const res = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('X-API-Key', apiKeyARaw)
        .expect(200);

      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    }, 70000); // 70 second timeout for this test
  });
});
