import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BillingService } from './billing.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { Tenant } from '../tenant/tenant.entity';
import Stripe from 'stripe';

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;
  let billingService: jest.Mocked<BillingService>;
  let tenantService: jest.Mocked<TenantService>;
  let auditService: jest.Mocked<AuditService>;
  let mockStripe: jest.Mocked<Stripe>;

  const mockTenant: Partial<Tenant> = {
    id: 'tenant-123',
    name: 'Test Tenant',
    stripeCustomerId: 'cus_test123',
    plan: 'free',
  };

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

    mockStripe = {
      webhooks: {
        constructEvent: jest.fn(),
      },
    } as any;

    const mockBillingService = {
      getStripeClient: jest.fn().mockReturnValue(mockStripe),
    };

    const mockTenantService = {
      findByStripeCustomerId: jest.fn(),
      update: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: BillingService,
          useValue: mockBillingService,
        },
        {
          provide: TenantService,
          useValue: mockTenantService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    controller = module.get<StripeWebhookController>(StripeWebhookController);
    billingService = module.get(BillingService);
    tenantService = module.get(TenantService);
    auditService = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleWebhook', () => {
    const mockRequest = {
      rawBody: Buffer.from('test payload'),
    } as any;

    it('should throw BadRequestException when signature is missing', async () => {
      await expect(controller.handleWebhook(mockRequest, '')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when rawBody is missing', async () => {
      const reqWithoutRawBody = {} as any;
      await expect(controller.handleWebhook(reqWithoutRawBody, 'sig_test')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException on invalid signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(controller.handleWebhook(mockRequest, 'sig_invalid')).rejects.toThrow(BadRequestException);
    });

    it('should handle subscription.updated event and update tenant', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_test123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            metadata: { plan: 'pro' },
          } as Stripe.Subscription,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      tenantService.findByStripeCustomerId.mockResolvedValue(mockTenant as Tenant);
      tenantService.update.mockResolvedValue({} as any);

      const result = await controller.handleWebhook(mockRequest, 'sig_test');

      expect(result).toEqual({ received: true, status: 'processed' });
      expect(tenantService.update).toHaveBeenCalledWith('tenant-123', {
        plan: 'pro',
        stripeSubscriptionId: 'sub_test123',
        subscriptionStatus: 'active',
        quotaMessages: 10000,
        rateLimitPerMinute: 300,
      });
      expect(auditService.log).toHaveBeenCalledWith(AuditAction.SUBSCRIPTION_CHANGED, {
        metadata: {
          tenantId: 'tenant-123',
          subscriptionId: 'sub_test123',
          status: 'active',
          plan: 'pro',
        },
      });
    });

    it('should handle payment_failed event and set grace period', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_test456',
        type: 'invoice.payment_failed',
        data: {
          object: {
            id: 'in_test123',
            customer: 'cus_test123',
          } as Stripe.Invoice,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      tenantService.findByStripeCustomerId.mockResolvedValue(mockTenant as Tenant);
      tenantService.update.mockResolvedValue({} as any);

      const result = await controller.handleWebhook(mockRequest, 'sig_test');

      expect(result).toEqual({ received: true, status: 'processed' });
      expect(tenantService.update).toHaveBeenCalledWith('tenant-123', {
        paymentStatus: 'failed',
        gracePeriodEndsAt: expect.any(Date),
      });

      // Verify grace period is ~3 days from now
      const updateCall = tenantService.update.mock.calls[0][1];
      const gracePeriodDate = updateCall.gracePeriodEndsAt as Date;
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() + 3);
      const diffInHours = Math.abs(gracePeriodDate.getTime() - expectedDate.getTime()) / 1000 / 60 / 60;
      expect(diffInHours).toBeLessThan(1); // Within 1 hour tolerance
    });

    it('should skip duplicate events', async () => {
      const mockEvent: Stripe.Event = {
        id: 'evt_duplicate',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            customer: 'cus_test123',
            status: 'active',
            metadata: { plan: 'pro' },
          } as Stripe.Subscription,
        },
      } as any;

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      tenantService.findByStripeCustomerId.mockResolvedValue(mockTenant as Tenant);

      // First call - processes
      await controller.handleWebhook(mockRequest, 'sig_test');

      // Second call with same event ID - skips
      const result = await controller.handleWebhook(mockRequest, 'sig_test');

      expect(result).toEqual({ received: true, status: 'duplicate' });
      expect(tenantService.update).toHaveBeenCalledTimes(1); // Only called once
    });
  });
});
