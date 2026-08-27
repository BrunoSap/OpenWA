import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';
import { BillingService } from './billing.service';
import { TenantService } from '../tenant/tenant.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { Public } from '../auth/decorators/auth.decorators';

/**
 * Raw body request type for Stripe webhook signature verification
 */
interface RawBodyRequest<T extends Request = Request> extends Request {
  rawBody?: Buffer;
}

/**
 * StripeWebhookController - Handles Stripe webhook events
 * Phase 09 Plan 03: Stripe billing integration
 *
 * Handles:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - invoice.paid
 * - invoice.payment_failed
 */
@Controller('webhooks/stripe')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);
  private readonly processedEvents = new Set<string>(); // TODO: Move to Redis for production
  private readonly stripe: Stripe;

  constructor(
    private readonly billingService: BillingService,
    private readonly tenantService: TenantService,
    private readonly auditService: AuditService,
  ) {
    this.stripe = this.billingService.getStripeClient();
  }

  @Post()
  @Public()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true; status: string }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    if (!req.rawBody) {
      throw new BadRequestException('Missing raw body - ensure raw body parser is configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured');
      throw new HttpException('Webhook secret not configured', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(req.rawBody, signature, webhookSecret);
    } catch (err) {
      this.logger.error(`Webhook signature verification failed: ${err}`);
      throw new BadRequestException('Invalid signature');
    }

    // Idempotency check
    if (this.processedEvents.has(event.id)) {
      this.logger.debug(`Event ${event.id} already processed - skipping`);
      return { received: true, status: 'duplicate' };
    }

    this.logger.log(`Processing webhook event ${event.id}: ${event.type}`);

    // Route event to appropriate handler
    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionChanged(event);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event);
          break;
        case 'invoice.paid':
          await this.handleInvoicePaid(event);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event);
          break;
        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      this.processedEvents.add(event.id);

      return { received: true, status: 'processed' };
    } catch (error) {
      this.logger.error(`Failed to process webhook event ${event.id}: ${error}`);
      throw new HttpException('Webhook processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Handle subscription.created and subscription.updated events
   */
  private async handleSubscriptionChanged(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const tenant = await this.tenantService.findByStripeCustomerId(customerId);
    if (!tenant) {
      this.logger.warn(`Tenant not found for Stripe customer ${customerId}`);
      return;
    }

    const plan = subscription.metadata.plan || 'free';
    const quotaMessages = this.getQuotaForPlan(plan);
    const rateLimitPerMinute = this.getRateLimitForPlan(plan);

    await this.tenantService.update(tenant.id, {
      plan,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      quotaMessages,
      rateLimitPerMinute,
    });

    await this.auditService.log(AuditAction.SUBSCRIPTION_CHANGED, {
      metadata: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        status: subscription.status,
        plan,
      },
    });

    this.logger.log(`Updated tenant ${tenant.id} subscription: ${subscription.status}, plan: ${plan}`);
  }

  /**
   * Handle subscription.deleted event
   */
  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = subscription.customer as string;

    const tenant = await this.tenantService.findByStripeCustomerId(customerId);
    if (!tenant) {
      this.logger.warn(`Tenant not found for Stripe customer ${customerId}`);
      return;
    }

    // Downgrade to free plan
    await this.tenantService.update(tenant.id, {
      plan: 'free',
      subscriptionStatus: 'canceled',
      quotaMessages: this.getQuotaForPlan('free'),
      rateLimitPerMinute: this.getRateLimitForPlan('free'),
    });

    await this.auditService.log(AuditAction.SUBSCRIPTION_DELETED, {
      metadata: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
      },
    });

    this.logger.log(`Downgraded tenant ${tenant.id} to free plan (subscription deleted)`);
  }

  /**
   * Handle invoice.paid event
   */
  private async handleInvoicePaid(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;

    const tenant = await this.tenantService.findByStripeCustomerId(customerId);
    if (!tenant) {
      this.logger.warn(`Tenant not found for Stripe customer ${customerId}`);
      return;
    }

    // Clear grace period and update payment status
    await this.tenantService.update(tenant.id, {
      paymentStatus: 'paid',
      gracePeriodEndsAt: null,
    });

    await this.auditService.log(AuditAction.INVOICE_PAID, {
      metadata: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        amount: invoice.amount_paid,
      },
    });

    this.logger.log(`Invoice paid for tenant ${tenant.id}: ${invoice.id}`);
  }

  /**
   * Handle invoice.payment_failed event
   */
  private async handlePaymentFailed(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const customerId = invoice.customer as string;

    const tenant = await this.tenantService.findByStripeCustomerId(customerId);
    if (!tenant) {
      this.logger.warn(`Tenant not found for Stripe customer ${customerId}`);
      return;
    }

    // Set 3-day grace period
    const gracePeriodEndsAt = new Date();
    gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + 3);

    await this.tenantService.update(tenant.id, {
      paymentStatus: 'failed',
      gracePeriodEndsAt,
    });

    await this.auditService.log(AuditAction.PAYMENT_FAILED, {
      metadata: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
      },
    });

    // TODO: Schedule BullMQ job 'downgrade-tenant' with 3-day delay
    // TODO: Send email notification via EmailService

    this.logger.warn(
      `Payment failed for tenant ${tenant.id}, grace period until ${gracePeriodEndsAt.toISOString()}`,
    );
  }

  /**
   * Get message quota for a plan tier
   */
  private getQuotaForPlan(plan: string): number {
    const quotas: Record<string, number> = {
      free: 100,
      starter: 1000,
      pro: 10000,
      enterprise: 100000,
    };
    return quotas[plan] ?? 100;
  }

  /**
   * Get rate limit (requests per minute) for a plan tier
   */
  private getRateLimitForPlan(plan: string): number {
    const limits: Record<string, number> = {
      free: 10,
      starter: 60,
      pro: 300,
      enterprise: 1000,
    };
    return limits[plan] ?? 10;
  }
}
