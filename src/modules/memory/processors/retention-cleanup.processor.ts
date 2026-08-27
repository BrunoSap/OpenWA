import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { MemoryCleanupService } from '../services/memory-cleanup.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 5 Plan 03: BullMQ processor for retention cleanup (MEM-05).
 *
 * Runs the two-stage cleanup cycle (soft-delete expired, hard-delete old soft-deleted) on a
 * repeatable job schedule. The job is enqueued at module init (memory.module.ts) with a 24h
 * repeat interval, NOT via @nestjs/schedule (which is not installed).
 */
@Processor(QUEUE_NAMES.RETENTION)
export class RetentionCleanupProcessor extends WorkerHost {
  private readonly logger = createLogger('RetentionCleanupProcessor');

  constructor(private readonly cleanupService: MemoryCleanupService) {
    super();
  }

  async process(job: Job): Promise<void> {
    this.logger.log(`Processing retention cleanup job (id: ${job.id})`);

    try {
      await this.cleanupService.runCleanupCycle();
    } catch (error) {
      this.logger.error(`Retention cleanup failed: ${error}`);
      throw error; // Re-throw so BullMQ marks the job as failed
    }
  }
}
