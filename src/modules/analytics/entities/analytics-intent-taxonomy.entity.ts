import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Phase 10 Plan 01: Per-tenant intent taxonomy for LLM classification (DASH-03).
 *
 * Stores customizable intent categories per tenant. Each intent has a name, description, and
 * optional few-shot examples. The system prompt for Anthropic batch classification is built from
 * this taxonomy and cached across the batch (cache_control: ephemeral) for 83% cost reduction.
 *
 * Default taxonomy seeded at module init for tenant 'global':
 * - FAQ, Suporte Técnico, Vendas, Reclamação, Outros
 *
 * UNIQUE(tenant_id, intent_name) enforces one intent per name per tenant.
 */
@Entity('analytics_intent_taxonomies')
@Index('IDX_intent_taxonomy_tenant_name', ['tenant_id', 'intent_name'], { unique: true })
export class AnalyticsIntentTaxonomy {
  @PrimaryGeneratedColumn()
  id!: number;

  /** Tenant identifier for multi-tenant isolation (Phase 9). Default: 'global' for single-tenant. */
  @Column({ type: 'varchar', length: 255, nullable: false, default: 'global' })
  tenant_id!: string;

  /** Intent name (e.g., 'FAQ', 'Suporte Técnico', 'Vendas'). Max 100 chars. */
  @Column({ type: 'varchar', length: 100, nullable: false })
  intent_name!: string;

  /** Human-readable description of this intent category. */
  @Column({ type: 'text', nullable: true })
  intent_description?: string;

  /** Optional few-shot examples to improve classification accuracy. */
  @Column({ type: 'text', array: true, nullable: true })
  examples?: string[];

  /** Taxonomy creation timestamp. */
  @CreateDateColumn()
  created_at!: Date;
}
