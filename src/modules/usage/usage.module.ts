import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageService } from './usage.service';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { TenantModule } from '../tenant/tenant.module';

/**
 * UsageModule - Tracks message usage and emits Stripe billing meter events
 * Phase 09 Plan 03: Stripe billing integration
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent], 'dataConnection'),
    TenantModule,
  ],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
