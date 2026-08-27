import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsEventListener } from './listeners/analytics-event.listener';
import { AnalyticsController } from './analytics.controller';

/**
 * Phase 6 Plan 01: Analytics module for event-driven metrics collection (DASH-05).
 *
 * Wires the AnalyticsEventsService with its repository on the named 'data' connection.
 * The forFeature connection arg is mandatory — it makes @InjectRepository(AnalyticsEvent, 'data') resolve.
 *
 * Listener consumes domain events (message.processed, session.created, etc) emitted by services
 * and persists them to analytics_events when ANALYTICS_ENABLED=true. Controller exposes REST
 * endpoints for dashboard/n8n consumption (OPERATOR role required).
 *
 * Service is exported so future plans (aggregations, KPIs, dashboard) can reuse it.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AnalyticsEvent], 'data')],
  controllers: [AnalyticsController],
  providers: [AnalyticsEventsService, AnalyticsEventListener],
  exports: [AnalyticsEventsService],
})
export class AnalyticsModule {}
