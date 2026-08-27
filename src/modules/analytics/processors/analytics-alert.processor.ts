import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { AnalyticsAlertService } from '../services/analytics-alert.service';
import { AlertDispatchService } from '../services/alert-dispatch.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 6 Plan 03 Task 2: BullMQ processor for analytics alert evaluation (DASH-02).
 *
 * Runs on a repeatable job schedule (every 5 minutes) to evaluate enabled alert rules.
 * The job is enqueued at module init (analytics.module.ts) with a cron pattern.
 *
 * When a rule breaches, dispatches notification via AlertDispatchService to configured
 * channels (slack/webhook/email).
 */
@Processor(QUEUE_NAMES.ANALYTICS)
export class AnalyticsAlertProcessor extends WorkerHost {
  private readonly logger = createLogger('AnalyticsAlertProcessor');

  constructor(
    private readonly alertService: AnalyticsAlertService,
    private readonly dispatchService: AlertDispatchService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'alert-evaluation') {
      // Skip non-alert jobs (this processor handles multiple job types on ANALYTICS queue)
      return;
    }

    this.logger.log(`Processing alert evaluation job (id: ${job.id})`);

    try {
      const breaches = await this.alertService.evaluateRules();

      if (breaches.length === 0) {
        this.logger.log('No alert breaches detected');
        return;
      }

      this.logger.log(`Detected ${breaches.length} alert breaches, dispatching notifications`);

      for (const breach of breaches) {
        await this.dispatchService.dispatch(breach.rule, breach.currentValue);
      }

      this.logger.log(`Dispatched ${breaches.length} alert notifications`);
    } catch (error) {
      this.logger.error(`Alert evaluation failed: ${error}`);
      throw error; // Re-throw so BullMQ marks the job as failed
    }
  }
}
