import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../../message/entities/message.entity';

/**
 * Phase 5: Long-term memory service for conversation recall.
 *
 * Provides query methods over the messages table's new memory columns (userId, conversationId)
 * for cross-session persistence. Soft-deleted rows (deletedAt set) are auto-excluded by TypeORM's
 * @DeleteDateColumn decorator on the Message entity.
 */
@Injectable()
export class ConversationMemoryService {
  /** Hard cap on recall limit to prevent unbounded queries (T-05-03). */
  private static readonly MAX_RECALL = 1000;

  constructor(
    @InjectRepository(Message, 'data')
    private readonly messageRepo: Repository<Message>,
  ) {}

  /**
   * Retrieve recent messages for a user, newest-first.
   *
   * @param userId - User identifier (author for groups, from for 1:1); scopes the recall query
   * @param limit - Max messages to return (default 50, capped at MAX_RECALL)
   * @returns Messages ordered by createdAt DESC, excluding soft-deleted rows
   *
   * @remarks
   * - Empty/undefined userId returns [] immediately (T-05-02: never all rows)
   * - Soft-deleted rows are auto-excluded via @DeleteDateColumn (no manual filter needed)
   * - Query uses the (userId, createdAt) composite index from the migration
   */
  async getRecentMessages(userId: string, limit = 50): Promise<Message[]> {
    // T-05-02: Guard empty userId — return empty array, never all rows
    if (!userId) {
      return [];
    }

    // T-05-03: Clamp limit to hard max
    const clampedLimit = Math.min(limit, ConversationMemoryService.MAX_RECALL);

    // TypeORM's @DeleteDateColumn on Message.deletedAt auto-adds WHERE deletedAt IS NULL,
    // so no manual deletedAt filter is needed here. The query hits the (userId, createdAt)
    // composite index from AddConversationMemoryFields migration.
    return this.messageRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: clampedLimit,
    });
  }
}
