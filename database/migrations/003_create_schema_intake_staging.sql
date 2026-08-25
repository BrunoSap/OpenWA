-- database/migrations/003_create_schema_intake_staging.sql
-- Schema for lead intake staging (before LawApp sync)

BEGIN;

CREATE SCHEMA IF NOT EXISTS intake_staging;

-- ═══════════════════════════════════════════════════════════
--  TABLE: leads
-- ═══════════════════════════════════════════════════════════
CREATE TABLE intake_staging.leads (
    id SERIAL PRIMARY KEY,

    -- Identificação
    chat_id VARCHAR(100) NOT NULL UNIQUE,
    phone VARCHAR(20),
    cpf VARCHAR(14),
    full_name VARCHAR(200),
    birth_date DATE,
    email VARCHAR(200),
    address JSONB,

    -- Caso
    case_type VARCHAR(50) NOT NULL,
    case_subtype VARCHAR(50),
    urgency_level VARCHAR(20) DEFAULT 'normal',
    case_data JSONB NOT NULL,

    -- Documentos
    documents_collected TEXT[],
    documents_missing TEXT[],

    -- Status
    intake_status VARCHAR(50) DEFAULT 'in_progress',
    intake_completed_at TIMESTAMP,
    intake_started_at TIMESTAMP DEFAULT NOW(),

    -- Cross-selling
    additional_opportunities JSONB,

    -- Honorários
    fee_structure JSONB,

    -- Sync LawApp
    lawapp_synced BOOLEAN DEFAULT FALSE,
    lawapp_opportunity_id UUID,
    lawapp_sync_attempted_at TIMESTAMP,
    lawapp_sync_error TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT leads_urgency_level_check CHECK (
        urgency_level IN ('normal', 'high', 'critical')
    ),
    CONSTRAINT leads_intake_status_check CHECK (
        intake_status IN ('in_progress', 'completed', 'approved', 'rejected', 'stalled')
    ),
    CONSTRAINT leads_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' OR email IS NULL)
);

-- Indexes
CREATE INDEX idx_leads_chat ON intake_staging.leads (chat_id);
CREATE INDEX idx_leads_cpf ON intake_staging.leads (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX idx_leads_status ON intake_staging.leads (intake_status);
CREATE INDEX idx_leads_sync ON intake_staging.leads (lawapp_synced, intake_status);
CREATE INDEX idx_leads_urgency ON intake_staging.leads (urgency_level);
CREATE INDEX idx_leads_created ON intake_staging.leads (created_at DESC);

COMMENT ON TABLE intake_staging.leads IS 'Lead intake staging (local storage before LawApp sync)';
COMMENT ON COLUMN intake_staging.leads.case_data IS 'Flexible JSONB for case-specific data (age, work_duration, etc)';
COMMENT ON COLUMN intake_staging.leads.fee_structure IS 'Calculated fees (atrasados_30_percent, vincendas_30_percent, uads_total)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: lead_documents
-- ═══════════════════════════════════════════════════════════
CREATE TABLE intake_staging.lead_documents (
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
    validated BOOLEAN DEFAULT FALSE,
    validation_notes TEXT,

    uploaded_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT lead_documents_storage_provider_check CHECK (
        storage_provider IN ('minio', 's3', 'gdrive') OR storage_provider IS NULL
    ),
    CONSTRAINT lead_documents_ocr_confidence_check CHECK (
        ocr_confidence BETWEEN 0 AND 1 OR ocr_confidence IS NULL
    ),
    CONSTRAINT lead_documents_file_size_check CHECK (file_size_bytes >= 0 OR file_size_bytes IS NULL)
);

-- Indexes
CREATE INDEX idx_lead_documents_lead ON intake_staging.lead_documents (lead_id);
CREATE INDEX idx_lead_documents_type ON intake_staging.lead_documents (document_type);
CREATE INDEX idx_lead_documents_validated ON intake_staging.lead_documents (validated);
CREATE INDEX idx_lead_documents_uploaded ON intake_staging.lead_documents (uploaded_at DESC);

COMMENT ON TABLE intake_staging.lead_documents IS 'Documents uploaded during intake with OCR extraction';

-- ═══════════════════════════════════════════════════════════
--  TABLE: lawapp_sync_queue
-- ═══════════════════════════════════════════════════════════
CREATE TABLE intake_staging.lawapp_sync_queue (
    id SERIAL PRIMARY KEY,
    lead_id INT REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    sync_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,

    -- Retry
    attempts INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    next_retry_at TIMESTAMP,

    -- Status
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,

    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT lawapp_sync_queue_attempts_check CHECK (attempts >= 0),
    CONSTRAINT lawapp_sync_queue_max_attempts_check CHECK (max_attempts > 0),
    CONSTRAINT lawapp_sync_queue_status_check CHECK (
        status IN ('pending', 'processing', 'completed', 'failed')
    )
);

-- Indexes
CREATE INDEX idx_lawapp_sync_queue_status ON intake_staging.lawapp_sync_queue (status, next_retry_at);
CREATE INDEX idx_lawapp_sync_queue_lead ON intake_staging.lawapp_sync_queue (lead_id);

COMMENT ON TABLE intake_staging.lawapp_sync_queue IS 'Queue for async LawApp API sync with retry logic';

-- ═══════════════════════════════════════════════════════════
--  TABLE: document_reminders
-- ═══════════════════════════════════════════════════════════
CREATE TABLE intake_staging.document_reminders (
    id SERIAL PRIMARY KEY,
    lead_id INT NOT NULL REFERENCES intake_staging.leads(id) ON DELETE CASCADE,

    document_type VARCHAR(50) NOT NULL,
    requested_at TIMESTAMP DEFAULT NOW(),

    -- Reminder tracking
    reminder_count INT DEFAULT 0,
    last_reminder_at TIMESTAMP,
    next_reminder_at TIMESTAMP,

    -- Estratégia
    reminder_frequency_hours INT DEFAULT 48,
    max_reminders INT DEFAULT 3,

    -- Status
    received BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMP,
    gave_up BOOLEAN DEFAULT FALSE,

    -- Constraints
    CONSTRAINT document_reminders_reminder_count_check CHECK (reminder_count >= 0),
    CONSTRAINT document_reminders_max_reminders_check CHECK (max_reminders > 0),
    CONSTRAINT document_reminders_frequency_check CHECK (reminder_frequency_hours > 0)
);

-- Indexes
CREATE INDEX idx_document_reminders_next ON intake_staging.document_reminders (next_reminder_at, received, gave_up);
CREATE INDEX idx_document_reminders_lead ON intake_staging.document_reminders (lead_id);

COMMENT ON TABLE intake_staging.document_reminders IS 'Document reminder tracking with progressive escalation';

COMMIT;
