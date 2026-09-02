/**
 * GAP #3: Billing Stripe Integration E2E Test
 *
 * Validates complete billing flow with Stripe:
 * 1. Tenant consumes resources (LLM tokens, messages)
 * 2. UsageService records consumption
 * 3. Stripe meter events are sent
 * 4. Subscription management works
 * 5. Grace period enforcement
 *
 * Priority: 🔴 ALTA
 * Estimated effort: 6h
 * Risk: 🔴 Alto (revenue-critical feature)
 */

jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  createTestApiKey,
  createTestTenant,
  waitForCondition,
} from '../e2e/helpers/test-helpers';
import Stripe from 'stripe';

describe('Billing Stripe Integration E2E (GAP #3)', () => {
  let app: INestApplication;
  let apiKey: string;
  let tenantId: string;
  let stripeClient: Stripe;

  beforeAll(async () => {
    app = await createTestApp();
    const keyData = await createTestApiKey(app);
    apiKey = keyData.key;

    tenantId = await createTestTenant(app, {
      name: 'Test Billing Tenant',
      email: 'billing-test@example.com',
    });

    // Initialize Stripe client for verification
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (stripeSecretKey) {
      stripeClient = new Stripe(stripeSecretKey, {
        apiVersion: '2024-06-20',
      });
    }
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore teardown quirk */
    }
  });

  describe('Happy Path: Usage Recording', () => {
    it('should record LLM token usage', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          resourceType: 'llm_tokens',
          quantity: 1000,
          metadata: {
            model: 'claude-sonnet-4',
            provider: 'anthropic',
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.quantity).toBe(1000);
      expect(response.body.tenantId).toBe(tenantId);
    });

    it('should record message send usage', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          resourceType: 'messages_sent',
          quantity: 1,
        })
        .expect(201);

      expect(response.body.resourceType).toBe('messages_sent');
    });

    it('should aggregate usage by tenant', async () => {
      // Record multiple usage events
      await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({ tenantId, resourceType: 'llm_tokens', quantity: 500 });

      await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({ tenantId, resourceType: 'llm_tokens', quantity: 300 });

      // Get aggregated usage
      const response = await request(app.getHttpServer())
        .get(`/api/usage/aggregate?tenantId=${tenantId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      const llmUsage = response.body.find(
        (u: any) => u.resourceType === 'llm_tokens'
      );
      expect(llmUsage.totalQuantity).toBeGreaterThanOrEqual(800);
    });
  });

  describe('Integration: Stripe Meter Events', () => {
    it('should send meter event to Stripe when usage recorded', async function() {
      if (!process.env.STRIPE_SECRET_KEY) {
        this.skip(); // Skip if Stripe not configured
        return;
      }

      // Record usage
      await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          resourceType: 'llm_tokens',
          quantity: 1000,
          metadata: {
            model: 'claude-sonnet-4',
          },
        });

      // Wait for async Stripe event processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify event in Stripe (requires Stripe test key)
      // Note: In real test, you'd check Stripe events API
      // This is a placeholder for the actual implementation
      const events = await stripeClient.billing.meterEvents.list({
        limit: 10,
      });

      const matchingEvent = events.data.find(
        (e) => e.identifier === tenantId && e.payload?.value === 1000
      );

      expect(matchingEvent).toBeTruthy();
    });
  });

  describe('Happy Path: Subscription Management', () => {
    it('should create subscription for tenant', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/billing/subscriptions')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          priceId: 'price_test_monthly',
        })
        .expect(201);

      expect(response.body).toHaveProperty('subscriptionId');
      expect(response.body.status).toBe('active');
    });

    it('should retrieve tenant subscription status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/billing/subscriptions/${tenantId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('currentPeriodEnd');
    });

    it('should cancel subscription', async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/billing/subscriptions/${tenantId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body.status).toMatch(/canceled|cancelled/i);
    });
  });

  describe('Edge Cases: Grace Period Enforcement', () => {
    it('should allow API access during grace period', async () => {
      // Set subscription to expired with grace period
      await request(app.getHttpServer())
        .patch(`/api/tenants/${tenantId}`)
        .set('x-api-key', apiKey)
        .send({
          subscriptionStatus: 'past_due',
          gracePeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });

      // Should still work during grace period
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .set('x-tenant-id', tenantId)
        .send({
          to: '5511999999999',
          body: 'Test during grace period',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
    });

    it('should block API access after grace period', async () => {
      // Set subscription to expired past grace period
      await request(app.getHttpServer())
        .patch(`/api/tenants/${tenantId}`)
        .set('x-api-key', apiKey)
        .send({
          subscriptionStatus: 'past_due',
          gracePeriodEndsAt: new Date(Date.now() - 1000), // Already expired
        });

      // Should return 402 Payment Required
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .set('x-tenant-id', tenantId)
        .send({
          to: '5511999999999',
          body: 'Test after grace period',
        })
        .expect(402);

      expect(response.body.message).toMatch(/payment|subscription|expired/i);
    });
  });

  describe('Edge Cases: Usage Limits', () => {
    it('should enforce monthly usage limits', async () => {
      // Set tenant to have 100 token limit
      await request(app.getHttpServer())
        .patch(`/api/tenants/${tenantId}`)
        .set('x-api-key', apiKey)
        .send({
          usageLimits: {
            llm_tokens: 100,
          },
        });

      // Consume 90 tokens - should work
      await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          resourceType: 'llm_tokens',
          quantity: 90,
        })
        .expect(201);

      // Consume 20 more tokens - should fail (exceeds limit)
      const response = await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          resourceType: 'llm_tokens',
          quantity: 20,
        })
        .expect(429);

      expect(response.body.message).toMatch(/limit|exceeded|quota/i);
    });
  });

  describe('Integration: Billing Dashboard', () => {
    it('should return usage breakdown for billing period', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/billing/usage/${tenantId}?period=current`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('periodStart');
      expect(response.body).toHaveProperty('periodEnd');
      expect(response.body).toHaveProperty('usage');
      expect(Array.isArray(response.body.usage)).toBe(true);
    });

    it('should calculate estimated cost', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/billing/estimate/${tenantId}`)
        .set('x-api-key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('estimatedCost');
      expect(response.body).toHaveProperty('currency');
      expect(response.body.currency).toBe('USD');
    });
  });

  describe('Webhook: Stripe Events', () => {
    it('should handle subscription.created webhook', async () => {
      const stripeEvent = {
        type: 'customer.subscription.created',
        data: {
          object: {
            id: 'sub_test123',
            customer: tenantId,
            status: 'active',
          },
        },
      };

      const response = await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .send(stripeEvent)
        .expect(200);

      expect(response.body.received).toBe(true);
    });

    it('should handle invoice.payment_failed webhook', async () => {
      const stripeEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            customer: tenantId,
            attempt_count: 1,
          },
        },
      };

      await request(app.getHttpServer())
        .post('/api/webhooks/stripe')
        .send(stripeEvent)
        .expect(200);

      // Verify tenant status updated
      const tenant = await request(app.getHttpServer())
        .get(`/api/tenants/${tenantId}`)
        .set('x-api-key', apiKey);

      expect(tenant.body.subscriptionStatus).toBe('past_due');
    });
  });

  describe('Performance: Usage Recording Speed', () => {
    it('should record usage in less than 100ms', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .post('/api/usage')
        .set('x-api-key', apiKey)
        .send({
          tenantId,
          resourceType: 'llm_tokens',
          quantity: 100,
        });

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should handle 100 concurrent usage records', async () => {
      const records = Array.from({ length: 100 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/usage')
          .set('x-api-key', apiKey)
          .send({
            tenantId,
            resourceType: 'llm_tokens',
            quantity: 10,
          })
      );

      const responses = await Promise.all(records);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
      });
    });
  });
});
