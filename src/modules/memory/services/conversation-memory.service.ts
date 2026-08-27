import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageDirection } from '../../message/entities/message.entity';
import { ConversationSummary } from '../entities/conversation-summary.entity';
import { ConversationContextDto } from '../dto/conversation-context.dto';

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
    @InjectRepository(ConversationSummary, 'data')
    private readonly summaryRepo: Repository<ConversationSummary>,
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

  /**
   * Build LLM context for a user: recent messages + summary of older messages (MEM-04).
   *
   * @param userId - User identifier to fetch context for
   * @param windowSize - Number of recent messages to include (default 20)
   * @returns Context object with summary, recent messages, and total count
   *
   * @remarks
   * - Recent messages are the newest `windowSize` messages, mapped to LLM role format
   * - Role: 'user' for INCOMING (user sent), 'assistant' for OUTGOING (bot replied)
   * - Summary is null when total <= windowSize; otherwise the stored summary text
   * - When total > windowSize but no summary exists, returns placeholder text
   * - Redis cache for summary is optional (RESEARCH: degrades to direct DB query)
   */
  async buildLLMContext(
    userId: string,
    windowSize = 20,
  ): Promise<ConversationContextDto> {
    // Fetch recent messages (sliding window)
    const recentMessages = await this.getRecentMessages(userId, windowSize);

    // Count total messages for this user
    const totalMessages = await this.messageRepo.count({
      where: { userId },
    });

    // Map recent messages to LLM role format
    const recentMessagesFormatted = recentMessages.map((msg) => ({
      role: msg.direction === MessageDirection.INCOMING ? ('user' as const) : ('assistant' as const),
      content: msg.body || '',
      timestamp: msg.createdAt,
    }));

    // Determine summary: null if under window, else stored summary or placeholder
    let summary: string | null = null;

    if (totalMessages > windowSize) {
      // Fetch the most recent summary for this user
      const summaryRow = await this.summaryRepo.findOne({
        where: { userId },
        order: { updatedAt: 'DESC' },
      });

      if (summaryRow) {
        summary = summaryRow.text;
      } else {
        // Placeholder when no summary exists yet
        const olderCount = totalMessages - windowSize;
        summary = `[${olderCount} older messages not yet summarized]`;
      }
    }

    return {
      summary,
      recentMessages: recentMessagesFormatted,
      totalMessages,
    };
  }

  /**
   * Get paginated conversation history for a user.
   *
   * @param userId - User identifier to fetch history for
   * @param pagination - Skip and take for pagination
   * @returns Messages array and total count
   *
   * @remarks
   * - Scoped by userId (T-05-04: no cross-user rows)
   * - Take is clamped to 100 in the controller (T-05-05)
   * - Ordered by createdAt DESC (newest first)
   * - Soft-deleted rows auto-excluded via @DeleteDateColumn
   */
  async getUserHistory(
    userId: string,
    pagination: { skip: number; take: number },
  ): Promise<{ messages: Message[]; total: number }> {
    if (!userId) {
      return { messages: [], total: 0 };
    }

    const [messages, total] = await this.messageRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: pagination.skip,
      take: pagination.take,
    });

    return { messages, total };
  }
}
