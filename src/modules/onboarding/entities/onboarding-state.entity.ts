import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { jsonColumnType, dateColumnType } from '../../../common/utils/column-types';
import { DateTransformer } from '../../../common/transformers/date.transformer';

/**
 * OnboardingState entity - Tracks tenant onboarding wizard progression
 * Phase 09 Plan 04: Tenant onboarding automation
 *
 * Connection: main (auth/audit) - shared with Tenant, ApiKey
 */
@Entity('onboarding_states')
export class OnboardingState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  tenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  currentStep!: string;

  @Column({ type: jsonColumnType(), default: '[]' })
  completedSteps!: string[];

  @Column({ type: jsonColumnType(), default: '{}' })
  metadata!: Record<string, any>;

  @CreateDateColumn({ type: dateColumnType(), transformer: DateTransformer })
  createdAt!: Date;

  @UpdateDateColumn({ type: dateColumnType(), transformer: DateTransformer })
  updatedAt!: Date;
}
