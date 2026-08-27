import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Phase 10 Plan 01 Task 2: Create analytics_intent_routing_rules table.
 *
 * Stores intent-based routing rules for automated actions after classification.
 * Rules map an intent to an action (escalate, assign_agent, trigger_workflow) with
 * configuration in JSONB.
 *
 * Enforcement logic deferred to future phase — this migration enables CRUD only.
 */
export class CreateIntentRoutingRules1787847334000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'analytics_intent_routing_rules',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'intent_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'action',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'action_config',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'enabled',
            type: 'boolean',
            default: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('analytics_intent_routing_rules');
  }
}
