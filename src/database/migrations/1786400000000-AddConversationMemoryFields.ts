import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5: Long-term memory schema additions to the `messages` table.
 *
 * Adds four nullable columns for conversation recall and retention:
 * - conversationId: Daily conversation grouping key `${chatId}:${YYYY-MM-DD}`
 * - userId: Sender identity for scoping recall queries (author for groups, from for 1:1)
 * - deletedAt: Soft-delete timestamp (TypeORM @DeleteDateColumn)
 * - expiresAt: Retention expiry timestamp (Plan 03 purge target)
 *
 * Plus two composite indexes backing recall queries:
 * - (userId, createdAt): ConversationMemoryService.getRecentMessages by user
 * - (conversationId, createdAt): Thread-scoped recall (future expansion)
 *
 * Hand-authored because `synchronize` is off for the data connection on PostgreSQL. Dialect-aware:
 * on postgres sets LOCAL statement_timeout=0 before creating indexes over the hot messages table;
 * uses column types valid on both better-sqlite3 and postgres (varchar, timestamp/datetime).
 * Idempotent via hasColumn checks (ALTER IF NOT EXISTS is not portable to older SQLite) and
 * CREATE INDEX IF NOT EXISTS.
 */
export class AddConversationMemoryFields1786400000000 implements MigrationInterface {
  name = 'AddConversationMemoryFields1786400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The data pool boots with a runtime statement_timeout (default 30s). On an upgrade where this
    // is the only pending migration, MigrationExecutor wraps it in its OWN transaction, so no
    // earlier migration's SET LOCAL is in effect and a CREATE INDEX over a large messages table is
    // cancelled at the timeout, aborting the ledger-advancing transaction and crash-looping the
    // boot retries. Lift it for this transaction only.
    if (queryRunner.connection.options.type === 'postgres') {
      await queryRunner.query('SET LOCAL statement_timeout = 0');
    }

    // Add columns one by one, guarded by hasColumn (ADD COLUMN IF NOT EXISTS is not portable).
    // TypeORM's hasColumn is async, so we can't use a loop — each await is a separate check.
    if (!(await queryRunner.hasColumn('messages', 'conversationId'))) {
      await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "conversationId" varchar NULL`);
    }

    if (!(await queryRunner.hasColumn('messages', 'userId'))) {
      await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "userId" varchar NULL`);
    }

    if (!(await queryRunner.hasColumn('messages', 'deletedAt'))) {
      // deletedAt from @DeleteDateColumn is a plain nullable datetime at the DB level
      await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "deletedAt" datetime NULL`);
    }

    if (!(await queryRunner.hasColumn('messages', 'expiresAt'))) {
      await queryRunner.query(`ALTER TABLE "messages" ADD COLUMN "expiresAt" datetime NULL`);
    }

    // Create composite indexes for recall queries. IF NOT EXISTS is supported by both dialects.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_messages_userId_createdAt" ON "messages" ("userId", "createdAt")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_messages_conversationId_createdAt" ON "messages" ("conversationId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes first (some DBs require this before dropping columns referenced by indexes)
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_messages_conversationId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_messages_userId_createdAt"`);

    // Drop columns (IF EXISTS not portable on older SQLite for columns, but DROP INDEX IF EXISTS is fine)
    if (await queryRunner.hasColumn('messages', 'expiresAt')) {
      await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "expiresAt"`);
    }

    if (await queryRunner.hasColumn('messages', 'deletedAt')) {
      await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "deletedAt"`);
    }

    if (await queryRunner.hasColumn('messages', 'userId')) {
      await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "userId"`);
    }

    if (await queryRunner.hasColumn('messages', 'conversationId')) {
      await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "conversationId"`);
    }
  }
}
