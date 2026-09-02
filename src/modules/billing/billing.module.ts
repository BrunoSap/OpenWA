import { Module, forwardRef } from '@nestjs/common';
import { BillingService } from './billing.service';
import { StripeWebhookController } from './stripe-webhook.controller';
import { TenantModule } from '../tenant/tenant.module';
import { AuditModule } from '../audit/audit.module';

/**
 * BillingModule - Stripe billing integration
 * Phase 09 Plan 03: Stripe billing integration
 */
@Module({
  imports: [forwardRef(() => TenantModule), AuditModule],
  controllers: [StripeWebhookController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
