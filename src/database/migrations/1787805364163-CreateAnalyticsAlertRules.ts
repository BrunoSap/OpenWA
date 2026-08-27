import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 6 Plan 03 Task 2: Create analytics_alert_rules table (DASH-02).
 *
 * Stores configurable in-app alert rules. Evaluated by the analytics-alert processor
 * every 5 minutes. When a rule breaches, AlertDispatchService routes notifications.
 */
export class CreateAnalyticsAlertRules1787805364163 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const isSqlite = queryRunner.connection.options.type === 'better-sqlite3';

    await queryRunner.query(
      `
      CREATE TABLE analytics_alert_rules (
        id ${isSqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'SERIAL PRIMARY KEY'},
        name VARCHAR(255) NOT NULL,
        metric VARCHAR(100) NOT NULL,
        condition VARCHAR(20) NOT NULL,
        threshold DECIMAL(10, 2) NOT NULL,
        enabled ${isSqlite ? 'INTEGER DEFAULT 1' : 'BOOLEAN DEFAULT TRUE'},
        notification_channels ${isSqlite ? 'TEXT' : 'JSONB'} NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT ${isSqlite ? "CURRENT_TIMESTAMP" : 'NOW()'}
      )
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE analytics_alert_rules');
  }
}

