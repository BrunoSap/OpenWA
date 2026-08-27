import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partial index on `messages.createdAt WHERE deletedAt IS NULL`, backing the retention cleanup
 * job's `WHERE expiresAt < NOW() AND deletedAt IS NULL` scan (memory-cleanup.service.ts). The
 * deletedAt column is NULL for every active row and non-NULL only after soft-delete, so a full
 * index over createdAt would include soft-deleted rows the cleanup never touches; the partial form
 * keeps the index to active rows that can ever match (MEM-05, T-05-08).
 *
 * PostgreSQL supports partial indexes with a WHERE clause; SQLite 3.8.0+ also supports them with
 * identical syntax. Both are covered by the same CREATE INDEX statement.
 *
 * The explicit name matches the entity's @Index (Message entity), so the synchronize and migration
 * schema paths converge on one index. Idempotent via IF NOT EXISTS (supported by both dialects).
 */
export class AddMessageRetentionIndex1786600000000 implements MigrationInterface {
  name = 'AddMessageRetentionIndex1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Lift statement_timeout for PostgreSQL, mirroring AddMessageMediaPathIndex pattern. On large
    // messages tables a CREATE INDEX can exceed the runtime timeout (default 30s), aborting the
    // migration transaction and crash-looping boot retries.
    if (queryRunner.dataSource.options.type === 'postgres') {
      await queryRunner.query('SET LOCAL statement_timeout = 0');
    }

    // Both PostgreSQL and SQLite 3.8.0+ support partial indexes with WHERE clause. The predicate
    // `deletedAt IS NULL` restricts the index to active (non-soft-deleted) rows — the only rows
    // the cleanup scan will ever match.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_messages_active_createdAt" ON "messages" ("createdAt") WHERE "deletedAt" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_messages_active_createdAt"`);
  }
}
