import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/**
 * Phase 10 Plan 02: A/B experiment configuration for funnel analytics (DASH-04).
 *
 * Stores experiment metadata (name, variant count, date range) for A/B testing support.
 * Variant assignment uses consistent hashing (ABTestingService.assignVariant) so no
 * per-user storage needed. Active experiments drive variant assignment in intake flow.
 */
@Entity('analytics_ab_experiments')
export class AnalyticsABExperiment {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Unique experiment identifier (e.g., 'intake-flow-v2'). */
  @Column({ type: 'varchar', length: 100, unique: true })
  experiment_id!: string;

  /** Human-readable experiment name. */
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  /** Experiment description (optional). */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** Number of variants in this experiment (default: 2 for A/B test). */
  @Column({ type: 'int', default: 2 })
  variant_count!: number;

  /** Variant names (e.g., ['control', 'treatment_a', 'treatment_b']). */
  @Column({ type: jsonColumnType(), nullable: true })
  variant_names?: string[];

  /** Experiment start date. */
  @Column({ type: 'timestamp' })
  start_date!: Date;

  /** Experiment end date (nullable for ongoing experiments). */
  @Column({ type: 'timestamp', nullable: true })
  end_date?: Date;

  /** Whether the experiment is currently active. */
  @Column({ type: 'boolean', default: true })
  active!: boolean;

  /** Experiment creation timestamp. */
  @CreateDateColumn()
  created_at!: Date;
}
