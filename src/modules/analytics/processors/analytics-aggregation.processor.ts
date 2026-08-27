import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { AnalyticsAggregationService } from '../services/analytics-aggregation.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 6 Plan 02b: BullMQ processor for daily analytics aggregation (DASH-01).
 *
 * Runs on a repeatable job schedule (daily at 1 AM) to compute yesterday's aggregates from
 * raw analytics_events and upsert them into analytics_aggregates. The job is enqueued at
 * module init (analytics.module.ts) with a cron pattern, NOT via @nestjs/schedule (not installed).
 *
 * Aggregates yesterday's events by default (00:00:00 to 23:59:59 UTC).
 */
@Processor(QUEUE_NAMES.ANALYTICS)
export class AnalyticsAggregationProcessor extends WorkerHost {
  private readonly logger = createLogger('AnalyticsAggregationProcessor');

  constructor(private readonly aggregationService: AnalyticsAggregationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing analytics aggregation job (id: ${job.id})`);

    try {
      // Compute aggregates for yesterday (default behavior)
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);

      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setUTCHours(23, 59, 59, 999);

      this.logger.log(
        `Computing daily aggregates for ${yesterday.toISOString()} to ${endOfYesterday.toISOString()}`,
      );

      const aggregates = await this.aggregationService.computeAggregates(
        yesterday,
        endOfYesterday,
        'day',
      );

      if (aggregates.length > 0) {
        await this.aggregationService.upsertAggregates(aggregates);
        this.logger.log(`Upserted ${aggregates.length} daily aggregates`);
      } else {
        this.logger.log('No events to aggregate for yesterday');
      }
    } catch (error) {
      this.logger.error(`Analytics aggregation failed: ${error}`);
      throw error; // Re-throw so BullMQ marks the job as failed
    }
  }
}
