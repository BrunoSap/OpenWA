import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Phase 6 Plan 02b: Create analytics_aggregates table for pre-computed KPI rollups.
 *
 * Stores daily/hourly aggregations of raw analytics_events to optimize dashboard queries.
 * The unique constraint on (time_bucket, granularity, session_id) makes upserts idempotent.
 *
 * Cross-dialect: uses conditional syntax for timestamp, int, decimal types.
 */
export class CreateAnalyticsAggregates1787804119000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const dialect = queryRunner.connection.options.type;
    const isSqlite = dialect === 'better-sqlite3' || (dialect as string) === 'sqlite';

    await queryRunner.createTable(
      new Table({
        name: 'analytics_aggregates',
        columns: [
          {
            name: 'id',
            type: isSqlite ? 'integer' : 'serial',
            isPrimary: true,
            isGenerated: isSqlite,
            generationStrategy: isSqlite ? 'increment' : undefined,
          },
          {
            name: 'time_bucket',
            type: isSqlite ? 'datetime' : 'timestamp',
            isNullable: false,
          },
          {
            name: 'granularity',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'session_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'conversations_started',
            type: 'int',
            default: 0,
          },
          {
            name: 'conversations_resolved',
            type: 'int',
            default: 0,
          },
          {
            name: 'conversations_escalated',
            type: 'int',
            default: 0,
          },
          {
            name: 'messages_processed',
            type: 'int',
            default: 0,
          },
          {
            name: 'fallbacks_triggered',
            type: 'int',
            default: 0,
          },
          {
            name: 'latency_p50_ms',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'latency_p95_ms',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'latency_p99_ms',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'tokens_total',
            type: 'int',
            default: 0,
          },
          {
            name: 'cost_total_usd',
            type: isSqlite ? 'real' : 'decimal(10,4)',
            default: 0,
          },
          {
            name: 'resolution_rate',
            type: isSqlite ? 'real' : 'decimal(5,2)',
            isNullable: true,
          },
          {
            name: 'fallback_rate',
            type: isSqlite ? 'real' : 'decimal(5,2)',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: isSqlite ? 'datetime' : 'timestamp',
            default: isSqlite ? "CURRENT_TIMESTAMP" : 'NOW()',
          },
          {
            name: 'updated_at',
            type: isSqlite ? 'datetime' : 'timestamp',
            default: isSqlite ? "CURRENT_TIMESTAMP" : 'NOW()',
          },
        ],
      }),
      true,
    );

    // Unique constraint on (time_bucket, granularity, session_id) for idempotent upserts
    await queryRunner.createIndex(
      'analytics_aggregates',
      new TableIndex({
        name: 'UQ_analytics_aggregates_bucket',
        columnNames: ['time_bucket', 'granularity', 'session_id'],
        isUnique: true,
      }),
    );

    // Index on (time_bucket, granularity) for time-range queries
    await queryRunner.createIndex(
      'analytics_aggregates',
      new TableIndex({
        name: 'IDX_analytics_aggregates_time_granularity',
        columnNames: ['time_bucket', 'granularity'],
      }),
    );

    // Index on (session_id, time_bucket) for per-session time-series
    await queryRunner.createIndex(
      'analytics_aggregates',
      new TableIndex({
        name: 'IDX_analytics_aggregates_session_time',
        columnNames: ['session_id', 'time_bucket'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('analytics_aggregates', true);
  }
}
