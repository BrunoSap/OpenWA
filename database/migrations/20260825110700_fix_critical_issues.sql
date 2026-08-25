-- database/migrations/20260825110700_fix_critical_issues.sql
-- Comprehensive fix for all critical and high-priority issues
-- This migration adds missing triggers, fixes indexes, and improves constraints

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  CRITICAL FIX 1: Add updated_at triggers
-- ═══════════════════════════════════════════════════════════

-- Create trigger function for automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_updated_at_column IS 'Automatically updates updated_at timestamp on row modification';

-- Apply trigger to knowledge.clients
CREATE TRIGGER trigger_clients_updated_at
    BEFORE UPDATE ON knowledge.clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to intake_staging.leads
CREATE TRIGGER trigger_leads_updated_at
    BEFORE UPDATE ON intake_staging.leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to knowledge.session_context
CREATE TRIGGER trigger_session_context_updated_at
    BEFORE UPDATE ON knowledge.session_context
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to bot_config.auto_answer_rules
CREATE TRIGGER trigger_auto_answer_rules_updated_at
    BEFORE UPDATE ON bot_config.auto_answer_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
--  CRITICAL FIX 2: Replace ReDoS-vulnerable email validation
-- ═══════════════════════════════════════════════════════════

-- Drop the vulnerable constraint
ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_email_check;

-- Add simple, non-vulnerable email validation
-- This regex is safe from catastrophic backtracking
ALTER TABLE intake_staging.leads ADD CONSTRAINT leads_email_check
    CHECK (email IS NULL OR email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

COMMENT ON CONSTRAINT leads_email_check ON intake_staging.leads IS
    'Simple email validation (safe from ReDoS). Application layer should do full validation.';

-- ═══════════════════════════════════════════════════════════
--  HIGH FIX 3: Add GIN indexes for JSONB query paths
-- ═══════════════════════════════════════════════════════════

-- Index for knowledge.conversations.extracted_data
CREATE INDEX IF NOT EXISTS idx_conversations_extracted_data_gin
    ON knowledge.conversations USING gin (extracted_data);

COMMENT ON INDEX knowledge.idx_conversations_extracted_data_gin IS
    'GIN index for JSONB queries on extracted_data (e.g., extracted_data->>''type'')';

-- Index for intake_staging.leads.case_data
CREATE INDEX IF NOT EXISTS idx_leads_case_data_gin
    ON intake_staging.leads USING gin (case_data);

COMMENT ON INDEX intake_staging.idx_leads_case_data_gin IS
    'GIN index for JSONB queries on case_data (e.g., case_data->>''age'')';

-- Index for telegram.client_tasks.task_data (if table exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'telegram' AND table_name = 'client_tasks'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_client_tasks_task_data_gin
            ON telegram.client_tasks USING gin (task_data);

        COMMENT ON INDEX telegram.idx_client_tasks_task_data_gin IS
            'GIN index for JSONB queries on task_data';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  MEDIUM FIX 4: Add unique constraint for conversations
-- ═══════════════════════════════════════════════════════════

-- Prevent duplicate message inserts from webhook retries
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_chat_timestamp_unique
    ON knowledge.conversations (chat_id, timestamp);

COMMENT ON INDEX knowledge.idx_conversations_chat_timestamp_unique IS
    'Prevents duplicate webhook messages (WhatsApp can retry on network failures)';

-- ═══════════════════════════════════════════════════════════
--  LOW FIX 5: Add partial indexes for common queries
-- ═══════════════════════════════════════════════════════════

-- Partial index for unsynced leads (sync queue processing)
CREATE INDEX IF NOT EXISTS idx_leads_unsynced
    ON intake_staging.leads (intake_status)
    WHERE lawapp_synced = false;

COMMENT ON INDEX intake_staging.idx_leads_unsynced IS
    'Partial index for sync queue: WHERE lawapp_synced = false';

-- Partial index for active reminders
CREATE INDEX IF NOT EXISTS idx_document_reminders_active
    ON intake_staging.document_reminders (next_reminder_at)
    WHERE received = false AND gave_up = false;

COMMENT ON INDEX intake_staging.idx_document_reminders_active IS
    'Partial index for active reminders: WHERE received = false AND gave_up = false';

-- ═══════════════════════════════════════════════════════════
--  LOW FIX 6: Create fee parameters configuration table
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_config.fee_parameters (
    id SERIAL PRIMARY KEY,
    parameter_name VARCHAR(100) UNIQUE NOT NULL,
    parameter_value NUMERIC NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT fee_parameters_value_positive CHECK (parameter_value >= 0)
);

-- Add updated_at trigger
CREATE TRIGGER trigger_fee_parameters_updated_at
    BEFORE UPDATE ON bot_config.fee_parameters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default fee parameters (migrating hardcoded values)
INSERT INTO bot_config.fee_parameters (parameter_name, parameter_value, description)
VALUES
    ('uad_value_brl', 159.21, 'UAD value in BRL (R$)'),
    ('atrasados_percent', 30.0, 'Percentage for backpay fees'),
    ('vincendas_percent', 30.0, 'Percentage for future benefits'),
    ('default_uad_count', 60, 'Default estimated UAD count'),
    ('parcelamento_10x_percent', 40.0, 'Down payment percentage for 10x installments'),
    ('parcelamento_15x_percent', 40.0, 'Down payment percentage for 15x installments')
ON CONFLICT (parameter_name) DO NOTHING;

COMMENT ON TABLE bot_config.fee_parameters IS
    'Configurable fee calculation parameters (replaces hardcoded values in calculate_fees function)';

-- ═══════════════════════════════════════════════════════════
--  LOW FIX 7: Add embedding dimension configuration
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_config.embedding_config (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) UNIQUE NOT NULL,
    dimension INT NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    provider VARCHAR(50),
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT embedding_config_dimension_positive CHECK (dimension > 0)
);

-- Add updated_at trigger
CREATE TRIGGER trigger_embedding_config_updated_at
    BEFORE UPDATE ON bot_config.embedding_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert current embedding model
INSERT INTO bot_config.embedding_config (model_name, dimension, is_active, provider, notes)
VALUES
    ('text-embedding-3-small', 1536, TRUE, 'OpenAI', 'Current production model'),
    ('text-embedding-3-large', 3072, FALSE, 'OpenAI', 'High-quality alternative (requires ALTER TABLE)')
ON CONFLICT (model_name) DO NOTHING;

COMMENT ON TABLE bot_config.embedding_config IS
    'Tracks embedding model configuration (dimension 1536 is hardcoded in VECTOR columns)';

-- ═══════════════════════════════════════════════════════════
--  LOW FIX 8: Add comments to all indexes
-- ═══════════════════════════════════════════════════════════

-- knowledge.conversations indexes
COMMENT ON INDEX knowledge.idx_conversations_chat_timestamp IS 'Composite index for chat history queries';
COMMENT ON INDEX knowledge.idx_conversations_session IS 'Index for session-based message retrieval';
COMMENT ON INDEX knowledge.idx_conversations_from_user IS 'Index for filtering by sender (client/bot)';
COMMENT ON INDEX knowledge.idx_conversations_message_type IS 'Index for filtering by message type (text/audio/image/etc)';

-- knowledge.clients indexes
COMMENT ON INDEX knowledge.idx_clients_cpf IS 'Partial index for CPF lookups (excludes NULL)';
COMMENT ON INDEX knowledge.idx_clients_phone IS 'Partial index for phone lookups (excludes NULL)';
COMMENT ON INDEX knowledge.idx_clients_stage IS 'Index for filtering by intake stage';
COMMENT ON INDEX knowledge.idx_clients_lawapp IS 'Partial index for LawApp-synced clients';
COMMENT ON INDEX knowledge.idx_clients_last_seen IS 'Index for sorting by last activity (DESC)';

-- knowledge.documents indexes
COMMENT ON INDEX knowledge.idx_documents_client IS 'Foreign key index for client document queries';
COMMENT ON INDEX knowledge.idx_documents_type IS 'Index for filtering by document type (RG, CPF, etc)';
COMMENT ON INDEX knowledge.idx_documents_verified IS 'Index for filtering verified/unverified documents';
COMMENT ON INDEX knowledge.idx_documents_uploaded IS 'Index for sorting by upload date (DESC)';

-- knowledge.faq indexes
COMMENT ON INDEX knowledge.idx_faq_category IS 'Index for filtering FAQ by category';
COMMENT ON INDEX knowledge.idx_faq_embedding IS 'IVFFlat index for FAQ semantic search (10 clusters for ~50 rows)';

-- knowledge.session_context indexes
COMMENT ON INDEX knowledge.idx_session_chat IS 'Index for finding active sessions by chat_id';
COMMENT ON INDEX knowledge.idx_session_expires IS 'Index for session expiration cleanup jobs';

-- intake_staging.leads indexes
COMMENT ON INDEX intake_staging.idx_leads_chat IS 'Index for lead lookup by chat_id';
COMMENT ON INDEX intake_staging.idx_leads_cpf IS 'Partial index for CPF lookups (excludes NULL)';
COMMENT ON INDEX intake_staging.idx_leads_status IS 'Index for filtering by intake status';
COMMENT ON INDEX intake_staging.idx_leads_sync IS 'Composite index for LawApp sync queue processing';
COMMENT ON INDEX intake_staging.idx_leads_urgency IS 'Index for filtering by urgency level';
COMMENT ON INDEX intake_staging.idx_leads_created IS 'Index for sorting by creation date (DESC)';

-- intake_staging.lead_documents indexes
COMMENT ON INDEX intake_staging.idx_lead_documents_lead IS 'Foreign key index for lead document queries';
COMMENT ON INDEX intake_staging.idx_lead_documents_type IS 'Index for filtering by document type';
COMMENT ON INDEX intake_staging.idx_lead_documents_validated IS 'Index for filtering validated/unvalidated documents';
COMMENT ON INDEX intake_staging.idx_lead_documents_uploaded IS 'Index for sorting by upload date (DESC)';

-- intake_staging.lawapp_sync_queue indexes
COMMENT ON INDEX intake_staging.idx_lawapp_sync_queue_status IS 'Composite index for sync queue processing (status + retry)';
COMMENT ON INDEX intake_staging.idx_lawapp_sync_queue_lead IS 'Foreign key index for lead sync queries';

-- intake_staging.document_reminders indexes
COMMENT ON INDEX intake_staging.idx_document_reminders_next IS 'Composite index for reminder cron job (next_reminder_at + flags)';
COMMENT ON INDEX intake_staging.idx_document_reminders_lead IS 'Foreign key index for lead reminder queries';

-- bot_config.auto_answer_rules indexes
COMMENT ON INDEX bot_config.idx_auto_answer_rules_topic IS 'Index for topic-based auto-answer lookups';

-- bot_config.cron_jobs indexes
COMMENT ON INDEX bot_config.idx_cron_jobs_next_run IS 'Partial index for enabled cron jobs (WHERE enabled = TRUE)';

COMMIT;
