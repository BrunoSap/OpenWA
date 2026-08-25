-- database/rollbacks/rollback_009.sql
-- Rollback performance improvements

BEGIN;

-- Drop composite indexes
DROP INDEX IF EXISTS knowledge.idx_conversations_chat_timestamp_desc;
DROP INDEX IF EXISTS knowledge.idx_conversations_session_timestamp;
DROP INDEX IF EXISTS knowledge.idx_documents_client_type;
DROP INDEX IF EXISTS intake_staging.idx_sync_queue_pending;

-- Drop GIN indexes
DROP INDEX IF EXISTS knowledge.idx_conversations_raw_media_gin;
DROP INDEX IF EXISTS knowledge.idx_conversations_extracted_data_gin;
DROP INDEX IF EXISTS knowledge.idx_clients_metadata_gin;
DROP INDEX IF EXISTS knowledge.idx_documents_structured_data_gin;
DROP INDEX IF EXISTS intake_staging.idx_leads_case_data_gin;
DROP INDEX IF EXISTS intake_staging.idx_leads_address_gin;
DROP INDEX IF EXISTS intake_staging.idx_leads_fee_structure_gin;
DROP INDEX IF EXISTS intake_staging.idx_lead_documents_structured_data_gin;
DROP INDEX IF EXISTS knowledge.idx_session_context_collected_data_gin;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_knowledge_session_context_updated_at ON knowledge.session_context;
DROP TRIGGER IF EXISTS trg_intake_staging_leads_updated_at ON intake_staging.leads;
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- Restore original foreign key constraints (without ON UPDATE CASCADE)
ALTER TABLE knowledge.documents
    DROP CONSTRAINT documents_client_id_fkey;
ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES knowledge.clients(id)
    ON DELETE CASCADE;

ALTER TABLE intake_staging.lead_documents
    DROP CONSTRAINT lead_documents_lead_id_fkey;
ALTER TABLE intake_staging.lead_documents
    ADD CONSTRAINT lead_documents_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES intake_staging.leads(id)
    ON DELETE CASCADE;

ALTER TABLE intake_staging.lawapp_sync_queue
    DROP CONSTRAINT lawapp_sync_queue_lead_id_fkey;
ALTER TABLE intake_staging.lawapp_sync_queue
    ADD CONSTRAINT lawapp_sync_queue_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES intake_staging.leads(id)
    ON DELETE CASCADE;

ALTER TABLE intake_staging.document_reminders
    DROP CONSTRAINT document_reminders_lead_id_fkey;
ALTER TABLE intake_staging.document_reminders
    ADD CONSTRAINT document_reminders_lead_id_fkey
    FOREIGN KEY (lead_id)
    REFERENCES intake_staging.leads(id)
    ON DELETE CASCADE;

COMMIT;
