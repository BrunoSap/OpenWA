import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../message/entities/message.entity';
import { ConversationMemoryService } from './services/conversation-memory.service';

/**
 * Phase 5: Long-term memory module.
 *
 * Wires the ConversationMemoryService with the Message repository on the named 'data' connection.
 * The forFeature connection arg is mandatory — it makes @InjectRepository(Message, 'data') resolve.
 * Service is exported so future plans (API endpoints, summarization) can reuse it.
 *
 * The memory entity glob is registered in app.module.ts and data-source.ts for future entities
 * (this plan adds no new entity file, but Plan 02/03 will).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Message], 'data')],
  providers: [ConversationMemoryService],
  exports: [ConversationMemoryService],
})
export class MemoryModule {}
