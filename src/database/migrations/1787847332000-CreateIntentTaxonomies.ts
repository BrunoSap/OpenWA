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
    const dialect = queryRunner.connection.options.type;
    const isSqlite = (dialect as string) === 'sqlite';

    if (isSqlite) {
      // SQLite: use raw SQL to avoid TypeORM AUTOINCREMENT issues
      // Create table with explicit AUTOINCREMENT
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS analytics_intent_taxonomies (
          id INTEGER PRIMARY KEY,
          tenant_id VARCHAR(255) NOT NULL DEFAULT 'global',
          intent_name VARCHAR(100) NOT NULL,
          intent_description TEXT,
          examples TEXT,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS IDX_intent_taxonomy_tenant_name
        ON analytics_intent_taxonomies (tenant_id, intent_name)
      `);
    } else {
      // PostgreSQL: use TypeORM Table API
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

      await queryRunner.createIndex(
        'analytics_intent_taxonomies',
        new TableIndex({
          name: 'IDX_intent_taxonomy_tenant_name',
          columnNames: ['tenant_id', 'intent_name'],
          isUnique: true,
        }),
      );
    }

    // Seed default taxonomy for 'global' tenant per RESEARCH.md L162-169
    // TEMPORARILY DISABLED FOR DEBUGGING
    /*
    if (isSqlite) {
      await queryRunner.query(`
        INSERT INTO analytics_intent_taxonomies (tenant_id, intent_name, intent_description)
        VALUES
          ('global', 'FAQ', 'Perguntas frequentes sobre produto/serviço'),
          ('global', 'Suporte Técnico', 'Problemas técnicos, bugs, troubleshooting'),
          ('global', 'Vendas', 'Interesse em comprar, pricing, features'),
          ('global', 'Reclamação', 'Insatisfação, problemas com atendimento'),
          ('global', 'Outros', 'Mensagens que não se encaixam nas categorias acima')
      `);
    } else {
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
    */
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('analytics_intent_taxonomies');
  }
}
