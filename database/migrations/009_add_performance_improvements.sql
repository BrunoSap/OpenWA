-- database/migrations/009_add_performance_improvements.sql
-- Add composite indexes, GIN indexes for JSONB, ON UPDATE CASCADE, updated_at triggers

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  PERFORMANCE: Composite indexes for common queries
-- ═══════════════════════════════════════════════════════════

-- Recent messages by chat (most common query)
CREATE INDEX idx_conversations_chat_timestamp_desc
    ON knowledge.conversations (chat_id, timestamp DESC);

-- Session messages ordered by time
CREATE INDEX idx_conversations_session_timestamp
    ON knowledge.conversations (session_id, timestamp)
    WHERE session_id IS NOT NULL;

-- Client documents by type
CREATE INDEX idx_documents_client_type
    ON knowledge.documents (client_id, document_type);

-- Pending sync queue (sorted by retry time)
CREATE INDEX idx_sync_queue_pending
    ON intake_staging.lawapp_sync_queue (status, next_retry_at)
    WHERE status IN ('pending', 'processing');

-- ═══════════════════════════════════════════════════════════
--  PERFORMANCE: GIN indexes for JSONB columns
-- ═══════════════════════════════════════════════════════════

CREATE INDEX idx_conversations_raw_media_gin
    ON knowledge.conversations USING GIN (raw_media)
    WHERE raw_media IS NOT NULL;

CREATE INDEX idx_conversations_extracted_data_gin
    ON knowledge.conversations USING GIN (extracted_data)
    WHERE extracted_data IS NOT NULL;

CREATE INDEX idx_clients_metadata_gin
    ON knowledge.clients USING GIN (metadata)
    WHERE metadata IS NOT NULL;

CREATE INDEX idx_documents_structured_data_gin
    ON knowledge.documents USING GIN (structured_data)
    WHERE structured_data IS NOT NULL;

CREATE INDEX idx_leads_case_data_gin
    ON intake_staging.leads USING GIN (case_data);

CREATE INDEX idx_leads_address_gin
    ON intake_staging.leads USING GIN (address)
    WHERE address IS NOT NULL;

CREATE INDEX idx_leads_fee_structure_gin
    ON intake_staging.leads USING GIN (fee_structure)
    WHERE fee_structure IS NOT NULL;

CREATE INDEX idx_lead_documents_structured_data_gin
    ON intake_staging.lead_documents USING GIN (structured_data)
    WHERE structured_data IS NOT NULL;

CREATE INDEX idx_session_context_collected_data_gin
    ON knowledge.session_context USING GIN (collected_data)
    WHERE collected_data IS NOT NULL;

COMMENT ON INDEX idx_leads_case_data_gin IS 'GIN index for fast JSONB queries on case_data';

-- ═══════════════════════════════════════════════════════════
--  MAINTAINABILITY: Add ON UPDATE CASCADE for foreign keys
-- ═══════════════════════════════════════════════════════════

-- knowledge.documents.client_id
ALTER TABLE knowledge.documents
    DROP CONSTRAINT documents_client_id_fkey;

ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES knowledge.clients(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- intake_staging.lead_documents.lead_id
ALTER TABLE intake_staging.lead_documents
    DROP CONSTRAINT lead_documents_lead_id_fkey;

ALTER TABLE intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES intake_staging.leads(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- intake_staging.lawapp_sync_queue.lead_id
ALTER TABLE intake_staging.lawapp_sync_queue
    DROP CONSTRAINT lawapp_sync_queue_lead_id_fkey;

ALTER TABLE intake_staging.lawapp_sync_queue
    ADD CONSTRAINT lawapp_sync_queue_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES intake_staging.leads(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- intake_staging.document_reminders.lead_id
ALTER TABLE intake_staging.document_reminders
    DROP CONSTRAINT document_reminders_lead_id_fkey;

ALTER TABLE intake_staging.document_reminders
    ADD CONSTRAINT document_reminders_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES intake_staging.leads(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════
--  MAINTAINABILITY: Automatic updated_at triggers
-- ═══════════════════════════════════════════════════════════

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.update_updated_at_column IS 'Automatically updates updated_at timestamp on row modification';

-- Apply trigger to tables with updated_at column
CREATE TRIGGER trg_knowledge_session_context_updated_at
    BEFORE UPDATE ON knowledge.session_context
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_intake_staging_leads_updated_at
    BEFORE UPDATE ON intake_staging.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════
--  MAINTAINABILITY: Add missing comments
-- ═══════════════════════════════════════════════════════════

COMMENT ON INDEX idx_conversations_chat_timestamp IS 'Composite index for chat history queries';
COMMENT ON INDEX idx_conversations_session ON knowledge.conversations IS 'Filter conversations by session';
COMMENT ON INDEX idx_conversations_from_user ON knowledge.conversations IS 'Filter by sender (client/bot)';
COMMENT ON INDEX idx_conversations_message_type ON knowledge.conversations IS 'Filter by message type';

COMMENT ON INDEX idx_clients_cpf ON knowledge.clients IS 'Partial index for CPF lookups (excludes NULLs)';
COMMENT ON INDEX idx_clients_phone ON knowledge.clients IS 'Partial index for phone lookups (excludes NULLs)';
COMMENT ON INDEX idx_clients_stage ON knowledge.clients IS 'Filter by current stage';
COMMENT ON INDEX idx_clients_lawapp ON knowledge.clients IS 'Partial index for LawApp sync (excludes NULLs)';
COMMENT ON INDEX idx_clients_last_seen ON knowledge.clients IS 'Sort by last activity';

COMMENT ON INDEX idx_documents_client ON knowledge.documents IS 'Foreign key index for client documents';
COMMENT ON INDEX idx_documents_type ON knowledge.documents IS 'Filter by document type';
COMMENT ON INDEX idx_documents_verified ON knowledge.documents IS 'Filter verified documents';
COMMENT ON INDEX idx_documents_uploaded ON knowledge.documents IS 'Sort by upload date';

COMMENT ON INDEX idx_faq_category ON knowledge.faq IS 'Filter FAQ by category';

COMMENT ON INDEX idx_session_chat ON knowledge.session_context IS 'Lookup sessions by chat_id';
COMMENT ON INDEX idx_session_expires ON knowledge.session_context IS 'Find expired sessions for cleanup';

COMMIT;
