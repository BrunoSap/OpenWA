import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/**
 * Phase 6 Plan 03 Task 2: Analytics alert rule entity (DASH-02).
 *
 * Stores configurable in-app alert rules for business KPIs. Rules are evaluated by the
 * analytics-alert processor every 5 minutes. When a rule breaches (current metric value
 * exceeds threshold per condition), the AlertDispatchService routes notifications to
 * configured channels (slack/webhook/email).
 *
 * Unique constraint NOT added (business may want multiple rules per metric with different thresholds).
 */
@Entity('analytics_alert_rules')
export class AnalyticsAlertRule {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Human-readable rule name (e.g., "High Fallback Rate Alert"). */
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Metric to monitor (fallback_rate, resolution_rate, cost_total_usd, latency_p95). */
  @Column({ type: 'varchar', length: 100 })
  metric!: string;

  /** Condition operator (above or below). */
  @Column({ type: 'varchar', length: 20 })
  condition!: string;

  /** Threshold value to compare against. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  threshold!: number;

  /** Whether this rule is active. */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Notification channels (JSON object with channel-specific config). */
  @Column(jsonColumnType())
  notification_channels!: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;
}
