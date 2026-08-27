import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Phase 10 Plan 01: Intent classification results from Anthropic Batch API (DASH-03).
 *
 * Stores LLM-classified intents for each message. The intent_name references the taxonomy,
 * and confidence (0.0-1.0) indicates classification certainty if returned by the LLM.
 *
 * Populated by IntentClassificationProcessor (BullMQ hourly job) which batches unclassified
 * messages and sends them to Anthropic Batch API with prompt caching enabled.
 *
 * Indexes:
 * - (session_id, classified_at): Time-range queries per session
 * - (intent_name, classified_at): Intent distribution over time
 */
@Entity('analytics_intent_classifications')
@Index('IDX_intent_classification_session_time', ['session_id', 'classified_at'])
@Index('IDX_intent_classification_intent_time', ['intent_name', 'classified_at'])
export class AnalyticsIntentClassification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Message ID from analytics_events or messages table. */
  @Column({ type: 'varchar', length: 255, nullable: false })
  message_id!: string;

  /** Session identifier scoping this classification. */
  @Column({ type: 'varchar', length: 255, nullable: false })
  session_id!: string;

  /** Chat identifier for message context. */
  @Column({ type: 'varchar', length: 255, nullable: false })
  chat_id!: string;

  /** User identifier (nullable for anonymous users). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  user_id?: string;

  /** Classified intent name (references analytics_intent_taxonomies.intent_name). */
  @Column({ type: 'varchar', length: 100, nullable: false })
  intent_name!: string;

  /** LLM confidence score (0.0000-1.0000), nullable if not provided. */
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  confidence?: number;

  /** Classification timestamp. */
  @CreateDateColumn()
  classified_at!: Date;
}
