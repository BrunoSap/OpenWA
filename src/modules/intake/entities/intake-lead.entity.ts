import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { jsonColumnType } from '../../../common/utils/column-types';

/**
 * A lead captured during WhatsApp intake, on the DATA connection (SQLite dev/test, Postgres prod).
 *
 * Table name is FLAT (`intake_leads`, no schema namespace): SQLite has no Postgres schemas, so the
 * `intake_staging.leads` DDL of migration 003 is the Postgres-only production path while this entity
 * is the cross-dialect path of the 'data' connection. Columns mirror the NUCLEAR fields of
 * `intake_staging.leads` (migration 003); the extended columns (documents, fee_structure, LawApp
 * sync, soft delete) are deferred to the conversational-flow expansion (Plan 02).
 *
 * `case_data` uses jsonColumnType() (resolves to 'simple-json' on both dialects — see column-types.ts)
 * so it never hardcodes 'jsonb', which would break the always-text real column and SQLite. No CHECK
 * constraints live here — domain validation belongs to the DTO/service layer.
 */
@Entity('intake_leads')
@Index('UQ_intake_leads_chat_id', ['chatId'], { unique: true })
export class IntakeLead {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'chat_id' })
  chatId!: string;

  @Column({ nullable: true })
  phone!: string | null;

  @Column({ nullable: true })
  cpf!: string | null;

  @Column({ name: 'full_name', nullable: true })
  fullName!: string | null;

  @Column({ nullable: true })
  email!: string | null;

  @Column({ name: 'case_type' })
  caseType!: string;

  @Column({ name: 'urgency_level', default: 'normal' })
  urgencyLevel!: string;

  @Column({ name: 'case_data', type: jsonColumnType() })
  caseData!: Record<string, unknown>;

  @Column({ name: 'intake_status', default: 'in_progress' })
  intakeStatus!: string;

  @CreateDateColumn({ name: 'intake_started_at' })
  intakeStartedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
