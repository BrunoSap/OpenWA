jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { applyGlobalValidation } from '../src/config/app-validation';
import Redis from 'ioredis';

/**
 * Health - Redis Indicator E2E
 *
 * Tests the custom RedisHealthIndicator integrated into the readiness probe.
 * Validates that /api/health/ready correctly reports Redis status.
 */
describe('Health - Redis Indicator (e2e)', () => {
  let app: INestApplication<App>;
  let redisClient: Redis;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    // Get Redis client from the app context (if Redis is enabled)
    try {
      redisClient = app.get<Redis>('REDIS_CLIENT');
    } catch {
      // Redis not enabled in test environment — skip Redis-specific tests
    }
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  it('GET /api/health/ready returns 200 when Redis is up', async () => {
    if (!redisClient) {
      // Redis disabled — readiness should still pass (no Redis check)
      const response = await request(app.getHttpServer())
        .get('/api/health/ready')
        .expect(200);

      expect(response.body.status).toBe('ok');
      return;
    }

    // Redis enabled — verify it's included in readiness
    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.details).toBeDefined();
    expect(response.body.details.redis).toBeDefined();
    expect(response.body.details.redis.status).toBe('up');
  });

  it('GET /api/health/ready returns 503 when Redis is down', async () => {
    if (!redisClient) {
      // No Redis to mock — skip this test
      return;
    }

    // Mock Redis PING to throw (simulates connection failure)
    const originalPing = redisClient.ping.bind(redisClient);
    jest.spyOn(redisClient, 'ping').mockRejectedValueOnce(new Error('Connection refused'));

    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);

    expect(response.body.status).toBe('error');
    expect(response.body.details).toBeDefined();
    expect(response.body.details.redis).toBeDefined();
    expect(response.body.details.redis.status).toBe('down');

    // Restore original implementation
    redisClient.ping = originalPing;
  });

  it('Redis health check handles unexpected PING response', async () => {
    if (!redisClient) {
      return;
    }

    // Mock Redis PING to return unexpected value (not 'PONG')
    const originalPing = redisClient.ping.bind(redisClient);
    jest.spyOn(redisClient, 'ping').mockResolvedValueOnce('UNEXPECTED' as any);

    const response = await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503);

    expect(response.body.status).toBe('error');
    expect(response.body.details.redis.status).toBe('down');

    // Restore
    redisClient.ping = originalPing;
  });
});
