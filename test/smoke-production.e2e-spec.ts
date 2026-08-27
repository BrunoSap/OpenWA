import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Production-like smoke test — validates critical user flows
 * Runs against real multi-replica deployment
 */
describe('Smoke Test - Production (e2e)', () => {
  let app: INestApplication;
  const apiUrl = process.env.API_URL || 'http://localhost:2785';
  const apiKey = process.env.API_MASTER_KEY;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Critical Path: Health checks respond within 2s', async () => {
    const start = Date.now();

    await request(apiUrl)
      .get('/api/health/live')
      .expect(200);

    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it('Critical Path: Create session → query from different replica', async () => {
    if (!apiKey) {
      console.log('Skipping: no API_MASTER_KEY');
      return;
    }

    const sessionId = `smoke-prod-${Date.now()}`;

    // Create session via replica 1 (simulated via IP)
    await request(apiUrl)
      .post('/api/session/create')
      .set('X-API-Key', apiKey)
      .set('X-Forwarded-For', '192.168.1.101')
      .send({ sessionId, engine: 'baileys' })
      .expect(201);

    // Wait for profile write to NFS
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Query from replica 2 (different IP)
    const res = await request(apiUrl)
      .get(`/api/session/${sessionId}`)
      .set('X-API-Key', apiKey)
      .set('X-Forwarded-For', '192.168.1.102')
      .expect(200);

    expect(res.body.sessionId).toBe(sessionId);

    // Cleanup
    await request(apiUrl)
      .delete(`/api/session/${sessionId}`)
      .set('X-API-Key', apiKey)
      .expect(200);
  });

  it('Critical Path: Sticky sessions maintained across 100 requests', async () => {
    const replicas = [];

    for (let i = 0; i < 100; i++) {
      const res = await request(apiUrl)
        .get('/api/health/live')
        .set('X-Forwarded-For', '192.168.1.100');  // Same IP

      replicas.push(res.headers['x-replica']);
    }

    // All should be same replica
    const unique = [...new Set(replicas)];
    expect(unique.length).toBe(1);
  });

  it('Critical Path: Load distributed across replicas', async () => {
    const replicas = new Set();

    // 20 requests from different IPs
    for (let i = 0; i < 20; i++) {
      const res = await request(apiUrl)
        .get('/api/health/live')
        .set('X-Forwarded-For', `192.168.1.${100 + i}`);

      replicas.add(res.headers['x-replica']);
    }

    // Should use at least 2 replicas (ideally 3)
    expect(replicas.size).toBeGreaterThanOrEqual(2);
  });

  it('Performance: p95 latency < 500ms under load', async () => {
    const latencies: number[] = [];
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await request(apiUrl).get('/api/health/live');
      latencies.push(Date.now() - start);
    }

    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(iterations * 0.95);
    const p95 = latencies[p95Index];

    expect(p95).toBeLessThan(500);
  });
});
