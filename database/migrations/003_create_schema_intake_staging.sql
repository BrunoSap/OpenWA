-- database/migrations/003_create_schema_intake_staging.sql
-- Schema for lead intake staging (before LawApp sync)
-- FIXES: Idempotent, stronger email validation, JSONB size limits, composite indexes, audit trail

BEGIN;

CREATE SCHEMA IF NOT EXISTS intake_staging;

-- ═══════════════════════════════════════════════════════════
--  TABLE: leads
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.leads (
    id SERIAL PRIMARY KEY,

    -- Identificação
    chat_id VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    cpf VARCHAR(14),
    full_name VARCHAR(200),
    birth_date DATE,
    email VARCHAR(200),
    address JSONB,

    -- Caso
    case_type VARCHAR(50) NOT NULL,
    case_subtype VARCHAR(50),
    urgency_level VARCHAR(20) NOT NULL DEFAULT 'normal',
    case_data JSONB NOT NULL,

    -- Documentos
    documents_collected TEXT[],
    documents_missing TEXT[],

    -- Status
    intake_status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    intake_completed_at TIMESTAMPTZ,
    intake_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Cross-selling
    additional_opportunities JSONB,

    -- Honorários
    fee_structure JSONB,

    -- Sync LawApp
    lawapp_synced BOOLEAN NOT NULL DEFAULT FALSE,
    lawapp_opportunity_id UUID,
    lawapp_sync_attempted_at TIMESTAMPTZ,
    lawapp_sync_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT leads_chat_id_unique UNIQUE (chat_id),
    CONSTRAINT leads_cpf_unique UNIQUE (cpf),
    CONSTRAINT leads_chat_id_check CHECK (chat_id ~ '^[0-9]+(@.+)?$'),
    CONSTRAINT leads_phone_check CHECK (
        phone IS NULL OR phone ~ '^\+?[1-9]\d{7,14}$'
    ),
    CONSTRAINT leads_cpf_check CHECK (
        cpf IS NULL OR cpf ~ '^\d{11}$'
    ),
    CONSTRAINT leads_urgency_level_check CHECK (
        urgency_level IN ('normal', 'high', 'critical')
    ),
    CONSTRAINT leads_intake_status_check CHECK (
        intake_status IN ('in_progress', 'completed', 'approved', 'rejected', 'stalled')
    ),
    -- FIXED: Stronger email validation (min 3-char domain, proper structure)
    CONSTRAINT leads_email_check CHECK (
        email IS NULL OR (
            email ~* '^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$'
            AND email !~ '\.\.'
            AND length(split_part(email, '@', 2)) >= 4
        )
    ),
    CONSTRAINT leads_birth_date_check CHECK (
        birth_date IS NULL OR (birth_date >= '1900-01-01' AND birth_date <= CURRENT_DATE)
    ),
    -- JSONB size limits (1MB each)
    CONSTRAINT leads_case_data_size_check CHECK (
        pg_column_size(case_data) < 1048576
    ),
    CONSTRAINT leads_address_size_check CHECK (
        address IS NULL OR pg_column_size(address) < 1048576
    ),
    CONSTRAINT leads_additional_opportunities_size_check CHECK (
        additional_opportunities IS NULL OR pg_column_size(additional_opportunities) < 1048576
    ),
    CONSTRAINT leads_fee_structure_size_check CHECK (
        fee_structure IS NULL OR pg_column_size(fee_structure) < 1048576
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_leads_chat
    ON intake_staging.leads (chat_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_cpf
    ON intake_staging.leads (cpf)
    WHERE cpf IS NOT NULL AND deleted_at IS NULL;

-- Composite index for status + sync queries (common workflow query)
CREATE INDEX IF NOT EXISTS idx_leads_status_sync
    ON intake_staging.leads (intake_status, lawapp_synced)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_urgency
    ON intake_staging.leads (urgency_level)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_created
    ON intake_staging.leads (created_at DESC)
    WHERE deleted_at IS NULL;

-- Composite index for sync queue processing
CREATE INDEX IF NOT EXISTS idx_leads_pending_sync
    ON intake_staging.leads (lawapp_synced, intake_status, updated_at)
    WHERE deleted_at IS NULL AND lawapp_synced = FALSE;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_leads_deleted
    ON intake_staging.leads (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE intake_staging.leads IS 'Lead intake staging (local storage before LawApp sync, soft delete enabled)';
COMMENT ON COLUMN intake_staging.leads.case_data IS 'Flexible JSONB for case-specific data (age, work_duration, etc). Max 1MB.';
COMMENT ON COLUMN intake_staging.leads.fee_structure IS 'Calculated fees (atrasados_30_percent, vincendas_30_percent, uads_total). Max 1MB.';

-- ═══════════════════════════════════════════════════════════
--  TABLE: lead_documents
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.lead_documents (
    id SERIAL PRIMARY KEY,
    lead_id INT NOT NULL REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    document_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,

    -- Storage
    storage_provider VARCHAR(20),
    storage_path TEXT NOT NULL,
    storage_url TEXT,

    -- Extração
    extracted_text TEXT,
    structured_data JSONB,
    ocr_confidence FLOAT,

    -- Validação
    validated BOOLEAN NOT NULL DEFAULT FALSE,
    validated_by VARCHAR(100),
    validated_at TIMESTAMPTZ,
    validation_notes TEXT,

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT lead_documents_storage_provider_check CHECK (
        storage_provider IN ('minio', 's3', 'gdrive') OR storage_provider IS NULL
    ),
    CONSTRAINT lead_documents_ocr_confidence_check CHECK (
        ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)
    ),
    CONSTRAINT lead_documents_file_size_check CHECK (
        file_size_bytes IS NULL OR file_size_bytes > 0
    ),
    CONSTRAINT lead_documents_structured_data_size_check CHECK (
        structured_data IS NULL OR pg_column_size(structured_data) < 1048576
    ),
    CONSTRAINT lead_documents_validated_at_check CHECK (
        (validated = FALSE AND validated_at IS NULL) OR
        (validated = TRUE AND validated_at IS NOT NULL)
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead
    ON intake_staging.lead_documents (lead_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_documents_type
    ON intake_staging.lead_documents (document_type)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_documents_validated
    ON intake_staging.lead_documents (validated)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_documents_uploaded
    ON intake_staging.lead_documents (uploaded_at DESC)
    WHERE deleted_at IS NULL;

-- Composite index for lead + type queries
CREATE INDEX IF NOT EXISTS idx_lead_documents_lead_type
    ON intake_staging.lead_documents (lead_id, document_type)
    WHERE deleted_at IS NULL;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_lead_documents_deleted
    ON intake_staging.lead_documents (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE intake_staging.lead_documents IS 'Documents uploaded during intake with OCR extraction (soft delete enabled)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: lawapp_sync_queue
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.lawapp_sync_queue (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    sync_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,

    -- Retry
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT lawapp_sync_queue_attempts_check CHECK (attempts >= 0),
    CONSTRAINT lawapp_sync_queue_max_attempts_check CHECK (max_attempts > 0),
    CONSTRAINT lawapp_sync_queue_attempts_max_check CHECK (attempts <= max_attempts),
    CONSTRAINT lawapp_sync_queue_status_check CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    ),
    CONSTRAINT lawapp_sync_queue_payload_size_check CHECK (
        pg_column_size(payload) < 1048576
    )
);

-- Performance indexes (composite for queue processing)
CREATE INDEX IF NOT EXISTS idx_lawapp_sync_queue_pending
    ON intake_staging.lawapp_sync_queue (status, next_retry_at)
    WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_lawapp_sync_queue_lead
    ON intake_staging.lawapp_sync_queue (lead_id);

CREATE INDEX IF NOT EXISTS idx_lawapp_sync_queue_created
    ON intake_staging.lawapp_sync_queue (created_at DESC);

COMMENT ON TABLE intake_staging.lawapp_sync_queue IS 'Queue for async LawApp API sync with retry logic';

-- ═══════════════════════════════════════════════════════════
--  TABLE: document_reminders
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.document_reminders (
    id SERIAL PRIMARY KEY,
    lead_id INT NOT NULL REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    document_type VARCHAR(50) NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Reminder tracking
    reminder_count INT NOT NULL DEFAULT 0,
    last_reminder_at TIMESTAMPTZ,
    next_reminder_at TIMESTAMPTZ,

    -- Estratégia
    reminder_frequency_hours INT NOT NULL DEFAULT 48,
    max_reminders INT NOT NULL DEFAULT 3,

    -- Status
    received BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ,
    gave_up BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT document_reminders_reminder_count_check CHECK (reminder_count >= 0),
    CONSTRAINT document_reminders_max_reminders_check CHECK (max_reminders > 0),
    CONSTRAINT document_reminders_reminder_count_max_check CHECK (reminder_count <= max_reminders),
    CONSTRAINT document_reminders_frequency_check CHECK (reminder_frequency_hours > 0),
    CONSTRAINT document_reminders_received_at_check CHECK (
        (received = FALSE AND received_at IS NULL) OR
        (received = TRUE AND received_at IS NOT NULL)
    )
);

-- Performance indexes (composite for reminder processing)
CREATE INDEX IF NOT EXISTS idx_document_reminders_pending
    ON intake_staging.document_reminders (next_reminder_at)
    WHERE received = FALSE AND gave_up = FALSE AND next_reminder_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_reminders_lead
    ON intake_staging.document_reminders (lead_id);

CREATE INDEX IF NOT EXISTS idx_document_reminders_status
    ON intake_staging.document_reminders (received, gave_up);

COMMENT ON TABLE intake_staging.document_reminders IS 'Document reminder tracking with progressive escalation';

-- ═══════════════════════════════════════════════════════════
--  AUDIT TABLE: audit_log
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER NOT NULL,
    operation VARCHAR(10) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT audit_log_operation_check CHECK (
        operation IN ('INSERT', 'UPDATE', 'DELETE')
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
    ON intake_staging.audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
    ON intake_staging.audit_log (changed_at DESC);

COMMENT ON TABLE intake_staging.audit_log IS 'Audit trail for all changes to sensitive tables';

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: updated_at auto-update
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION intake_staging.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'intake_staging'
        AND column_name = 'updated_at'
        AND table_name != 'audit_log'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_update_updated_at ON intake_staging.%I;
            CREATE TRIGGER trigger_update_updated_at
                BEFORE UPDATE ON intake_staging.%I
                FOR EACH ROW
                EXECUTE FUNCTION intake_staging.update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: Audit trail for sensitive tables
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION intake_staging.audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers to sensitive tables
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['leads', 'lead_documents']) LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_audit ON intake_staging.%I;
            CREATE TRIGGER trigger_audit
                AFTER INSERT OR UPDATE OR DELETE ON intake_staging.%I
                FOR EACH ROW
                EXECUTE FUNCTION intake_staging.audit_trigger_func();
        ', t, t);
    END LOOP;
END;
$$;

-- Record migration
SELECT public.record_migration('003_create_schema_intake_staging', 'Create intake_staging schema with security and audit', NULL, NULL);

COMMIT;
