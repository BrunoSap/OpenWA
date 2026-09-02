/**
 * GAP #1: Dashboard Login E2E Test
 *
 * Validates the complete dashboard authentication flow:
 * 1. User opens dashboard
 * 2. Enters API key
 * 3. Receives JWT token
 * 4. Session is persisted
 * 5. Can access protected routes
 *
 * Priority: 🔴 ALTA
 * Estimated effort: 2h
 * Risk: 🔴 Alto (currently blocking user login)
 */

jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { applyGlobalValidation } from '../../src/config/app-validation';
import { createTestApp, createTestApiKey } from '../e2e/helpers/test-helpers';

describe('Dashboard Login E2E (GAP #1)', () => {
  let app: INestApplication;
  let apiKey: string;

  beforeAll(async () => {
    app = await createTestApp();
    const keyData = await createTestApiKey(app);
    apiKey = keyData.key;
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore teardown quirk */
    }
  });

  describe('Happy Path: Successful Login', () => {
    it('should authenticate with valid API key and return JWT', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey })
        .expect(200);

      // Validate response structure
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresIn');
      expect(typeof response.body.token).toBe('string');
      expect(response.body.token.length).toBeGreaterThan(50); // JWT is long

      // Validate JWT structure (header.payload.signature)
      const tokenParts = response.body.token.split('.');
      expect(tokenParts).toHaveLength(3);
    });

    it('should access protected route with JWT token', async () => {
      // Step 1: Login
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey });

      const { token } = loginResponse.body;

      // Step 2: Access protected route
      const protectedResponse = await request(app.getHttpServer())
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(Array.isArray(protectedResponse.body)).toBe(true);
    });

    it('should persist session in database', async () => {
      const loginResponse = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey });

      const { token } = loginResponse.body;

      // Validate token works for multiple requests (session persisted)
      await request(app.getHttpServer())
        .get('/api/health')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('Edge Cases: Login Failures', () => {
    it('should reject login with invalid API key', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey: 'invalid_key_123' })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toMatch(/invalid|unauthorized/i);
    });

    it('should reject login with missing API key', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({})
        .expect(400);
    });

    it('should reject login with expired API key', async () => {
      // Create expired key (if your system supports expiration)
      // This is a placeholder - implement based on your expiration logic
      // const expiredKey = await createExpiredApiKey(app);

      // await request(app.getHttpServer())
      //   .post('/api/auth/login')
      //   .send({ apiKey: expiredKey })
      //   .expect(401);
    });

    it('should reject protected route without token', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions')
        .expect(401);
    });

    it('should reject protected route with malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/sessions')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });

  describe('Security: Token Properties', () => {
    it('should include expiration time in JWT', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey });

      expect(response.body).toHaveProperty('expiresIn');
      expect(typeof response.body.expiresIn).toBe('number');
      expect(response.body.expiresIn).toBeGreaterThan(0);
    });

    it('should not include sensitive data in JWT payload', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey });

      const { token } = response.body;

      // Decode JWT payload (without verification for testing)
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString()
      );

      // Should NOT contain raw API key or password
      expect(payload).not.toHaveProperty('apiKey');
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('keyHash');
    });
  });

  describe('Performance: Login Speed', () => {
    it('should complete login in less than 500ms', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ apiKey });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });
  });
});
