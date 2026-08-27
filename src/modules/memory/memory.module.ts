import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Message } from '../message/entities/message.entity';
import { ConversationSummary } from './entities/conversation-summary.entity';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { MemorySummarizationService } from './services/memory-summarization.service';
import { MemoryCleanupService } from './services/memory-cleanup.service';
import { RetentionCleanupProcessor } from './processors/retention-cleanup.processor';
import { MemoryController } from './memory.controller';
import { QUEUE_NAMES } from '../queue/queue-names';
import { createLogger } from '../../common/services/logger.service';

/**
 * Phase 5: Long-term memory module.
 *
 * Wires the ConversationMemoryService, MemorySummarizationService, and MemoryCleanupService with
 * their repositories on the named 'data' connection. The forFeature connection arg is mandatory —
 * it makes @InjectRepository(Entity, 'data') resolve.
 *
 * Plan 03: Registers the RETENTION queue and enqueues a repeatable job at module init for the
 * retention cleanup cycle (soft-delete expired messages, hard-delete old soft-deleted rows).
 * The job runs every 24h. Uses BullMQ repeatable jobs, NOT @nestjs/schedule (not installed).
 *
 * Services are exported so future plans (API endpoints, BullMQ processors) can reuse them.
 * MemoryController exposes REST endpoints for n8n consumption.
 *
 * The memory entity glob is registered in app.module.ts and data-source.ts for future entities.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Message, ConversationSummary], 'data'),
    BullModule.registerQueue({
      name: QUEUE_NAMES.RETENTION,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 100 },
        removeOnFail: { age: 86400 * 7, count: 50 },
      },
    }),
  ],
  controllers: [MemoryController],
  providers: [
    ConversationMemoryService,
    MemorySummarizationService,
    MemoryCleanupService,
    RetentionCleanupProcessor,
  ],
  exports: [ConversationMemoryService, MemorySummarizationService, MemoryCleanupService],
})
export class MemoryModule implements OnModuleInit {
  private readonly logger = createLogger('MemoryModule');

  constructor(
    @InjectQueue(QUEUE_NAMES.RETENTION)
    private readonly retentionQueue: Queue,
  ) {}

  async onModuleInit() {
    // Enqueue a repeatable job for retention cleanup. Runs every 24h (86400000ms).
    // The jobId makes the repeat configuration idempotent — re-enqueuing with the same jobId
    // updates the existing schedule rather than creating duplicates.
    await this.retentionQueue.add(
      'cleanup-cycle',
      {},
      {
        repeat: {
          pattern: '0 2 * * *', // Daily at 2 AM (cron format)
        },
        jobId: 'retention-cleanup-repeatable',
      } as any, // BullMQ types don't expose repeat in JobsOptions, but it's supported at runtime
    );

    this.logger.log('Retention cleanup repeatable job registered (daily at 2 AM)');
  }
}

