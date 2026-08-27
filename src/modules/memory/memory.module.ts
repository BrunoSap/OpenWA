import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../message/entities/message.entity';
import { ConversationSummary } from './entities/conversation-summary.entity';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { MemorySummarizationService } from './services/memory-summarization.service';
import { MemoryController } from './memory.controller';

/**
 * Phase 5: Long-term memory module.
 *
 * Wires the ConversationMemoryService and MemorySummarizationService with their repositories
 * on the named 'data' connection. The forFeature connection arg is mandatory — it makes
 * @InjectRepository(Entity, 'data') resolve.
 *
 * Services are exported so future plans (API endpoints, BullMQ processors) can reuse them.
 * MemoryController exposes REST endpoints for n8n consumption.
 *
 * The memory entity glob is registered in app.module.ts and data-source.ts for future entities.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Message, ConversationSummary], 'data')],
  controllers: [MemoryController],
  providers: [ConversationMemoryService, MemorySummarizationService],
  exports: [ConversationMemoryService, MemorySummarizationService],
})
export class MemoryModule {}
