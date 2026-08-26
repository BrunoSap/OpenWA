-- database/rollbacks/rollback_008.sql
-- Rollback security improvements

BEGIN;

-- Disable Row-Level Security
ALTER TABLE knowledge.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.faq DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.session_context DISABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.lead_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.lawapp_sync_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.document_reminders DISABLE ROW LEVEL SECURITY;

-- Drop RLS policies
DROP POLICY IF EXISTS app_access_all ON knowledge.conversations;
DROP POLICY IF EXISTS app_access_all ON knowledge.clients;
DROP POLICY IF EXISTS app_access_all ON knowledge.documents;
DROP POLICY IF EXISTS app_access_all ON knowledge.faq;
DROP POLICY IF EXISTS app_access_all ON knowledge.session_context;
DROP POLICY IF EXISTS app_access_all ON intake_staging.leads;
DROP POLICY IF EXISTS app_access_all ON intake_staging.lead_documents;
DROP POLICY IF EXISTS app_access_all ON intake_staging.lawapp_sync_queue;
DROP POLICY IF EXISTS app_access_all ON intake_staging.document_reminders;

-- Drop length constraints
ALTER TABLE knowledge.conversations DROP CONSTRAINT IF EXISTS conversations_message_text_length;
ALTER TABLE knowledge.clients DROP CONSTRAINT IF EXISTS clients_context_summary_length;
ALTER TABLE knowledge.documents DROP CONSTRAINT IF EXISTS documents_extracted_text_length;
ALTER TABLE intake_staging.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_extracted_text_length;
ALTER TABLE intake_staging.lead_documents DROP CONSTRAINT IF EXISTS lead_documents_validation_notes_length;

-- Restore original email check
ALTER TABLE intake_staging.leads DROP CONSTRAINT leads_email_check;
ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_email_check CHECK (
        email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' OR email IS NULL
    );

-- Restore original CPF unique constraints
DROP INDEX IF EXISTS knowledge.idx_clients_cpf_unique;
DROP INDEX IF EXISTS intake_staging.idx_leads_cpf_unique;
ALTER TABLE knowledge.clients ADD CONSTRAINT clients_cpf_key UNIQUE (cpf);
ALTER TABLE intake_staging.leads ADD CONSTRAINT leads_cpf_key UNIQUE (cpf);

-- Drop phone validation
ALTER TABLE knowledge.clients DROP CONSTRAINT IF EXISTS clients_phone_format_check;
ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_phone_format_check;

-- Restore original documents.conversation_id foreign key
ALTER TABLE knowledge.documents
    DROP CONSTRAINT documents_conversation_id_fkey;
ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES knowledge.conversations(id)
    ON DELETE SET NULL;

COMMIT;
