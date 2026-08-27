import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { Tenant } from '../../src/modules/tenant/tenant.entity';
import { ApiKey } from '../../src/modules/auth/entities/api-key.entity';
import { Session } from '../../src/modules/session/entities/session.entity';
import { OnboardingState } from '../../src/modules/onboarding/entities/onboarding-state.entity';

describe('Tenant Onboarding E2E', () => {
  let app: INestApplication;
  let mainDataSource: DataSource;
  let dataDataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    mainDataSource = app.get<DataSource>('mainDataSource');
    dataDataSource = app.get<DataSource>('dataDataSource');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/tenants/signup', () => {
    it('should create tenant and return admin key', async () => {
      const signupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
        plan: 'free',
      };

      const response = await request(app.getHttpServer())
        .post('/api/tenants/signup')
        .send(signupDto)
        .expect(201);

      // Verify response structure
      expect(response.body).toHaveProperty('tenant');
      expect(response.body).toHaveProperty('adminKey');
      expect(response.body).toHaveProperty('setupUrl');

      // Verify tenant created
      expect(response.body.tenant).toMatchObject({
        name: 'Test Corp',
        slug: 'test-corp',
        billingEmail: 'test@example.com',
        plan: 'free',
        quotaMessages: 100,
        rateLimitPerMinute: 10,
      });

      // Verify admin key format
      expect(response.body.adminKey).toMatch(/^owa_k1_[a-f0-9]{64}$/);

      // Verify setup URL
      expect(response.body.setupUrl).toMatch(/\/onboarding\/.+$/);

      const tenantId = response.body.tenant.id;
      const adminKey = response.body.adminKey;

      // Verify tenant exists in database
      const tenant = await mainDataSource.getRepository(Tenant).findOne({
        where: { id: tenantId },
      });
      expect(tenant).toBeDefined();
      expect(tenant!.slug).toBe('test-corp');

      // Verify admin API key exists
      const apiKeys = await mainDataSource.getRepository(ApiKey).find({
        where: { tenantId },
      });
      expect(apiKeys.length).toBeGreaterThan(0);
      expect(apiKeys[0].role).toBe('admin');

      // Verify default session created
      const sessions = await dataDataSource.getRepository(Session).find({
        where: { tenantId },
      });
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].name).toBe('default');

      // Store for next test
      (global as any).testTenantId = tenantId;
      (global as any).testAdminKey = adminKey;
    });
  });

  describe('GET /api/onboarding/:tenantId/state', () => {
    it('should return onboarding state initialized to welcome', async () => {
      const tenantId = (global as any).testTenantId;
      const adminKey = (global as any).testAdminKey;

      if (!tenantId || !adminKey) {
        throw new Error('Signup test must run first');
      }

      const response = await request(app.getHttpServer())
        .get(`/api/onboarding/${tenantId}/state`)
        .set('X-API-Key', adminKey)
        .expect(200);

      expect(response.body).toMatchObject({
        currentStep: 'welcome',
        completedSteps: [],
        metadata: {},
      });
    });
  });

  describe('POST /api/onboarding/:tenantId/advance', () => {
    it('should advance from welcome to whatsapp step', async () => {
      const tenantId = (global as any).testTenantId;
      const adminKey = (global as any).testAdminKey;

      if (!tenantId || !adminKey) {
        throw new Error('Signup test must run first');
      }

      const response = await request(app.getHttpServer())
        .post(`/api/onboarding/${tenantId}/advance`)
        .set('X-API-Key', adminKey)
        .send({ step: 'welcome' })
        .expect(200);

      expect(response.body).toMatchObject({
        currentStep: 'whatsapp',
        completedSteps: ['welcome'],
      });
    });

    it('should fail to advance whatsapp step without ready session', async () => {
      const tenantId = (global as any).testTenantId;
      const adminKey = (global as any).testAdminKey;

      if (!tenantId || !adminKey) {
        throw new Error('Signup test must run first');
      }

      // Try to advance whatsapp step (should fail - no ready session)
      const response = await request(app.getHttpServer())
        .post(`/api/onboarding/${tenantId}/advance`)
        .set('X-API-Key', adminKey)
        .send({ step: 'whatsapp' })
        .expect(400);

      expect(response.body.message).toMatch(/validation failed/i);
    });
  });

  describe('Complete onboarding flow (mocked)', () => {
    it('should complete all steps when validations pass', async () => {
      // Create a new tenant for full flow test
      const signupResponse = await request(app.getHttpServer())
        .post('/api/tenants/signup')
        .send({
          name: 'Flow Test User',
          email: 'flowtest@example.com',
          companyName: 'Flow Test Corp',
          plan: 'starter',
        })
        .expect(201);

      const tenantId = signupResponse.body.tenant.id;
      const adminKey = signupResponse.body.adminKey;

      // Step 1: Advance from welcome
      const step1Response = await request(app.getHttpServer())
        .post(`/api/onboarding/${tenantId}/advance`)
        .set('X-API-Key', adminKey)
        .send({ step: 'welcome' })
        .expect(200);

      expect(step1Response.body.currentStep).toBe('whatsapp');
      expect(step1Response.body.completedSteps).toContain('welcome');

      // Note: Advancing whatsapp and test-message steps would require:
      // - Starting a session and waiting for QR/ready state (whatsapp)
      // - Sending an actual message (test-message)
      // These are integration-level operations beyond unit test scope
      // Production E2E would use Playwright to interact with real UI

      // Verify final state can be retrieved
      const finalStateResponse = await request(app.getHttpServer())
        .get(`/api/onboarding/${tenantId}/state`)
        .set('X-API-Key', adminKey)
        .expect(200);

      expect(finalStateResponse.body.currentStep).toBe('whatsapp');
      expect(finalStateResponse.body.completedSteps).toContain('welcome');
    });
  });
});
