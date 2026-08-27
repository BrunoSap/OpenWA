import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { MemorySummarizationService } from '../services/memory-summarization.service';

/**
 * Phase 5 Plan 02: Summarization processor (MEM-03).
 *
 * BullMQ worker that processes summarization jobs. Jobs are enqueued with
 * jobId=`${userId}:${conversationId}` for deduplication (T-05-06) — only one
 * pending job per conversation at a time.
 *
 * Delegates to MemorySummarizationService which handles the summarization logic.
 */
@Processor(QUEUE_NAMES.SUMMARIZATION)
export class SummarizationProcessor extends WorkerHost {
  private readonly logger = new Logger(SummarizationProcessor.name);

  constructor(
    private readonly summarizationService: MemorySummarizationService,
  ) {
    super();
  }

  /**
   * Process a summarization job.
   *
   * @param job - BullMQ job with userId and conversationId
   * @returns Summary result or skipped marker
   */
  async process(job: Job<{ userId: string; conversationId: string }>): Promise<any> {
    const { userId, conversationId } = job.data;

    this.logger.debug(
      `Processing summarization job ${job.id} for ${userId}/${conversationId}`,
    );

    try {
      const result = await this.summarizationService.summarize({
        userId,
        conversationId,
      });

      if (result.skipped) {
        this.logger.debug(
          `Summarization skipped for ${userId}/${conversationId}: insufficient messages`,
        );
        return { skipped: true };
      }

      this.logger.log(
        `Summarization completed for ${userId}/${conversationId}: ${result.summary.messageCount} messages`,
      );
      return { skipped: false, summaryId: result.summary.id };
    } catch (error) {
      this.logger.error(
        `Summarization failed for ${userId}/${conversationId}:`,
        error,
      );
      throw error; // BullMQ will retry or move to failed
    }
  }
}
