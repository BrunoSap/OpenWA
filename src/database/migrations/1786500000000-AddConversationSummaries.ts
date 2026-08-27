import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Phase 5 Plan 02: Add conversation_summaries table (MEM-03).
 *
 * Stores LLM/extractive summaries of older messages (beyond the sliding window) for each
 * (userId, conversationId) pair. The unique index on (userId, conversationId) ensures
 * upsert behavior: one summary row per conversation thread, updated on each summarization
 * run (T-05-07).
 *
 * Dialect-aware: postgres uses gen_random_uuid() for uuid default, sqlite relies on
 * PrimaryGeneratedColumn('uuid') in the entity (TypeORM handles it).
 */
export class AddConversationSummaries1786500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const driver = queryRunner.connection.options.type;
    const isPostgres = driver === 'postgres';

    // Create conversation_summaries table
    await queryRunner.createTable(
      new Table({
        name: 'conversation_summaries',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: isPostgres ? 'gen_random_uuid()' : undefined,
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'conversationId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'text',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'messageCount',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'oldestMessageDate',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'newestMessageDate',
            type: 'datetime',
            isNullable: true,
          },
          {
            name: 'updatedAt',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create unique index on (userId, conversationId) for upsert deduplication (T-05-07)
    await queryRunner.createIndex(
      'conversation_summaries',
      new TableIndex({
        name: 'UQ_conversation_summaries_user_conversation',
        columnNames: ['userId', 'conversationId'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop unique index first
    await queryRunner.dropIndex(
      'conversation_summaries',
      'UQ_conversation_summaries_user_conversation',
    );

    // Drop table
    await queryRunner.dropTable('conversation_summaries', true);
  }
}
