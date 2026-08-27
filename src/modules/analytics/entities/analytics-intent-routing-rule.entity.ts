import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/**
 * Phase 10 Plan 01 Task 2: Intent-based routing rules foundation (bonus feature per RESEARCH.md L212-233).
 *
 * Defines automated actions triggered after intent classification. Rules map an intent to an action
 * (escalate, assign_agent, trigger_workflow) with configuration stored in JSONB.
 *
 * Example: When intent='Reclamação', escalate to supervisor with high priority.
 *
 * Enforcement logic deferred to future phase — this task implements CRUD only.
 */
@Entity('analytics_intent_routing_rules')
export class AnalyticsIntentRoutingRule {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Intent name that triggers this rule (references analytics_intent_taxonomies.intent_name). */
  @Column({ type: 'varchar', length: 100, nullable: false })
  intent_name!: string;

  /** Action type: 'escalate', 'assign_agent', or 'trigger_workflow'. */
  @Column({ type: 'varchar', length: 50, nullable: false })
  action!: string;

  /** Action-specific configuration (e.g., { agent_id: 'X', priority: 'high' }). */
  @Column({ type: jsonColumnType(), nullable: true })
  action_config?: Record<string, unknown>;

  /** Whether this rule is active. */
  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  /** Rule creation timestamp. */
  @CreateDateColumn()
  created_at!: Date;
}
