import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageModule } from '../message/message.module';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsAggregate } from './entities/analytics-aggregate.entity';
import { AnalyticsAlertRule } from './entities/analytics-alert-rule.entity';
import { AnalyticsIntentTaxonomy } from './entities/analytics-intent-taxonomy.entity';
import { AnalyticsIntentClassification } from './entities/analytics-intent-classification.entity';
import { AnalyticsIntentRoutingRule } from './entities/analytics-intent-routing-rule.entity';
import { AnalyticsABExperiment } from './entities/analytics-ab-experiment.entity';
import { AnalyticsSatisfactionResponse } from './entities/analytics-satisfaction-response.entity';
import { MLModelVersion } from './entities/ml-model-version.entity';
import { AnalyticsEventsService } from './services/analytics-events.service';
import { AnalyticsAggregationService } from './services/analytics-aggregation.service';
import { AnalyticsExportService } from './services/analytics-export.service';
import { AnalyticsAlertService } from './services/analytics-alert.service';
import { AlertDispatchService } from './services/alert-dispatch.service';
import { IntentClassificationService } from './services/intent-classification.service';
import { ABTestingService } from './services/ab-testing.service';
import { FunnelAnalyticsService } from './services/funnel-analytics.service';
import { SatisfactionSurveyService } from './services/satisfaction-survey.service';
import { WhatsAppInteractiveService } from './services/whatsapp-interactive.service';
import { SurveyResponseHandler } from './services/survey-response-handler.service';
import { PredictiveModelsService } from './services/predictive-models.service';
import { AnalyticsEventListener } from './listeners/analytics-event.listener';
import { SurveySchedulerListener } from './listeners/survey-scheduler.listener';
import { AnalyticsAggregationProcessor } from './processors/analytics-aggregation.processor';
import { AnalyticsCleanupProcessor } from './processors/analytics-cleanup.processor';
import { AnalyticsAlertProcessor } from './processors/analytics-alert.processor';
import { IntentClassificationProcessor } from './processors/intent-classification.processor';
import { SurveySchedulerProcessor } from './processors/survey-scheduler.processor';
import { MLTrainingProcessor } from './processors/ml-training.processor';
import { AnalyticsController } from './analytics.controller';
import { PredictionsController } from './controllers/predictions.controller';
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
    MessageModule,
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
        MLModelVersion,
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
  controllers: [AnalyticsController, PredictionsController],
  providers: [
    AnalyticsEventsService,
    AnalyticsAggregationService,
    AnalyticsExportService,
    AnalyticsAlertService,
    AlertDispatchService,
    IntentClassificationService,
    ABTestingService,
    FunnelAnalyticsService,
    SatisfactionSurveyService,
    WhatsAppInteractiveService,
    SurveyResponseHandler,
    PredictiveModelsService, // Re-enabled with graceful TensorFlow failure handling
    AnalyticsEventListener,
    SurveySchedulerListener,
    // TEMPORARILY DISABLED: BullMQ processors require Redis
    // AnalyticsAggregationProcessor,
    // AnalyticsCleanupProcessor,
    // AnalyticsAlertProcessor,
    // IntentClassificationProcessor,
    // SurveySchedulerProcessor,
    // MLTrainingProcessor,
  ],
  exports: [AnalyticsEventsService, AnalyticsAggregationService, IntentClassificationService, ABTestingService, FunnelAnalyticsService],
})
export class AnalyticsModule implements OnModuleInit {
  private readonly logger = createLogger('AnalyticsModule');

  constructor(
    // TEMPORARILY DISABLED: Queue injection requires Redis
    // @InjectQueue(QUEUE_NAMES.ANALYTICS)
    // private readonly analyticsQueue: Queue,
  ) {}

  async onModuleInit() {
    // TEMPORARILY DISABLED: Queue scheduling requires Redis
    // All repeatable job scheduling commented out until Redis is available
  }
}
