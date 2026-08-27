import { MigrationInterface, QueryRunner, Table } from 'typeorm';

/**
 * Phase 10 Plan 02 Task 1: Create analytics_ab_experiments table for A/B testing support.
 *
 * Stores experiment configuration (name, variant count, date range) enabling funnel
 * analytics by variant. Variant assignment uses consistent hashing (no per-user storage).
 */
export class CreateABExperiments1787847968000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'analytics_ab_experiments',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'experiment_id',
            type: 'varchar',
            length: '100',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'variant_count',
            type: 'integer',
            default: 2,
            isNullable: false,
          },
          {
            name: 'variant_names',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'start_date',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'end_date',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'active',
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
    await queryRunner.dropTable('analytics_ab_experiments');
  }
}
