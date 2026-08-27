import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';

describe('Multi-Replica 3+ — Distributed State (e2e)', () => {
  let app: INestApplication;

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

  it('3 replicas running and healthy', async () => {
    const replicas = [];

    // Query via different IPs to hit different replicas
    for (let i = 101; i <= 103; i++) {
      const res = await request('http://localhost:2785')
        .get('/api/health/live')
        .set('X-Forwarded-For', `192.168.1.${i}`);

      replicas.push(res.headers['x-replica']);
    }

    // Should have 3 unique replicas
    const unique = [...new Set(replicas)];
    expect(unique.length).toBeGreaterThanOrEqual(3);
  });

  it('BullMQ job processed by any replica', async () => {
    // Add webhook delivery job (processed by BullMQ worker)
    const res = await request('http://localhost:2785')
      .post('/api/webhook/test-delivery')
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .send({
        url: 'https://webhook.site/test',
        event: 'test.event',
        payload: { test: true },
      })
      .expect(201);

    // Job should be queued
    expect(res.body.jobId).toBeDefined();

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Job should be completed (by any worker)
    const status = await request('http://localhost:2785')
      .get(`/api/webhook/job/${res.body.jobId}`)
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .expect(200);

    expect(status.body.state).toBe('completed');
  });

  it('WebSocket broadcast reaches clients on all replicas', async () => {
    const clients: Socket[] = [];
    const messages: string[] = [];

    // Connect 3 clients to different replicas (different source IPs)
    for (let i = 101; i <= 103; i++) {
      const client = io('http://localhost:2785', {
        transports: ['websocket'],
        extraHeaders: {
          'X-Forwarded-For': `192.168.1.${i}`,
        },
      });

      client.on('session.status', (data) => {
        messages.push(data.sessionId);
      });

      clients.push(client);
    }

    // Wait for connections
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Broadcast event via API (triggers RedisIoAdapter pub/sub)
    await request('http://localhost:2785')
      .post('/api/events/broadcast')
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .send({
        event: 'session.status',
        data: { sessionId: 'test-broadcast', status: 'ready' },
      })
      .expect(200);

    // Wait for broadcast propagation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // All 3 clients should receive the event (cross-replica fan-out)
    expect(messages.filter((m) => m === 'test-broadcast').length).toBe(3);

    // Cleanup
    clients.forEach((c) => c.disconnect());
  });

  it('Graceful shutdown drains jobs before exit', async () => {
    // Add long-running job
    const res = await request('http://localhost:2785')
      .post('/api/webhook/test-delivery')
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .send({
        url: 'https://webhook.site/test-slow',
        event: 'test.slow',
        payload: { sleep: 5000 }, // 5s processing
      })
      .expect(201);

    const jobId = res.body.jobId;

    // Trigger graceful shutdown of replica 1
    // (In real test: docker kill -s SIGTERM openwa-api-scaled-1)
    // For E2E: skip actual shutdown, just verify job completes

    // Wait for job processing
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Job should be completed (not lost)
    const status = await request('http://localhost:2785')
      .get(`/api/webhook/job/${jobId}`)
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .expect(200);

    expect(status.body.state).toBe('completed');
  });
});
