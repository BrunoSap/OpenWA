import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

/**
 * Phase 5 Plan 02: Conversation summaries for long-term memory (MEM-03).
 *
 * A summary row caches the gist of older messages (beyond the sliding window) for a user's
 * conversation, upserted by the background summarization job. buildLLMContext reads this to
 * provide historical context without re-processing every old message.
 *
 * Unique constraint on (userId, conversationId) ensures one summary per conversation thread,
 * updated on each summarization run (T-05-07).
 */
@Entity('conversation_summaries')
@Index('UQ_conversation_summaries_user_conversation', ['userId', 'conversationId'], { unique: true })
export class ConversationSummary {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** User identifier (author for groups, from for 1:1) scoping this summary. */
  @Column({ type: 'varchar' })
  userId!: string;

  /** Conversation grouping key (chatId:YYYY-MM-DD) identifying the thread. */
  @Column({ type: 'varchar' })
  conversationId!: string;

  /** Summary text (LLM-generated or extractive fallback). */
  @Column({ type: 'text' })
  text!: string;

  /** Count of messages summarized (older messages beyond the sliding window). */
  @Column({ type: 'int' })
  messageCount!: number;

  /** CreatedAt of the oldest message included in this summary (null if none). */
  @Column({ type: 'datetime', nullable: true })
  oldestMessageDate?: Date;

  /** CreatedAt of the newest message included in this summary (null if none). */
  @Column({ type: 'datetime', nullable: true })
  newestMessageDate?: Date;

  /** Timestamp of last summary update. */
  @UpdateDateColumn()
  updatedAt!: Date;
}
