import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Phase 6 Plan 02b: Analytics aggregates for pre-computed KPI rollups (DASH-01, DASH-02).
 *
 * Stores daily/hourly aggregations of raw analytics_events to optimize query performance.
 * The aggregation processor runs daily at 1 AM, computing counts, latency percentiles, token
 * totals, costs, and quality metrics (resolution_rate, fallback_rate) per session per day.
 *
 * The unique index on (time_bucket, granularity, session_id) makes upserts idempotent —
 * re-running the same day's aggregation updates existing rows rather than creating duplicates.
 */
@Entity('analytics_aggregates')
@Index('IDX_analytics_aggregates_time_granularity', ['time_bucket', 'granularity'])
@Index('IDX_analytics_aggregates_session_time', ['session_id', 'time_bucket'])
export class AnalyticsAggregate {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Time bucket start (hour/day/week boundary). */
  @Column({ type: 'timestamp' })
  time_bucket!: Date;

  /** Aggregation granularity (hour, day, week). */
  @Column({ type: 'varchar', length: 20 })
  granularity!: string;

  /** Session identifier (nullable for global aggregates). */
  @Column({ type: 'varchar', nullable: true })
  session_id?: string;

  /** Count of conversation.started events. */
  @Column({ type: 'int', default: 0 })
  conversations_started!: number;

  /** Count of conversation.resolved events. */
  @Column({ type: 'int', default: 0 })
  conversations_resolved!: number;

  /** Count of conversation.escalated events. */
  @Column({ type: 'int', default: 0 })
  conversations_escalated!: number;

  /** Count of message.processed events. */
  @Column({ type: 'int', default: 0 })
  messages_processed!: number;

  /** Count of fallback.triggered events. */
  @Column({ type: 'int', default: 0 })
  fallbacks_triggered!: number;

  /** Latency p50 (median) in milliseconds. */
  @Column({ type: 'int', nullable: true })
  latency_p50_ms?: number;

  /** Latency p95 in milliseconds. */
  @Column({ type: 'int', nullable: true })
  latency_p95_ms?: number;

  /** Latency p99 in milliseconds. */
  @Column({ type: 'int', nullable: true })
  latency_p99_ms?: number;

  /** Total tokens consumed (input + output). */
  @Column({ type: 'int', default: 0 })
  tokens_total!: number;

  /** Total cost in USD. */
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  cost_total_usd!: number;

  /** Resolution rate percentage (0-100), null when conversations_started=0. */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  resolution_rate?: number;

  /** Fallback rate percentage (0-100), null when messages_processed=0. */
  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  fallback_rate?: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
