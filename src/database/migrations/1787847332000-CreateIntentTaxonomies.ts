import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Phase 10 Plan 01: Create analytics_intent_taxonomies table (DASH-03).
 *
 * Stores per-tenant intent taxonomy for LLM classification. Each tenant can define custom
 * intent categories with descriptions and optional few-shot examples. The system prompt for
 * Anthropic batch classification is built from this taxonomy.
 *
 * UNIQUE(tenant_id, intent_name) constraint ensures one intent per name per tenant.
 */
export class CreateIntentTaxonomies1787847332000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'analytics_intent_taxonomies',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'tenant_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
            default: "'global'",
          },
          {
            name: 'intent_name',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'intent_description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'examples',
            type: 'text',
            isArray: true,
            isNullable: true,
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

    // Create unique index on (tenant_id, intent_name)
    await queryRunner.createIndex(
      'analytics_intent_taxonomies',
      new TableIndex({
        name: 'IDX_intent_taxonomy_tenant_name',
        columnNames: ['tenant_id', 'intent_name'],
        isUnique: true,
      }),
    );

    // Seed default taxonomy for 'global' tenant per RESEARCH.md L162-169
    await queryRunner.query(`
      INSERT INTO analytics_intent_taxonomies (tenant_id, intent_name, intent_description)
      VALUES
        ('global', 'FAQ', 'Perguntas frequentes sobre produto/serviço'),
        ('global', 'Suporte Técnico', 'Problemas técnicos, bugs, troubleshooting'),
        ('global', 'Vendas', 'Interesse em comprar, pricing, features'),
        ('global', 'Reclamação', 'Insatisfação, problemas com atendimento'),
        ('global', 'Outros', 'Mensagens que não se encaixam nas categorias acima')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('analytics_intent_taxonomies');
  }
}
