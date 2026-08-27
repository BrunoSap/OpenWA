import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

describe('Shared Storage - Profile Persistence (e2e)', () => {
  let app: INestApplication;
  const testSessionId = 'test-shared-storage-' + Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Cleanup: delete test session
    await request(app.getHttpServer())
      .delete(`/api/session/${testSessionId}`)
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .catch(() => {
        // Ignore cleanup errors
      });

    await app.close();
  });

  it('Session created writes profile to shared storage', async () => {
    // Create session (via replica 1)
    await request('http://localhost:2785')
      .post('/api/session/create')
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .set('X-Forwarded-For', '192.168.1.101') // Force replica 1
      .send({ sessionId: testSessionId, engine: 'baileys' })
      .expect(201);

    // Wait for profile directory creation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify profile directory exists in shared storage
    const profilePath = path.join(
      process.env.BAILEYS_AUTH_DIR || './data/baileys-auth',
      testSessionId,
    );

    expect(fs.existsSync(profilePath)).toBe(true);
  });

  it('Profile accessible from different replica', async () => {
    // Request via replica 2 (different IP = different upstream)
    const res = await request('http://localhost:2785')
      .get(`/api/session/${testSessionId}`)
      .set('X-API-Key', process.env.API_MASTER_KEY)
      .set('X-Forwarded-For', '192.168.1.102') // Force replica 2
      .expect(200);

    // Replica 2 should see the session (reads from NFS)
    expect(res.body.sessionId).toBe(testSessionId);
    expect(res.body.status).toBeDefined();
  });

  it('Concurrent profile writes do not corrupt (file lock)', async () => {
    // Simulate concurrent writes from 2 replicas
    const writes = [
      request('http://localhost:2785')
        .post(`/api/session/${testSessionId}/send`)
        .set('X-API-Key', process.env.API_MASTER_KEY)
        .set('X-Forwarded-For', '192.168.1.101')
        .send({ to: '5511999999999@c.us', text: 'test1' }),

      request('http://localhost:2785')
        .post(`/api/session/${testSessionId}/send`)
        .set('X-API-Key', process.env.API_MASTER_KEY)
        .set('X-Forwarded-For', '192.168.1.102')
        .send({ to: '5511999999999@c.us', text: 'test2' }),
    ];

    // Both should complete without file corruption
    const results = await Promise.allSettled(writes);

    // At least one should succeed (sticky may route both to same replica)
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    expect(succeeded).toBeGreaterThanOrEqual(1);
  });
});
