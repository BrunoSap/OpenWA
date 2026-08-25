-- database/migrations/003_fix_intake_staging_critical_issues.sql
-- CRITICAL FIXES for intake_staging schema
-- Addresses: CPF encryption, validation, indexes, audit trail, LGPD compliance
-- Ticket: Task 4 security and performance improvements

BEGIN;

-- Install pgcrypto for CPF encryption (LGPD compliance)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS intake_staging;

-- ═══════════════════════════════════════════════════════════
--  REFERENCE TABLES: Eliminate magic strings
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.case_types (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS intake_staging.document_types (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed reference data
INSERT INTO intake_staging.case_types (code, name, description) VALUES
    ('trabalhista', 'Trabalhista', 'Direito do trabalho'),
    ('previdenciario', 'Previdenciário', 'Previdência social'),
    ('civil', 'Civil', 'Direito civil')
ON CONFLICT (code) DO NOTHING;

INSERT INTO intake_staging.document_types (code, name, required) VALUES
    ('rg', 'RG', TRUE),
    ('cpf_doc', 'CPF', TRUE),
    ('ctps', 'Carteira de Trabalho', TRUE),
    ('comprovante_residencia', 'Comprovante de Residência', TRUE),
    ('extrato_fgts', 'Extrato FGTS', FALSE),
    ('carta_demissao', 'Carta de Demissão', FALSE)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE intake_staging.case_types IS 'Reference table for case types - eliminates magic strings';
COMMENT ON TABLE intake_staging.document_types IS 'Reference table for document types - eliminates magic strings';

-- ═══════════════════════════════════════════════════════════
--  CPF VALIDATION FUNCTION (Luhn algorithm for Brazilian CPF)
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION intake_staging.validate_cpf(cpf TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    cpf_clean TEXT;
    sum1 INT := 0;
    sum2 INT := 0;
    digit1 INT;
    digit2 INT;
    i INT;
BEGIN
    -- Remove non-numeric characters
    cpf_clean := regexp_replace(cpf, '[^0-9]', '', 'g');

    -- Must be exactly 11 digits
    IF length(cpf_clean) != 11 THEN
        RETURN FALSE;
    END IF;

    -- Reject known invalid sequences (all same digit)
    IF cpf_clean ~ '^([0-9])\1{10}$' THEN
        RETURN FALSE;
    END IF;

    -- Calculate first check digit
    FOR i IN 1..9 LOOP
        sum1 := sum1 + substring(cpf_clean, i, 1)::INT * (11 - i);
    END LOOP;
    digit1 := 11 - (sum1 % 11);
    IF digit1 >= 10 THEN
        digit1 := 0;
    END IF;

    -- Validate first check digit
    IF digit1 != substring(cpf_clean, 10, 1)::INT THEN
        RETURN FALSE;
    END IF;

    -- Calculate second check digit
    FOR i IN 1..10 LOOP
        sum2 := sum2 + substring(cpf_clean, i, 1)::INT * (12 - i);
    END LOOP;
    digit2 := 11 - (sum2 % 11);
    IF digit2 >= 10 THEN
        digit2 := 0;
    END IF;

    -- Validate second check digit
    IF digit2 != substring(cpf_clean, 11, 1)::INT THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION intake_staging.validate_cpf IS 'Validates Brazilian CPF using Luhn algorithm with check digits. Rejects invalid patterns like "11111111111".';

-- ═══════════════════════════════════════════════════════════
--  TABLE: leads (DROP AND RECREATE with all fixes)
-- ═══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS intake_staging.leads CASCADE;

CREATE TABLE intake_staging.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificação (PII encrypted/hashed)
    chat_id VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    cpf_encrypted BYTEA, -- pgcrypto AES-256 encrypted
    cpf_hash VARCHAR(64), -- SHA-256 hash for lookups (non-reversible)
    full_name VARCHAR(200),
    birth_date DATE,
    email VARCHAR(200),
    address JSONB,

    -- Caso
    case_type VARCHAR(50) NOT NULL REFERENCES intake_staging.case_types(code),
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
    lawapp_sync_error JSONB, -- Structured: {code, message, details, timestamp}

    -- Audit trail (user accountability)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    version INT NOT NULL DEFAULT 1,

    -- Soft delete (forensic capability)
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT leads_chat_id_unique UNIQUE (chat_id),
    CONSTRAINT leads_cpf_hash_unique UNIQUE (cpf_hash),
    CONSTRAINT leads_chat_id_check CHECK (chat_id ~ '^[0-9]+(@.+)?$'),
    -- FIXED: Phone validation - numeric only, 10-15 digits
    CONSTRAINT leads_phone_check CHECK (
        phone IS NULL OR phone ~ '^\+?[1-9]\d{9,14}$'
    ),
    CONSTRAINT leads_urgency_level_check CHECK (
        urgency_level IN ('normal', 'high', 'critical')
    ),
    CONSTRAINT leads_intake_status_check CHECK (
        intake_status IN ('in_progress', 'completed', 'approved', 'rejected', 'stalled')
    ),
    -- FIXED: Stronger email validation (min 2-char TLD after dot, proper structure)
    CONSTRAINT leads_email_check CHECK (
        email IS NULL OR (
            email ~* '^[A-Za-z0-9][A-Za-z0-9._%+-]*@[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$'
            AND email !~ '\.\.'
            AND length(split_part(email, '@', 2)) >= 4
            AND split_part(email, '.', -1) ~ '^[A-Za-z]{2,}$'
        )
    ),
    CONSTRAINT leads_birth_date_check CHECK (
        birth_date IS NULL OR (birth_date >= '1900-01-01' AND birth_date <= CURRENT_DATE)
    ),
    -- FIXED: JSONB size limits (1MB each) to prevent DoS attacks
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
    ),
    -- FIXED: Array size limits (max 1000 elements) to prevent memory exhaustion
    CONSTRAINT leads_documents_collected_size_check CHECK (
        documents_collected IS NULL OR array_length(documents_collected, 1) IS NULL OR array_length(documents_collected, 1) <= 1000
    ),
    CONSTRAINT leads_documents_missing_size_check CHECK (
        documents_missing IS NULL OR array_length(documents_missing, 1) IS NULL OR array_length(documents_missing, 1) <= 1000
    )
);

-- ═══════════════════════════════════════════════════════════
--  PERFORMANCE INDEXES (including GIN for JSONB)
-- ═══════════════════════════════════════════════════════════
CREATE INDEX idx_leads_chat
    ON intake_staging.leads (chat_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_cpf_hash
    ON intake_staging.leads (cpf_hash)
    WHERE cpf_hash IS NOT NULL AND deleted_at IS NULL;

-- FIXED: Missing indexes on email/phone for search queries
CREATE INDEX idx_leads_email
    ON intake_staging.leads (email)
    WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_leads_phone
    ON intake_staging.leads (phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;

-- FIXED: Compound index for priority queue (intake_status, urgency_level)
CREATE INDEX idx_leads_priority_queue
    ON intake_staging.leads (intake_status, urgency_level, created_at DESC)
    WHERE deleted_at IS NULL AND intake_status = 'in_progress';

CREATE INDEX idx_leads_status_sync
    ON intake_staging.leads (intake_status, lawapp_synced)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_urgency
    ON intake_staging.leads (urgency_level)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_created
    ON intake_staging.leads (created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_leads_pending_sync
    ON intake_staging.leads (lawapp_synced, intake_status, updated_at)
    WHERE deleted_at IS NULL AND lawapp_synced = FALSE;

-- FIXED: GIN indexes for JSONB fields (O(log n) instead of O(n) table scans)
CREATE INDEX idx_leads_case_data_gin
    ON intake_staging.leads USING GIN (case_data);

CREATE INDEX idx_leads_address_gin
    ON intake_staging.leads USING GIN (address);

CREATE INDEX idx_leads_additional_opportunities_gin
    ON intake_staging.leads USING GIN (additional_opportunities);

CREATE INDEX idx_leads_fee_structure_gin
    ON intake_staging.leads USING GIN (fee_structure);

CREATE INDEX idx_leads_deleted
    ON intake_staging.leads (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE intake_staging.leads IS 'Lead intake staging - LGPD compliant with CPF encryption, soft delete, audit trail, and security constraints';
COMMENT ON COLUMN intake_staging.leads.cpf_encrypted IS 'AES-256 encrypted CPF (pgcrypto). Use decrypt_cpf() to read. LGPD compliant.';
COMMENT ON COLUMN intake_staging.leads.cpf_hash IS 'SHA-256 hash of CPF for uniqueness checks (non-reversible). Index-friendly.';
COMMENT ON COLUMN intake_staging.leads.case_data IS 'JSONB for case-specific data (age, work_duration, etc). Max 1MB. GIN indexed.';
COMMENT ON COLUMN intake_staging.leads.lawapp_sync_error IS 'Structured error: {code, message, details, timestamp}. Machine-parseable.';

-- ═══════════════════════════════════════════════════════════
--  TABLE: lead_documents (DROP AND RECREATE with fixes)
-- ═══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS intake_staging.lead_documents CASCADE;

CREATE TABLE intake_staging.lead_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    document_type VARCHAR(50) NOT NULL REFERENCES intake_staging.document_types(code),
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
    validation_notes JSONB, -- Structured: {status, issues: [{code, message}], reviewer}

    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    version INT NOT NULL DEFAULT 1,

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
    CONSTRAINT lead_documents_validation_notes_size_check CHECK (
        validation_notes IS NULL OR pg_column_size(validation_notes) < 1048576
    ),
    CONSTRAINT lead_documents_validated_at_check CHECK (
        (validated = FALSE AND validated_at IS NULL) OR
        (validated = TRUE AND validated_at IS NOT NULL)
    )
);

-- Performance indexes
CREATE INDEX idx_lead_documents_lead
    ON intake_staging.lead_documents (lead_id)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lead_documents_type
    ON intake_staging.lead_documents (document_type)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lead_documents_validated
    ON intake_staging.lead_documents (validated)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lead_documents_uploaded
    ON intake_staging.lead_documents (uploaded_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_lead_documents_lead_type
    ON intake_staging.lead_documents (lead_id, document_type)
    WHERE deleted_at IS NULL;

-- FIXED: Index for file name search
CREATE INDEX idx_lead_documents_file_name
    ON intake_staging.lead_documents (file_name)
    WHERE file_name IS NOT NULL AND deleted_at IS NULL;

-- FIXED: GIN index for structured_data queries
CREATE INDEX idx_lead_documents_structured_data_gin
    ON intake_staging.lead_documents USING GIN (structured_data);

CREATE INDEX idx_lead_documents_deleted
    ON intake_staging.lead_documents (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE intake_staging.lead_documents IS 'Documents with OCR extraction - soft delete enabled, audit trail';
COMMENT ON COLUMN intake_staging.lead_documents.validation_notes IS 'Structured: {status, issues: [{code, message}], reviewer}. Machine-parseable.';

-- ═══════════════════════════════════════════════════════════
--  TABLE: lawapp_sync_queue (DROP AND RECREATE with fixes)
-- ═══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS intake_staging.lawapp_sync_queue CASCADE;

CREATE TABLE intake_staging.lawapp_sync_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    sync_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,

    -- Retry
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message JSONB, -- Structured: {code, message, details, timestamp}

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
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
    ),
    CONSTRAINT lawapp_sync_queue_error_size_check CHECK (
        error_message IS NULL OR pg_column_size(error_message) < 1048576
    )
);

-- Performance indexes
CREATE INDEX idx_lawapp_sync_queue_pending
    ON intake_staging.lawapp_sync_queue (status, next_retry_at)
    WHERE status IN ('pending', 'processing');

CREATE INDEX idx_lawapp_sync_queue_lead
    ON intake_staging.lawapp_sync_queue (lead_id);

CREATE INDEX idx_lawapp_sync_queue_created
    ON intake_staging.lawapp_sync_queue (created_at DESC);

-- FIXED: Index for retry monitoring dashboard
CREATE INDEX idx_lawapp_sync_queue_attempts
    ON intake_staging.lawapp_sync_queue (attempts, status)
    WHERE status = 'failed';

COMMENT ON TABLE intake_staging.lawapp_sync_queue IS 'Async LawApp sync queue with retry logic and structured errors';

-- ═══════════════════════════════════════════════════════════
--  TABLE: document_reminders (DROP AND RECREATE with fixes)
-- ═══════════════════════════════════════════════════════════
DROP TABLE IF EXISTS intake_staging.document_reminders CASCADE;

CREATE TABLE intake_staging.document_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    document_type VARCHAR(50) NOT NULL REFERENCES intake_staging.document_types(code),
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
    created_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,

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

-- Performance indexes
CREATE INDEX idx_document_reminders_pending
    ON intake_staging.document_reminders (next_reminder_at)
    WHERE received = FALSE AND gave_up = FALSE AND next_reminder_at IS NOT NULL;

CREATE INDEX idx_document_reminders_lead
    ON intake_staging.document_reminders (lead_id);

CREATE INDEX idx_document_reminders_status
    ON intake_staging.document_reminders (received, gave_up);

COMMENT ON TABLE intake_staging.document_reminders IS 'Document reminder tracking with progressive escalation';

-- ═══════════════════════════════════════════════════════════
--  AUDIT TABLE: audit_log
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS intake_staging.audit_log (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    operation VARCHAR(10) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    changed_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT audit_log_operation_check CHECK (
        operation IN ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE')
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
    ON intake_staging.audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
    ON intake_staging.audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
    ON intake_staging.audit_log (changed_by);

COMMENT ON TABLE intake_staging.audit_log IS 'Audit trail - LGPD compliance, forensic capability, user accountability';

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: updated_at, updated_by, version auto-update
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION intake_staging.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    NEW.updated_by = COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER);
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at (except reference and audit tables)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'intake_staging'
        AND column_name = 'updated_at'
        AND table_name NOT IN ('audit_log', 'case_types', 'document_types')
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
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, new_data, changed_by)
        VALUES (
            TG_TABLE_NAME,
            NEW.id,
            'INSERT',
            row_to_json(NEW),
            COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Detect soft delete
        IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
            INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
            VALUES (
                TG_TABLE_NAME,
                NEW.id,
                'SOFT_DELETE',
                row_to_json(OLD),
                row_to_json(NEW),
                COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
            );
        ELSE
            INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
            VALUES (
                TG_TABLE_NAME,
                NEW.id,
                'UPDATE',
                row_to_json(OLD),
                row_to_json(NEW),
                COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
            );
        END IF;
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, changed_by)
        VALUES (
            TG_TABLE_NAME,
            OLD.id,
            'DELETE',
            row_to_json(OLD),
            COALESCE(CURRENT_SETTING('app.current_user', TRUE), CURRENT_USER)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Apply audit triggers
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['leads', 'lead_documents', 'lawapp_sync_queue', 'document_reminders']) LOOP
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

-- ═══════════════════════════════════════════════════════════
--  HELPER FUNCTIONS: CPF encryption/decryption
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION intake_staging.encrypt_cpf(cpf_plain TEXT, encryption_key TEXT)
RETURNS BYTEA AS $$
DECLARE
    cpf_clean TEXT;
BEGIN
    -- Validate CPF first
    IF NOT intake_staging.validate_cpf(cpf_plain) THEN
        RAISE EXCEPTION 'Invalid CPF: %. Failed Luhn validation.', cpf_plain;
    END IF;

    -- Remove non-numeric characters
    cpf_clean := regexp_replace(cpf_plain, '[^0-9]', '', 'g');

    -- Encrypt using AES-256 (pgcrypto)
    RETURN encrypt(cpf_clean::bytea, encryption_key::bytea, 'aes');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION intake_staging.decrypt_cpf(cpf_encrypted BYTEA, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    -- Decrypt using AES-256
    RETURN convert_from(decrypt(cpf_encrypted, encryption_key::bytea, 'aes'), 'UTF8');
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION intake_staging.hash_cpf(cpf_plain TEXT)
RETURNS VARCHAR(64) AS $$
DECLARE
    cpf_clean TEXT;
BEGIN
    -- Remove non-numeric characters
    cpf_clean := regexp_replace(cpf_plain, '[^0-9]', '', 'g');

    -- SHA-256 hash
    RETURN encode(digest(cpf_clean, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION intake_staging.encrypt_cpf IS 'Encrypts CPF with AES-256 after validation. LGPD compliant. Use with app secret key.';
COMMENT ON FUNCTION intake_staging.decrypt_cpf IS 'Decrypts AES-256 encrypted CPF. Use with app secret key.';
COMMENT ON FUNCTION intake_staging.hash_cpf IS 'SHA-256 hash for CPF uniqueness lookups (non-reversible, index-friendly)';

-- Record migration
SELECT public.record_migration(
    '003_fix_intake_staging_critical_issues',
    'CRITICAL FIXES: CPF encryption, validation, GIN indexes, audit trail, LGPD compliance',
    NULL,
    NULL
);

COMMIT;
