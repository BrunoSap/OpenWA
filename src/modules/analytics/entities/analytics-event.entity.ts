import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/**
 * Phase 6 Plan 01: Analytics events for metrics collection (DASH-05).
 *
 * A tracer event row captures one domain event (message.processed, session.created, etc) with
 * extracted metrics (latency_ms, tokens_used, cost_usd) and a payload JSONB for flexible
 * event-specific data. The listener writes on the 'data' connection gated by ANALYTICS_ENABLED.
 *
 * Composite index on (event_type, created_at) backs time-range aggregations per event type;
 * standalone created_at index backs retention cleanup and global time-range queries (T-06-03).
 */
@Entity('analytics_events')
@Index('IDX_analytics_events_type_created', ['event_type', 'created_at'])
@Index('IDX_analytics_events_created', ['created_at'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Tenant identifier for multi-tenant isolation (Phase 9 Plan 1). */
  @Column({ type: 'uuid', nullable: true })
  tenant_id?: string;

  /** Event type (message.processed, session.created, webhook.sent, etc). */
  @Column({ type: 'varchar' })
  event_type!: string;

  /** Session identifier scoping this event (nullable for global events). */
  @Column({ type: 'varchar', nullable: true })
  session_id?: string;

  /** Chat identifier for message-related events (nullable for non-chat events). */
  @Column({ type: 'varchar', nullable: true })
  chat_id?: string;

  /** User identifier (from/author) for user-scoped events (nullable for system events). */
  @Column({ type: 'varchar', nullable: true })
  user_id?: string;

  /** Conversation grouping key (chatId:YYYY-MM-DD) for memory-scoped events (nullable). */
  @Column({ type: 'varchar', nullable: true })
  conversation_id?: string;

  /** Event-specific payload (flexible JSONB for custom fields). */
  @Column({ type: jsonColumnType(), default: {} })
  payload!: Record<string, unknown>;

  /** Processing latency in milliseconds (nullable if not measured). */
  @Column({ type: 'int', nullable: true })
  latency_ms?: number;

  /** LLM tokens consumed for this event (nullable for non-LLM events). */
  @Column({ type: 'int', nullable: true })
  tokens_used?: number;

  /** Estimated cost in USD for this event (nullable when not calculated). */
  @Column({ type: 'decimal', precision: 10, scale: 6, nullable: true })
  cost_usd?: number;

  /** Event creation timestamp. */
  @CreateDateColumn()
  created_at!: Date;
}
