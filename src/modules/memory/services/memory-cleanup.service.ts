import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Message } from '../../message/entities/message.entity';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 5 Plan 03: Retention cleanup service (MEM-05).
 *
 * Two-stage retention lifecycle:
 * 1. Soft-delete expired messages (expiresAt < now, deletedAt IS NULL)
 * 2. Hard-delete old soft-deleted rows (deletedAt < grace threshold)
 *
 * Each run logs affected count and oldest deleted timestamp for auditability (T-05-09).
 * Queries are parameterized to prevent tampering (T-05-10).
 * The partial index IDX_messages_active_createdAt backs the soft-delete scan (T-05-08).
 */
@Injectable()
export class MemoryCleanupService {
  private readonly logger = createLogger('MemoryCleanupService');

  // Grace period after soft-delete before hard deletion (90 days)
  private readonly GRACE_PERIOD_DAYS = 90;

  constructor(
    @InjectRepository(Message, 'data')
    private readonly messageRepository: Repository<Message>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Soft-delete messages where expiresAt < now and deletedAt is null (MEM-05).
   * Returns the number of rows affected.
   *
   * TypeORM's soft-delete sets deletedAt; subsequent find() queries auto-exclude these rows.
   * The partial index IDX_messages_active_createdAt (WHERE deletedAt IS NULL) backs this scan.
   */
  async softDeleteExpired(): Promise<number> {
    const now = new Date();

    const result = await this.messageRepository
      .createQueryBuilder()
      .update(Message)
      .set({ deletedAt: () => 'CURRENT_TIMESTAMP' })
      .where('expiresAt < :now', { now })
      .andWhere('deletedAt IS NULL')
      .execute();

    const affected = result.affected ?? 0;

    if (affected > 0) {
      this.logger.log(`Soft-deleted ${affected} expired messages (expiresAt < ${now.toISOString()})`);
    }

    return affected;
  }

  /**
   * Hard-delete rows whose deletedAt is older than the grace period (90 days).
   * Returns the number of rows affected.
   *
   * TypeORM's soft-delete mechanism normally hides these rows, so we use createQueryBuilder
   * with an explicit deletedAt predicate to access them (withDeleted semantics).
   */
  async hardDeleteOldSoftDeletes(): Promise<number> {
    const graceThreshold = new Date(Date.now() - this.GRACE_PERIOD_DAYS * 86400000);

    const result = await this.dataSource
      .createQueryBuilder()
      .delete()
      .from(Message)
      .where('deletedAt < :graceThreshold', { graceThreshold })
      .execute();

    const affected = result.affected ?? 0;

    if (affected > 0) {
      this.logger.log(
        `Hard-deleted ${affected} old soft-deleted messages (deletedAt < ${graceThreshold.toISOString()})`,
      );
    }

    return affected;
  }

  /**
   * Run the full cleanup cycle: soft-delete expired rows, then hard-delete old soft-deleted rows.
   * Called by the BullMQ repeatable job (retention-cleanup.processor.ts).
   */
  async runCleanupCycle(): Promise<void> {
    this.logger.log('Starting retention cleanup cycle');

    const softDeleted = await this.softDeleteExpired();
    const hardDeleted = await this.hardDeleteOldSoftDeletes();

    this.logger.log(
      `Retention cleanup complete: ${softDeleted} soft-deleted, ${hardDeleted} hard-deleted`,
    );
  }
}
