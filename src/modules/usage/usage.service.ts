import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import Stripe from 'stripe';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { TenantService } from '../tenant/tenant.service';

/**
 * UsageService - Tracks message usage per tenant and emits Stripe billing meter events
 * Phase 09 Plan 03: Stripe billing integration
 *
 * Responsibilities:
 * - Track message.sent events in analytics_events table
 * - Emit Stripe billing meter events for usage-based billing
 * - Aggregate monthly usage per tenant
 */
@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);
  private readonly stripe: Stripe;

  constructor(
    private readonly cls: ClsService,
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly analyticsEventRepository: Repository<AnalyticsEvent>,
    private readonly tenantService: TenantService,
  ) {
    // Initialize Stripe client with secret key from environment
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      this.logger.warn('STRIPE_SECRET_KEY not set - Stripe meter events will be skipped');
    }
    this.stripe = new Stripe(stripeSecretKey || 'sk_test_dummy', {
      apiVersion: '2025-09-30.clover',
    });
  }

  /**
   * Track message sent event and emit Stripe billing meter event
   *
   * @param messageId - Message identifier
   * @param metadata - Optional metadata (sessionId, to, type, etc)
   */
  async trackMessageSent(messageId: string, metadata?: Record<string, any>): Promise<void> {
    try {
      // Read tenant ID from CLS context (set by ApiKeyGuard)
      const tenantId = this.cls.get<string>('tenantId');
      if (!tenantId) {
        this.logger.warn('No tenantId in CLS context - skipping usage tracking');
        return;
      }

      // Create analytics event row
      const event = this.analyticsEventRepository.create({
        tenant_id: tenantId,
        event_type: 'message.sent',
        payload: {
          messageId,
          ...metadata,
        },
        created_at: new Date(),
      });

      await this.analyticsEventRepository.save(event);
      this.logger.debug(`Tracked message.sent event for tenant ${tenantId}: ${messageId}`);

      // Fetch tenant to get Stripe customer ID
      const tenant = await this.tenantService.findById(tenantId);
      if (!tenant) {
        this.logger.warn(`Tenant ${tenantId} not found - skipping Stripe meter event`);
        return;
      }

      // Emit Stripe billing meter event if tenant has Stripe customer ID
      if (tenant.stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
        try {
          await this.stripe.billing.meterEvents.create({
            event_name: 'whatsapp.message.sent',
            payload: {
              stripe_customer_id: tenant.stripeCustomerId,
              value: '1', // message_count increment
            },
            identifier: `msg-${messageId}`,
            timestamp: Math.floor(Date.now() / 1000),
          });
          this.logger.debug(
            `Emitted Stripe meter event for tenant ${tenantId} (customer ${tenant.stripeCustomerId})`,
          );
        } catch (stripeError) {
          // Log Stripe error but do NOT throw - usage tracking should not block message sending
          this.logger.error(
            `Failed to emit Stripe meter event for tenant ${tenantId}: ${stripeError}`,
          );
        }
      }
    } catch (error) {
      // Log error but do NOT throw - usage tracking should not block message sending
      this.logger.error(`Failed to track message usage: ${error}`);
    }
  }

  /**
   * Get current month usage aggregation for a tenant
   *
   * @param tenantId - Tenant identifier
   * @returns Usage stats (messages, tokens, cost)
   */
  async getCurrentMonthUsage(
    tenantId: string,
  ): Promise<{ messages: number; tokens: number; cost: number }> {
    const result = await this.analyticsEventRepository
      .createQueryBuilder('event')
      .select('COUNT(*)', 'messages')
      .addSelect('COALESCE(SUM(event.tokens_used), 0)', 'tokens')
      .addSelect('COALESCE(SUM(event.cost_usd), 0)', 'cost')
      .where('event.tenant_id = :tenantId', { tenantId })
      .andWhere("event.event_type = 'message.sent'")
      .andWhere("event.created_at >= date_trunc('month', CURRENT_DATE)")
      .andWhere("event.created_at < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'")
      .getRawOne();

    return {
      messages: parseInt(result?.messages || '0', 10),
      tokens: parseFloat(result?.tokens || '0'),
      cost: parseFloat(result?.cost || '0'),
    };
  }
}
