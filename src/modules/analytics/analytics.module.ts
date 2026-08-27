import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAggregate } from './entities/analytics-aggregate.entity';
import { AnalyticsAlertRule } from './entities/analytics-alert-rule.entity';
import { AnalyticsIntentTaxonomy } from './entities/analytics-intent-taxonomy.entity';
import { AnalyticsIntentClassification } from './entities/analytics-intent-classification.entity';
import { AnalyticsIntentRoutingRule } from './entities/analytics-intent-routing-rule.entity';
import { AnalyticsABExperiment } from './entities/analytics-ab-experiment.entity';
import { AnalyticsSatisfactionResponse } from './entities/analytics-satisfaction-response.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsAggregationService } from './services/analytics-aggregation.service';
import { AnalyticsExportService } from './services/analytics-export.service';
import { AnalyticsAlertService } from './services/analytics-alert.service';
import { AlertDispatchService } from './services/alert-dispatch.service';
import { IntentClassificationService } from './services/intent-classification.service';
import { ABTestingService } from './services/ab-testing.service';
import { SatisfactionSurveyService } from './services/satisfaction-survey.service';
import { AnalyticsEventListener } from './listeners/analytics-event.listener';
import { AnalyticsAggregationProcessor } from './processors/analytics-aggregation.processor';
import { AnalyticsCleanupProcessor } from './processors/analytics-cleanup.processor';
import { AnalyticsAlertProcessor } from './processors/analytics-alert.processor';
import { IntentClassificationProcessor } from './processors/intent-classification.processor';
import { AnalyticsController } from './analytics.controller';
import { QUEUE_NAMES } from '../queue/queue-names';
import { createLogger } from '../../common/services/logger.service';

/**
 * Phase 6 Plans 01 + 02b + 03: Analytics module for event-driven metrics collection and aggregation.
 * Phase 10 Plan 01: Intent classification via Anthropic Batch API (DASH-03).
 *
 * Plan 01: Event collection (analytics_events) via EventEmitter2 listeners.
 * Plan 02b: Daily aggregation (analytics_aggregates) and retention cleanup via BullMQ.
 * Plan 03: Export service + SSE stream + alert rules + dispatch.
 * Phase 10 Plan 01: Intent classification (analytics_intent_taxonomies, analytics_intent_classifications).
 *
 * Wires five entities on the 'data' connection. Registers the ANALYTICS queue and enqueues
 * four repeatable jobs at module init:
 * - Aggregation job: daily at 1 AM (computes yesterday's KPIs)
 * - Cleanup job: daily at 2 AM (deletes raw events older than ANALYTICS_RETENTION_DAYS)
 * - Alert evaluation job: every 5 minutes (evaluates alert rules and dispatches notifications)
 * - Intent classification job: hourly at minute 0 (batch-classifies unclassified messages)
 *
 * Uses BullMQ repeatable jobs, NOT @nestjs/schedule (not installed).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        AnalyticsEvent,
        AnalyticsAggregate,
        AnalyticsAlertRule,
        AnalyticsIntentTaxonomy,
        AnalyticsIntentClassification,
        AnalyticsIntentRoutingRule,
        AnalyticsABExperiment,
        AnalyticsSatisfactionResponse,
      ],
      'data',
    ),
    BullModule.registerQueue({
      name: QUEUE_NAMES.ANALYTICS,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: { age: 86400 * 7, count: 50 },
      },
    }),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsEventsService,
    AnalyticsAggregationService,
    AnalyticsExportService,
    AnalyticsAlertService,
    AlertDispatchService,
    IntentClassificationService,
    ABTestingService,
    SatisfactionSurveyService,
    AnalyticsEventListener,
    AnalyticsAggregationProcessor,
    AnalyticsCleanupProcessor,
    AnalyticsAlertProcessor,
    IntentClassificationProcessor,
  ],
  exports: [AnalyticsEventsService, AnalyticsAggregationService, IntentClassificationService, ABTestingService],
})
export class AnalyticsModule implements OnModuleInit {
  private readonly logger = createLogger('AnalyticsModule');

  constructor(
    @InjectQueue(QUEUE_NAMES.ANALYTICS)
    private readonly analyticsQueue: Queue,
  ) {}

  async onModuleInit() {
    // Enqueue repeatable job for daily aggregation at 1 AM
    await this.analyticsQueue.add(
      'daily-aggregation',
      {},
      {
        repeat: {
          pattern: '0 1 * * *', // Daily at 1 AM (cron format)
        },
        jobId: 'analytics-aggregation-repeatable',
      } as any,
    );

    this.logger.log('Analytics aggregation repeatable job registered (daily at 1 AM)');

    // Enqueue repeatable job for daily cleanup at 2 AM
    await this.analyticsQueue.add(
      'daily-cleanup',
      {},
      {
        repeat: {
          pattern: '0 2 * * *', // Daily at 2 AM (cron format)
        },
        jobId: 'analytics-cleanup-repeatable',
      } as any,
    );

    this.logger.log('Analytics cleanup repeatable job registered (daily at 2 AM)');

    // Enqueue repeatable job for alert evaluation every 5 minutes
    await this.analyticsQueue.add(
      'alert-evaluation',
      {},
      {
        repeat: {
          pattern: '*/5 * * * *', // Every 5 minutes (cron format)
        },
        jobId: 'analytics-alert-evaluation-repeatable',
      } as any,
    );

    this.logger.log('Analytics alert evaluation repeatable job registered (every 5 minutes)');

    // Enqueue repeatable job for intent classification hourly (Phase 10 Plan 01)
    await this.analyticsQueue.add(
      'classify-intents-batch',
      {},
      {
        repeat: {
          pattern: '0 * * * *', // Hourly at minute 0 (cron format)
        },
        jobId: 'classify-intents-hourly',
      } as any,
    );

    this.logger.log('Intent classification repeatable job registered (hourly at minute 0)');
  }
}
