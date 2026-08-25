-- database/migrations/008_add_security_improvements.sql
-- Add Row-Level Security, input validation, and improved constraints

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  SECURITY: Row-Level Security Policies
-- ═══════════════════════════════════════════════════════════

-- Enable RLS on knowledge schema
ALTER TABLE knowledge.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.faq ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge.session_context ENABLE ROW LEVEL SECURITY;

-- Enable RLS on intake_staging schema
ALTER TABLE intake_staging.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.lead_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.lawapp_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_staging.document_reminders ENABLE ROW LEVEL SECURITY;

-- Default policy: application user can access all (for now)
-- In production, replace with actual business logic (e.g., by office, by lawyer)
CREATE POLICY app_access_all ON knowledge.conversations
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON knowledge.clients
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON knowledge.documents
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON knowledge.faq
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON knowledge.session_context
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON intake_staging.leads
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON intake_staging.lead_documents
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON intake_staging.lawapp_sync_queue
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

CREATE POLICY app_access_all ON intake_staging.document_reminders
    FOR ALL
    TO PUBLIC
    USING (true)
    WITH CHECK (true);

COMMENT ON POLICY app_access_all ON knowledge.conversations IS 'Default policy - replace with office/lawyer-specific logic in production';

-- ═══════════════════════════════════════════════════════════
--  INPUT VALIDATION: Add length limits to TEXT fields
-- ═══════════════════════════════════════════════════════════

-- knowledge.conversations
ALTER TABLE knowledge.conversations
    ADD CONSTRAINT conversations_message_text_length CHECK (
        message_text IS NULL OR length(message_text) <= 50000
    );

-- knowledge.clients
ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_context_summary_length CHECK (
        context_summary IS NULL OR length(context_summary) <= 10000
    );

-- knowledge.documents
ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_extracted_text_length CHECK (
        extracted_text IS NULL OR length(extracted_text) <= 100000
    );

-- intake_staging.lead_documents
ALTER TABLE intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_extracted_text_length CHECK (
        extracted_text IS NULL OR length(extracted_text) <= 100000
    );

ALTER TABLE intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_validation_notes_length CHECK (
        validation_notes IS NULL OR length(validation_notes) <= 5000
    );

-- ═══════════════════════════════════════════════════════════
--  IMPROVE EMAIL VALIDATION
-- ═══════════════════════════════════════════════════════════

ALTER TABLE intake_staging.leads DROP CONSTRAINT leads_email_check;
ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_email_check CHECK (
        email IS NULL OR (
            email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
            AND length(email) >= 6  -- a@b.co minimum
            AND length(email) <= 200
        )
    );

-- ═══════════════════════════════════════════════════════════
--  DATA INTEGRITY: Fix CPF NULL uniqueness issue
-- ═══════════════════════════════════════════════════════════

-- Drop existing unique constraint on cpf (allows NULLs)
ALTER TABLE knowledge.clients DROP CONSTRAINT IF EXISTS clients_cpf_key;
ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_cpf_key;

-- Add conditional unique index (NULL-safe)
CREATE UNIQUE INDEX idx_clients_cpf_unique
    ON knowledge.clients (cpf)
    WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX idx_leads_cpf_unique
    ON intake_staging.leads (cpf)
    WHERE cpf IS NOT NULL;

COMMENT ON INDEX idx_clients_cpf_unique IS 'Ensures CPF uniqueness, allowing multiple NULL values';

-- ═══════════════════════════════════════════════════════════
--  DATA INTEGRITY: Add phone format validation
-- ═══════════════════════════════════════════════════════════

ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_phone_format_check CHECK (
        phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'
    );

ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_phone_format_check CHECK (
        phone IS NULL OR phone ~ '^\+?[0-9]{10,15}$'
    );

COMMENT ON CONSTRAINT clients_phone_format_check ON knowledge.clients IS 'Phone must be 10-15 digits, optional + prefix';

-- ═══════════════════════════════════════════════════════════
--  FIX REFERENTIAL INTEGRITY: documents.conversation_id
-- ═══════════════════════════════════════════════════════════

-- Drop existing foreign key
ALTER TABLE knowledge.documents
    DROP CONSTRAINT IF EXISTS documents_conversation_id_fkey;

-- Recreate with ON DELETE CASCADE (preserve referential integrity)
ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_conversation_id_fkey
    FOREIGN KEY (conversation_id)
    REFERENCES knowledge.conversations(id)
    ON DELETE CASCADE;

COMMENT ON CONSTRAINT documents_conversation_id_fkey ON knowledge.documents IS 'Cascade delete to preserve referential integrity';

COMMIT;
