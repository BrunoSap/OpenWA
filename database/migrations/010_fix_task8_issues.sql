-- database/migrations/010_fix_task8_issues.sql
-- Comprehensive fixes for Task 8 security and reliability issues

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  FIX 1: Create schema_migrations tracking table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    checksum VARCHAR(64), -- SHA256 of migration file
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    applied_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    execution_time_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,

    CONSTRAINT schema_migrations_version_check CHECK (version ~ '^[0-9]{3,}_[a-z0-9_]+$')
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version
    ON public.schema_migrations (version);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at
    ON public.schema_migrations (applied_at DESC);

COMMENT ON TABLE public.schema_migrations IS 'Migration tracking (Flyway/Liquibase-style) for rollback and skip detection';

-- ═══════════════════════════════════════════════════════════
--  FIX 2: Add business_rules table (extract magic numbers from FAQ)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS bot_config.business_rules (
    id SERIAL PRIMARY KEY,
    rule_name VARCHAR(100) UNIQUE NOT NULL,
    rule_value JSONB NOT NULL,
    rule_type VARCHAR(50) NOT NULL, -- 'percentage', 'currency', 'integer', 'text'
    description TEXT,

    -- Audit columns
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    version INTEGER NOT NULL DEFAULT 1,

    -- Soft delete
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),

    CONSTRAINT business_rules_rule_type_check CHECK (
        rule_type IN ('percentage', 'currency', 'integer', 'text', 'boolean', 'array')
    )
);

CREATE INDEX IF NOT EXISTS idx_business_rules_name
    ON bot_config.business_rules (rule_name)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE bot_config.business_rules IS 'Business configuration (percentages, values) extracted from hardcoded FAQ text';

-- ═══════════════════════════════════════════════════════════
--  FIX 3: Add audit columns to auto_answer_rules
-- ═══════════════════════════════════════════════════════════
ALTER TABLE bot_config.auto_answer_rules
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100);

-- ═══════════════════════════════════════════════════════════
--  FIX 4: Add audit columns and rate limiting to cron_jobs
-- ═══════════════════════════════════════════════════════════
ALTER TABLE bot_config.cron_jobs
    ADD COLUMN IF NOT EXISTS max_concurrent_executions INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS backoff_strategy VARCHAR(20) NOT NULL DEFAULT 'exponential',
    ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 3,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100);

-- Add CHECK constraint for cron job scheduling
ALTER TABLE bot_config.cron_jobs
    DROP CONSTRAINT IF EXISTS cron_jobs_next_run_check,
    ADD CONSTRAINT cron_jobs_next_run_check CHECK (
        enabled = FALSE OR next_run IS NOT NULL
    );

-- Add constraint for backoff_strategy
ALTER TABLE bot_config.cron_jobs
    ADD CONSTRAINT cron_jobs_backoff_strategy_check CHECK (
        backoff_strategy IN ('exponential', 'linear', 'constant', 'none')
    );

-- Add constraint for max_concurrent_executions
ALTER TABLE bot_config.cron_jobs
    ADD CONSTRAINT cron_jobs_max_concurrent_check CHECK (
        max_concurrent_executions > 0 AND max_concurrent_executions <= 100
    );

-- ═══════════════════════════════════════════════════════════
--  FIX 5: Add composite index to cron_jobs (enabled, next_run)
-- ═══════════════════════════════════════════════════════════
DROP INDEX IF EXISTS bot_config.idx_cron_jobs_next_run;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled_next_run
    ON bot_config.cron_jobs (enabled, next_run)
    WHERE enabled = TRUE AND next_run IS NOT NULL;

COMMENT ON INDEX bot_config.idx_cron_jobs_enabled_next_run IS 'Composite index for job scheduler queries (enabled + next_run)';

-- ═══════════════════════════════════════════════════════════
--  FIX 6: Improve email validation in intake_staging.leads
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'intake_staging'
        AND table_name = 'leads'
    ) THEN
        -- Drop old weak constraint
        ALTER TABLE intake_staging.leads
            DROP CONSTRAINT IF EXISTS leads_email_check;

        -- Add strong email validation regex
        -- Requires: username@domain.tld (at least 2-char TLD)
        ALTER TABLE intake_staging.leads
            ADD CONSTRAINT leads_email_check CHECK (
                email IS NULL OR
                email ~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            );
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  FIX 7: Add i18n support to FAQ
-- ═══════════════════════════════════════════════════════════
ALTER TABLE knowledge.faq
    ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
    ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT TRUE;

-- Add constraint for valid language codes (ISO 639-1 + region)
ALTER TABLE knowledge.faq
    ADD CONSTRAINT faq_language_check CHECK (
        language ~ '^[a-z]{2}(-[A-Z]{2})?$'
    );

-- Composite index for category + language queries
CREATE INDEX IF NOT EXISTS idx_faq_category_language
    ON knowledge.faq (category, language)
    WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
--  FIX 8: Add foreign key from FAQ to auto_answer_rules
-- ═══════════════════════════════════════════════════════════
-- First, add a default 'general' topic to auto_answer_rules if not exists
INSERT INTO bot_config.auto_answer_rules (topic, auto_answer_enabled, escalate_to_human)
VALUES ('general', TRUE, FALSE)
ON CONFLICT (topic) DO NOTHING;

-- Update existing FAQ rows to use valid topics from auto_answer_rules
UPDATE knowledge.faq
SET category = 'general'
WHERE category IS NULL
   OR category NOT IN (SELECT topic FROM bot_config.auto_answer_rules);

-- Now add FK constraint
ALTER TABLE knowledge.faq
    DROP CONSTRAINT IF EXISTS faq_category_fk,
    ADD CONSTRAINT faq_category_fk
        FOREIGN KEY (category)
        REFERENCES bot_config.auto_answer_rules(topic)
        ON UPDATE CASCADE
        ON DELETE SET DEFAULT;

-- ═══════════════════════════════════════════════════════════
--  FIX 9: Remove redundant index on auto_answer_rules.topic
-- ═══════════════════════════════════════════════════════════
-- UNIQUE constraint already creates an index, so drop the redundant one
DROP INDEX IF EXISTS bot_config.idx_auto_answer_rules_topic;

COMMENT ON COLUMN bot_config.auto_answer_rules.topic IS
    'Category: honorarios, documentos, prazos, urgencia_violencia, etc (UNIQUE index auto-created)';

-- ═══════════════════════════════════════════════════════════
--  FIX 10: Create query performance logging table
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.query_performance_log (
    id BIGSERIAL PRIMARY KEY,
    query_hash VARCHAR(64) NOT NULL, -- MD5 of normalized query
    query_text TEXT,
    execution_time_ms NUMERIC(10, 3) NOT NULL,
    rows_returned BIGINT,

    -- Query plan info
    index_used VARCHAR(200),
    scan_type VARCHAR(50), -- 'seq_scan', 'index_scan', 'bitmap_scan', etc

    -- Context
    user_name VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    application_name VARCHAR(100),
    client_addr INET,

    -- Timing
    executed_at TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT query_performance_execution_time_check CHECK (execution_time_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_query_performance_hash
    ON public.query_performance_log (query_hash);

CREATE INDEX IF NOT EXISTS idx_query_performance_time
    ON public.query_performance_log (execution_time_ms DESC);

CREATE INDEX IF NOT EXISTS idx_query_performance_executed_at
    ON public.query_performance_log (executed_at DESC);

COMMENT ON TABLE public.query_performance_log IS 'Slow query detection and index usage monitoring (observability)';

-- ═══════════════════════════════════════════════════════════
--  FIX 11: Create audit trigger for updated_by tracking
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.track_updates()
RETURNS TRIGGER AS $$
BEGIN
    -- Track who made the update
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_by = CURRENT_USER;
        NEW.updated_at = NOW();

        -- Increment version if column exists
        IF TG_TABLE_SCHEMA = 'bot_config' THEN
            NEW.version = OLD.version + 1;
        END IF;
    ELSIF TG_OP = 'INSERT' THEN
        NEW.created_by = CURRENT_USER;
        NEW.created_at = NOW();
        NEW.version = 1;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with audit columns
DO $$
DECLARE
    t TEXT;
    s TEXT;
BEGIN
    FOR s, t IN
        SELECT table_schema, table_name
        FROM information_schema.columns
        WHERE table_schema IN ('bot_config')
        AND column_name = 'updated_by'
        AND table_name IN ('auto_answer_rules', 'cron_jobs', 'business_rules')
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_track_updates ON %I.%I;
            CREATE TRIGGER trigger_track_updates
                BEFORE INSERT OR UPDATE ON %I.%I
                FOR EACH ROW
                EXECUTE FUNCTION public.track_updates();
        ', s, t, s, t);
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  FIX 12: Transaction isolation level documentation
-- ═══════════════════════════════════════════════════════════
-- Create a view to document recommended isolation levels
CREATE OR REPLACE VIEW public.migration_best_practices AS
SELECT
    'seed_data' AS operation_type,
    'REPEATABLE READ' AS recommended_isolation_level,
    'Prevents phantom reads during multi-INSERT seed operations' AS reason
UNION ALL
SELECT
    'bulk_updates' AS operation_type,
    'REPEATABLE READ' AS recommended_isolation_level,
    'Ensures consistent view of data during batch processing' AS reason
UNION ALL
SELECT
    'DDL_operations' AS operation_type,
    'READ COMMITTED' AS recommended_isolation_level,
    'DDL locks prevent concurrent modifications anyway' AS reason
UNION ALL
SELECT
    'concurrent_writes' AS operation_type,
    'SERIALIZABLE' AS recommended_isolation_level,
    'Prevents write skew and ensures true serializability' AS reason;

COMMENT ON VIEW public.migration_best_practices IS
    'Documents recommended transaction isolation levels for different operations';

-- Record migration in tracking table
INSERT INTO public.schema_migrations (version, description, success)
VALUES ('010_fix_task8_issues', 'Fix 12 critical issues in Task 8', TRUE)
ON CONFLICT (version) DO NOTHING;

COMMIT;
