-- database/migrations/20260825110800_create_migration_tracking.sql
-- Create schema_migrations table for tracking applied migrations
-- Prevents re-runs and enables rollback to specific versions

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  Create schema_migrations table
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    execution_time_ms INT,
    checksum VARCHAR(64),

    CONSTRAINT schema_migrations_execution_time_check CHECK (execution_time_ms >= 0)
);

CREATE INDEX idx_schema_migrations_version ON public.schema_migrations (version);
CREATE INDEX idx_schema_migrations_applied_at ON public.schema_migrations (applied_at DESC);

COMMENT ON TABLE public.schema_migrations IS 'Tracks applied migrations (Flyway/Liquibase pattern)';
COMMENT ON COLUMN public.schema_migrations.version IS 'Migration filename or timestamp (e.g., 20260825110700)';
COMMENT ON COLUMN public.schema_migrations.checksum IS 'SHA-256 of migration file content (detects tampering)';
COMMENT ON COLUMN public.schema_migrations.execution_time_ms IS 'Migration execution time in milliseconds';

-- ═══════════════════════════════════════════════════════════
--  Backfill existing migrations
-- ═══════════════════════════════════════════════════════════

-- Note: These are the original migrations (without timestamps)
-- We're recording them as applied since the schema already exists
INSERT INTO public.schema_migrations (version, description, applied_at)
VALUES
    ('001_install_pgvector', 'Install pgvector extension', NOW() - INTERVAL '1 hour'),
    ('002_create_schema_knowledge', 'Create knowledge schema (conversations, clients, documents, FAQ)', NOW() - INTERVAL '55 minutes'),
    ('003_create_schema_intake_staging', 'Create intake_staging schema (leads, sync queue, reminders)', NOW() - INTERVAL '50 minutes'),
    ('004_create_schema_telegram', 'Create telegram schema (client_tasks, etc)', NOW() - INTERVAL '45 minutes'),
    ('005_create_schema_bot_config', 'Create bot_config schema (auto_answer_rules, cron_jobs)', NOW() - INTERVAL '40 minutes'),
    ('006_create_helper_functions', 'Create helper functions (find_similar_faq, calculate_fees, etc)', NOW() - INTERVAL '35 minutes'),
    ('007_seed_data', 'Seed initial data (FAQ, auto_answer_rules, etc)', NOW() - INTERVAL '30 minutes')
ON CONFLICT (version) DO NOTHING;

-- Record this migration itself
INSERT INTO public.schema_migrations (version, description)
VALUES ('20260825110800_create_migration_tracking', 'Create schema_migrations tracking table')
ON CONFLICT (version) DO NOTHING;

COMMIT;
