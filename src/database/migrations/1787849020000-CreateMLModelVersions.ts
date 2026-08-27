import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateMLModelVersions1735318800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'ml_model_versions',
        columns: [
          {
            name: 'id',
            type: 'integer',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'model_name',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'training_date',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'dataset_size',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'accuracy',
            type: 'decimal',
            precision: 5,
            scale: 4,
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'text', // Will store JSON (cross-dialect compatible)
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
    await queryRunner.dropTable('ml_model_versions');
  }
}
