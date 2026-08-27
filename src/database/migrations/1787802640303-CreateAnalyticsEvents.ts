import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAnalyticsEvents1787802640303 implements MigrationInterface {
    name = 'CreateAnalyticsEvents1787802640303'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "intake_leads" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "chat_id" varchar NOT NULL, "phone" varchar, "cpf" varchar, "full_name" varchar, "email" varchar, "case_type" varchar NOT NULL, "urgency_level" varchar NOT NULL DEFAULT ('normal'), "case_data" text NOT NULL, "intake_status" varchar NOT NULL DEFAULT ('in_progress'), "intake_completed_at" text, "intake_started_at" datetime NOT NULL DEFAULT (datetime('now')), "updated_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_intake_leads_chat_id" ON "intake_leads" ("chat_id") `);
        await queryRunner.query(`CREATE TABLE "analytics_events" ("id" varchar PRIMARY KEY NOT NULL, "event_type" varchar NOT NULL, "session_id" varchar, "chat_id" varchar, "user_id" varchar, "conversation_id" varchar, "payload" text NOT NULL DEFAULT ('{}'), "latency_ms" integer, "tokens_used" integer, "cost_usd" decimal(10,6), "created_at" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_events_created" ON "analytics_events" ("created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_analytics_events_type_created" ON "analytics_events" ("event_type", "created_at") `);
        await queryRunner.query(`DROP INDEX "UQ_conversation_summaries_user_conversation"`);
        await queryRunner.query(`CREATE TABLE "temporary_conversation_summaries" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "conversationId" varchar NOT NULL, "text" text NOT NULL, "messageCount" integer NOT NULL, "oldestMessageDate" datetime, "newestMessageDate" datetime, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "temporary_conversation_summaries"("id", "userId", "conversationId", "text", "messageCount", "oldestMessageDate", "newestMessageDate", "updatedAt") SELECT "id", "userId", "conversationId", "text", "messageCount", "oldestMessageDate", "newestMessageDate", "updatedAt" FROM "conversation_summaries"`);
        await queryRunner.query(`DROP TABLE "conversation_summaries"`);
        await queryRunner.query(`ALTER TABLE "temporary_conversation_summaries" RENAME TO "conversation_summaries"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_conversation_summaries_user_conversation" ON "conversation_summaries" ("userId", "conversationId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "UQ_conversation_summaries_user_conversation"`);
        await queryRunner.query(`ALTER TABLE "conversation_summaries" RENAME TO "temporary_conversation_summaries"`);
        await queryRunner.query(`CREATE TABLE "conversation_summaries" ("id" uuid PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "conversationId" varchar NOT NULL, "text" text NOT NULL, "messageCount" int NOT NULL, "oldestMessageDate" datetime, "newestMessageDate" datetime, "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP))`);
        await queryRunner.query(`INSERT INTO "conversation_summaries"("id", "userId", "conversationId", "text", "messageCount", "oldestMessageDate", "newestMessageDate", "updatedAt") SELECT "id", "userId", "conversationId", "text", "messageCount", "oldestMessageDate", "newestMessageDate", "updatedAt" FROM "temporary_conversation_summaries"`);
        await queryRunner.query(`DROP TABLE "temporary_conversation_summaries"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_conversation_summaries_user_conversation" ON "conversation_summaries" ("userId", "conversationId") `);
        await queryRunner.query(`DROP INDEX "IDX_analytics_events_type_created"`);
        await queryRunner.query(`DROP INDEX "IDX_analytics_events_created"`);
        await queryRunner.query(`DROP TABLE "analytics_events"`);
        await queryRunner.query(`DROP INDEX "UQ_intake_leads_chat_id"`);
        await queryRunner.query(`DROP TABLE "intake_leads"`);
    }

}
