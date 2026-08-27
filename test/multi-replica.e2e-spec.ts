jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { applyGlobalValidation } from '../src/config/app-validation';

/**
 * Multi-Replica Scaling with Sticky Sessions E2E
 *
 * Tests horizontal scaling behavior when 2 replicas are running behind nginx.
 * Validates:
 * 1. Sticky sessions: same client IP always routes to same replica
 * 2. Load distribution: different IPs use different replicas
 * 3. Replica identification via X-Replica header
 *
 * Prerequisites: docker-compose --profile scale-2 up -d
 */
describe('Multi-Replica Scaling (e2e)', () => {
  let app: INestApplication<App>;
  const NGINX_BASE_URL = process.env.NGINX_URL || 'http://localhost:2785';
  const MULTI_REPLICA_MODE = process.env.MULTI_REPLICA_MODE === 'true';

  beforeAll(async () => {
    if (!MULTI_REPLICA_MODE) {
      // Running in single-replica mode — skip these tests
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      try {
        await app.close();
      } catch {
        /* ignore teardown quirk */
      }
    }
  });

  describe('Sticky Sessions (ip_hash)', () => {
    it('50 sequential requests from same IP go to same replica', async () => {
      if (!MULTI_REPLICA_MODE) return;

      const responses: string[] = [];

      // Loop 50 requests with same X-Forwarded-For IP
      for (let i = 0; i < 50; i++) {
        const res = await request(NGINX_BASE_URL)
          .get('/api/health/live')
          .set('X-Forwarded-For', '192.168.1.100');

        expect(res.status).toBe(200);
        const replica = res.headers['x-replica'];
        expect(replica).toBeDefined();
        responses.push(replica as string);
      }

      // All responses should have same X-Replica value (sticky)
      const uniqueReplicas = [...new Set(responses)];
      expect(uniqueReplicas.length).toBe(1);
      expect(responses.length).toBe(50);
    }, 60000);

    it('Different client IPs sticky to their assigned replicas', async () => {
      if (!MULTI_REPLICA_MODE) return;

      const clientSessions = new Map<string, Set<string>>();

      // 3 clients, 10 requests each
      for (const clientIp of ['192.168.1.10', '192.168.1.20', '192.168.1.30']) {
        const replicas = new Set<string>();

        for (let i = 0; i < 10; i++) {
          const res = await request(NGINX_BASE_URL)
            .get('/api/health/live')
            .set('X-Forwarded-For', clientIp);

          const replica = res.headers['x-replica'];
          expect(replica).toBeDefined();
          replicas.add(replica as string);
        }

        clientSessions.set(clientIp, replicas);
      }

      // Each client should be sticky to exactly 1 replica
      for (const [clientIp, replicas] of clientSessions) {
        expect(replicas.size).toBe(1);
      }
    }, 60000);
  });

  describe('Load Distribution', () => {
    it('Requests from different IPs use different replicas', async () => {
      if (!MULTI_REPLICA_MODE) return;

      const replicasUsed = new Set<string>();

      // 20 requests, each from different IP
      for (let i = 0; i < 20; i++) {
        const res = await request(NGINX_BASE_URL)
          .get('/api/health/live')
          .set('X-Forwarded-For', `192.168.1.${100 + i}`);

        expect(res.status).toBe(200);
        const replica = res.headers['x-replica'];
        expect(replica).toBeDefined();
        replicasUsed.add(replica as string);
      }

      // With ip_hash and 2 replicas, should use both
      expect(replicasUsed.size).toBeGreaterThanOrEqual(2);
    }, 60000);
  });

  describe('Health Check Failover', () => {
    it('Health checks route through nginx with failover', async () => {
      if (!MULTI_REPLICA_MODE) return;

      const res = await request(NGINX_BASE_URL).get('/api/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.details).toBeDefined();
      expect(res.body.details.mainDatabase).toBeDefined();
      expect(res.body.details.redis).toBeDefined();
      expect(res.body.details.engine).toBeDefined();
    });

    it('Liveness checks include X-Replica header', async () => {
      if (!MULTI_REPLICA_MODE) return;

      const res = await request(NGINX_BASE_URL)
        .get('/api/health/live')
        .set('X-Forwarded-For', '192.168.1.50');

      expect(res.status).toBe(200);
      expect(res.headers['x-replica']).toBeDefined();
      expect(res.headers['x-replica']).toMatch(/openwa-api-scaled-\d+:2785/);
    });
  });

  describe('Single Replica Fallback', () => {
    it('Single-replica mode still works without nginx', async () => {
      if (MULTI_REPLICA_MODE) return;

      // This test runs in default profile (single replica)
      const res = await request('http://localhost:2785').get('/api/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
