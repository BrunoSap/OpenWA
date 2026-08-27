import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Message } from '../../message/entities/message.entity';
import { ConversationSummary } from '../entities/conversation-summary.entity';

/**
 * Phase 5 Plan 02: Memory summarization service (MEM-03).
 *
 * Produces summaries of older messages (beyond the sliding window) for long-term recall.
 * Called by the BullMQ summarization processor. Uses extractive fallback when no LLM
 * target is configured.
 */
@Injectable()
export class MemorySummarizationService {
  private readonly logger = new Logger(MemorySummarizationService.name);

  /** Minimum number of older messages required to trigger summarization. */
  private static readonly MIN_MESSAGES_THRESHOLD = 10;

  /** Window size for "recent" messages (not included in summary). */
  private static readonly RECENT_WINDOW_SIZE = 20;

  /** Max characters for extractive fallback summary. */
  private static readonly EXTRACTIVE_MAX_LENGTH = 500;

  constructor(
    @InjectRepository(Message, 'data')
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(ConversationSummary, 'data')
    private readonly summaryRepo: Repository<ConversationSummary>,
  ) {}

  /**
   * Summarize older messages for a user's conversation.
   *
   * @param params - userId and conversationId to summarize
   * @returns Summary result: skipped=true if <10 messages, else summary object
   *
   * @remarks
   * - Fetches messages older than the newest 20 (sliding window)
   * - Skips if fewer than 10 older messages (returns { skipped: true })
   * - Generates summary via LLM if available, else extractive fallback
   * - Upserts one row keyed by (userId, conversationId) with conflict dedup (T-05-07)
   * - Idempotent: second run updates existing row, never inserts duplicate
   */
  async summarize(params: {
    userId: string;
    conversationId: string;
  }): Promise<
    | { skipped: true }
    | { skipped: false; summary: ConversationSummary }
  > {
    const { userId, conversationId } = params;

    // Fetch all messages for this userId, ordered newest-first
    const allMessages = await this.messageRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    // Skip the newest RECENT_WINDOW_SIZE messages (they're in the sliding window)
    const olderMessages = allMessages.slice(MemorySummarizationService.RECENT_WINDOW_SIZE);

    // Skip if fewer than MIN_MESSAGES_THRESHOLD older messages
    if (olderMessages.length < MemorySummarizationService.MIN_MESSAGES_THRESHOLD) {
      this.logger.debug(
        `Skipping summarization for ${userId}/${conversationId}: only ${olderMessages.length} older messages (threshold: ${MemorySummarizationService.MIN_MESSAGES_THRESHOLD})`,
      );
      return { skipped: true };
    }

    // Generate summary (LLM or extractive fallback)
    const summaryText = await this.generateSummary(olderMessages);

    // Calculate date range
    const oldestMessageDate = olderMessages[olderMessages.length - 1]?.createdAt || null;
    const newestMessageDate = olderMessages[0]?.createdAt || null;

    // Upsert summary row with conflict resolution on (userId, conversationId)
    const summaryEntity: Partial<ConversationSummary> = {
      userId,
      conversationId,
      text: summaryText,
      messageCount: olderMessages.length,
      oldestMessageDate,
      newestMessageDate,
    };

    await this.summaryRepo.upsert(summaryEntity, {
      conflictPaths: ['userId', 'conversationId'],
    });

    this.logger.log(
      `Summarized ${olderMessages.length} older messages for ${userId}/${conversationId}`,
    );

    // Return the summary (fetch to get generated id/updatedAt)
    const saved = await this.summaryRepo.findOne({
      where: { userId, conversationId },
    });

    return { skipped: false, summary: saved! };
  }

  /**
   * Generate summary text from older messages.
   *
   * @param messages - Older messages to summarize (ordered newest-first)
   * @returns Summary text
   *
   * @remarks
   * - Future: call out to n8n LLM workflow if configured
   * - Current: deterministic extractive fallback (join + truncate)
   */
  private async generateSummary(messages: Message[]): Promise<string> {
    // TODO: Call out to n8n LLM workflow when configured
    // For now, use extractive fallback

    // Extractive fallback: concatenate message bodies, truncate to max length
    const concatenated = messages
      .reverse() // Oldest-first for chronological summary
      .map((msg) => msg.body || '')
      .filter((body) => body.trim().length > 0)
      .join(' ');

    if (concatenated.length <= MemorySummarizationService.EXTRACTIVE_MAX_LENGTH) {
      return concatenated;
    }

    // Truncate to max length, try to break at sentence boundary
    const truncated = concatenated.substring(0, MemorySummarizationService.EXTRACTIVE_MAX_LENGTH);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastExclamation = truncated.lastIndexOf('!');
    const lastQuestion = truncated.lastIndexOf('?');
    const lastSentence = Math.max(lastPeriod, lastExclamation, lastQuestion);

    if (lastSentence > 0 && lastSentence > truncated.length * 0.7) {
      // Break at sentence boundary if it's not too early
      return truncated.substring(0, lastSentence + 1);
    }

    // Otherwise just truncate and add ellipsis
    return truncated + '...';
  }
}
