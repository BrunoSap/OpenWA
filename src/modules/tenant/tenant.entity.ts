import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Tenant entity for multi-tenant SaaS architecture
 * Each tenant represents an independent customer/organization
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index()
  slug!: string;

  @Column({ type: 'varchar', length: 20, default: 'free' })
  plan!: string;

  @Column({ type: 'int', default: 100, name: 'quota_messages' })
  quotaMessages!: number;

  @Column({ type: 'int', default: 10, name: 'rate_limit_per_minute' })
  rateLimitPerMinute!: number;

  @Column({ type: 'varchar', nullable: true, name: 'stripe_customer_id' })
  stripeCustomerId!: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'stripe_subscription_id' })
  stripeSubscriptionId!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'none', name: 'subscription_status' })
  subscriptionStatus!: string;

  @Column({ type: 'varchar', length: 50, default: 'none', name: 'payment_status' })
  paymentStatus!: string;

  @Column({ type: 'timestamp', nullable: true, name: 'grace_period_ends_at' })
  gracePeriodEndsAt!: Date | null;

  @Column({ type: 'boolean', default: false, name: 'allow_overage' })
  allowOverage!: boolean;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
