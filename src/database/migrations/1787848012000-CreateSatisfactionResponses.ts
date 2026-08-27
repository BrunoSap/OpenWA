import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Phase 10 Plan 03: Create analytics_satisfaction_responses table for NPS/CSAT survey storage.
 *
 * Stores user responses to post-conversation satisfaction surveys sent via WhatsApp interactive messages.
 * Survey types: 'nps' (0-10 scale) and 'csat' (1-5 scale).
 *
 * Indexes:
 * - (session_id, responded_at): Backs correlation queries with conversation events
 * - (survey_type, responded_at): Backs NPS/CSAT time-range aggregations
 * - UNIQUE(conversation_id, user_id, survey_type): Prevents duplicate responses per conversation (T-10-13)
 */
export class CreateSatisfactionResponses1787848012000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;

    await queryRunner.createTable(
      new Table({
        name: 'analytics_satisfaction_responses',
        columns: [
          {
            name: 'id',
            type: dialect === 'sqlite' ? 'varchar' : 'uuid',
            isPrimary: true,
            default: dialect === 'sqlite' ? "(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))))" : 'gen_random_uuid()',
          },
          {
            name: 'conversation_id',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'session_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'survey_type',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'score',
            type: dialect === 'sqlite' ? 'integer' : 'int',
            isNullable: false,
          },
          {
            name: 'responded_at',
            type: dialect === 'sqlite' ? 'datetime' : 'timestamp',
            default: dialect === 'sqlite' ? "datetime('now')" : 'NOW()',
          },
        ],
      }),
      true,
    );

    // Composite index: (session_id, responded_at) for correlation queries
    await queryRunner.createIndex(
      'analytics_satisfaction_responses',
      new TableIndex({
        name: 'IDX_satisfaction_session_time',
        columnNames: ['session_id', 'responded_at'],
      }),
    );

    // Composite index: (survey_type, responded_at) for time-range aggregations
    await queryRunner.createIndex(
      'analytics_satisfaction_responses',
      new TableIndex({
        name: 'IDX_satisfaction_type_time',
        columnNames: ['survey_type', 'responded_at'],
      }),
    );

    // UNIQUE constraint: prevents duplicate survey responses per conversation (threat T-10-13)
    await queryRunner.createIndex(
      'analytics_satisfaction_responses',
      new TableIndex({
        name: 'IDX_satisfaction_unique',
        columnNames: ['conversation_id', 'user_id', 'survey_type'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('analytics_satisfaction_responses', true);
  }
}
