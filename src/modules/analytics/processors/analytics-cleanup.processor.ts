import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { createLogger } from '../../../common/services/logger.service';
import { ConfigService } from '@nestjs/config';

/**
 * Phase 6 Plan 02b: BullMQ processor for analytics retention cleanup (DASH-02).
 *
 * Runs on a repeatable job schedule (daily at 2 AM) to hard-delete analytics_events older
 * than the retention window (default 90 days, env ANALYTICS_RETENTION_DAYS). The job is
 * enqueued at module init (analytics.module.ts) with a cron pattern.
 *
 * Only deletes raw events (analytics_events); aggregates (analytics_aggregates) are kept
 * permanently for long-term reporting.
 */
@Processor(QUEUE_NAMES.ANALYTICS)
@Injectable()
export class AnalyticsCleanupProcessor extends WorkerHost {
  private readonly logger = createLogger('AnalyticsCleanupProcessor');
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly analyticsRepository: Repository<AnalyticsEvent>,
    private readonly configService: ConfigService,
  ) {
    super();
    this.retentionDays = this.configService.get<number>('analytics.retentionDays', 90);
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing analytics cleanup job (id: ${job.id})`);

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      this.logger.log(
        `Deleting analytics_events older than ${cutoffDate.toISOString()} (retention: ${this.retentionDays} days)`,
      );

      const result = await this.analyticsRepository
        .createQueryBuilder()
        .delete()
        .from(AnalyticsEvent)
        .where('created_at < :cutoff', { cutoff: cutoffDate })
        .execute();

      const affected = result.affected ?? 0;

      if (affected > 0) {
        this.logger.log(`Deleted ${affected} old analytics events`);
      } else {
        this.logger.log('No analytics events to delete (all within retention window)');
      }
    } catch (error) {
      this.logger.error(`Analytics cleanup failed: ${error}`);
      throw error; // Re-throw so BullMQ marks the job as failed
    }
  }
}
