import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

/**
 * Phase 10 Plan 03: Satisfaction survey responses (NPS/CSAT) collected via WhatsApp interactive messages.
 *
 * Stores user responses to post-conversation satisfaction surveys. Survey type determines score range:
 * - NPS (Net Promoter Score): 0-10 scale (promoters 9-10, detractors 0-6, passives 7-8)
 * - CSAT (Customer Satisfaction): 1-5 scale (5-point satisfaction rating)
 *
 * Composite index on (session_id, responded_at) backs correlation queries with conversation events.
 * Standalone index on (survey_type, responded_at) backs NPS/CSAT time-range aggregations.
 * UNIQUE constraint on (conversation_id, user_id, survey_type) prevents duplicate responses per conversation.
 */
@Entity('analytics_satisfaction_responses')
@Index('IDX_satisfaction_session_time', ['session_id', 'responded_at'])
@Index('IDX_satisfaction_type_time', ['survey_type', 'responded_at'])
@Index('IDX_satisfaction_unique', ['conversation_id', 'user_id', 'survey_type'], { unique: true })
export class AnalyticsSatisfactionResponse {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Conversation identifier linking survey to specific conversation that ended. */
  @Column({ type: 'varchar', length: 100 })
  conversation_id!: string;

  /** User identifier (phone number or user ID who responded to survey). */
  @Column({ type: 'varchar', length: 255 })
  user_id!: string;

  /** Session identifier scoping this response to a WhatsApp session. */
  @Column({ type: 'varchar', length: 255 })
  session_id!: string;

  /** Survey type: 'nps' (0-10 scale) or 'csat' (1-5 scale). */
  @Column({ type: 'varchar', length: 20 })
  survey_type!: string;

  /** User's satisfaction score (NPS: 0-10, CSAT: 1-5). */
  @Column({ type: 'int' })
  score!: number;

  /** Timestamp when user responded to survey (extracted from webhook payload or NOW()). */
  @CreateDateColumn()
  responded_at!: Date;
}
