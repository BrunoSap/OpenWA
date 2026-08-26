-- database/rollbacks/20260825120000_security_performance_fixes_rollback.sql
-- Rollback for security and performance fixes

BEGIN;

-- Remove v2 functions
DROP FUNCTION IF EXISTS knowledge.find_similar_faq_v2(VECTOR, FLOAT, INT);
DROP FUNCTION IF EXISTS knowledge.find_similar_conversations_v2(VECTOR, VARCHAR, FLOAT, INT);
DROP FUNCTION IF EXISTS knowledge.get_client_summary_v2(VARCHAR);
DROP FUNCTION IF EXISTS knowledge.calculate_fees_v2(NUMERIC, NUMERIC, INT);

-- Remove compound index
DROP INDEX IF EXISTS knowledge.idx_conversations_chat_embedding;

-- Disable RLS
ALTER TABLE knowledge.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.leads DISABLE ROW LEVEL SECURITY;

-- Drop RLS policies
DROP POLICY IF EXISTS tenant_isolation_clients ON knowledge.clients;
DROP POLICY IF EXISTS tenant_isolation_conversations ON knowledge.conversations;
DROP POLICY IF EXISTS tenant_isolation_documents ON knowledge.documents;
DROP POLICY IF EXISTS tenant_isolation_leads ON intake_staging.leads;

-- Remove audit columns
ALTER TABLE knowledge.clients
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE knowledge.documents
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS updated_by;

ALTER TABLE intake_staging.leads
    DROP COLUMN IF EXISTS created_by,
    DROP COLUMN IF EXISTS updated_by;

-- Remove audit triggers
DROP TRIGGER IF EXISTS trigger_audit_clients ON knowledge.clients;
DROP TRIGGER IF EXISTS trigger_audit_documents ON knowledge.documents;
DROP TRIGGER IF EXISTS trigger_audit_leads ON intake_staging.leads;
DROP FUNCTION IF EXISTS knowledge.update_audit_columns();

-- Remove CPF validation
DROP FUNCTION IF EXISTS knowledge.validate_cpf(TEXT);
ALTER TABLE knowledge.clients DROP CONSTRAINT IF EXISTS clients_cpf_check;
ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_cpf_check;

-- Restore original CPF check
ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_cpf_check CHECK (
        cpf IS NULL OR cpf ~ '^\d{11}$'
    );

ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_cpf_check CHECK (
        cpf IS NULL OR cpf ~ '^\d{11}$'
    );

-- Remove email validation
ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_email_check;

-- Remove fee config table
DROP TABLE IF EXISTS bot_config.fee_config CASCADE;

-- Remove observability views
DROP VIEW IF EXISTS knowledge.query_performance_stats;
DROP FUNCTION IF EXISTS knowledge.log_slow_query(TEXT, FLOAT, FLOAT);

-- Remove migration record
DELETE FROM public.schema_migrations
WHERE migration_name = '20260825120000_security_performance_fixes';

COMMIT;
