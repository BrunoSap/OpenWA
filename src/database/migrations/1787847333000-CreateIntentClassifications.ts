import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Phase 10 Plan 01: Create analytics_intent_classifications table (DASH-03).
 *
 * Stores LLM-classified intents for each message. Populated by IntentClassificationProcessor
 * (BullMQ hourly job) which batches unclassified messages and sends them to Anthropic Batch API.
 *
 * Indexes:
 * - (session_id, classified_at): Time-range queries per session
 * - (intent_name, classified_at): Intent distribution over time
 */
export class CreateIntentClassifications1787847333000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'analytics_intent_classifications',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'message_id',
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
            name: 'chat_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'intent_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'confidence',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'classified_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Index for session-scoped time-range queries
    await queryRunner.createIndex(
      'analytics_intent_classifications',
      new TableIndex({
        name: 'IDX_intent_classification_session_time',
        columnNames: ['session_id', 'classified_at'],
      }),
    );

    // Index for intent distribution over time
    await queryRunner.createIndex(
      'analytics_intent_classifications',
      new TableIndex({
        name: 'IDX_intent_classification_intent_time',
        columnNames: ['intent_name', 'classified_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('analytics_intent_classifications');
  }
}
