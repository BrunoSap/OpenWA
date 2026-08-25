-- database/migrations/002_create_schema_knowledge.sql
-- Schema for knowledge management (conversations, clients, documents, FAQ)
-- FIXES: Idempotent, security validations, composite indexes, audit trail, soft deletes

BEGIN;

-- Create schema (idempotent)
CREATE SCHEMA IF NOT EXISTS knowledge;

-- ═══════════════════════════════════════════════════════════
--  TABLE: conversations
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge.conversations (
    id SERIAL PRIMARY KEY,

    -- Identificação
    chat_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(100) NOT NULL,
    session_id VARCHAR(100),

    -- Sender
    from_user VARCHAR(20) NOT NULL,

    -- Timing
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Conteúdo
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    message_text TEXT,
    message_text_tsv TSVECTOR, -- Full-text search

    -- Mídia
    raw_media JSONB,
    storage_path TEXT,
    extracted_data JSONB,

    -- Embedding para RAG
    embedding VECTOR(1536),

    -- Soft delete (audit trail)
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT conversations_from_user_check CHECK (from_user IN ('client', 'bot')),
    CONSTRAINT conversations_message_type_check CHECK (
        message_type IN ('text', 'audio', 'image', 'document', 'video')
    ),
    CONSTRAINT conversations_message_id_unique UNIQUE (message_id),
    CONSTRAINT conversations_chat_id_check CHECK (chat_id ~ '^[0-9]+(@.+)?$'),
    CONSTRAINT conversations_raw_media_size_check CHECK (
        raw_media IS NULL OR pg_column_size(raw_media) < 1048576
    ),
    CONSTRAINT conversations_extracted_data_size_check CHECK (
        extracted_data IS NULL OR pg_column_size(extracted_data) < 1048576
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_conversations_chat_timestamp
    ON knowledge.conversations (chat_id, timestamp DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_session
    ON knowledge.conversations (session_id)
    WHERE deleted_at IS NULL AND session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_from_user
    ON knowledge.conversations (from_user)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_message_type
    ON knowledge.conversations (message_type)
    WHERE deleted_at IS NULL;

-- Composite index for status + time queries
CREATE INDEX IF NOT EXISTS idx_conversations_user_time
    ON knowledge.conversations (from_user, timestamp DESC)
    WHERE deleted_at IS NULL;

-- Full-text search index (GIN)
CREATE INDEX IF NOT EXISTS idx_conversations_message_text_tsv
    ON knowledge.conversations USING GIN (message_text_tsv)
    WHERE deleted_at IS NULL AND message_text_tsv IS NOT NULL;

-- IVFFlat index for vector similarity search
-- Note: Build index AFTER inserting data (lists should be sqrt(n_rows))
-- Starting with 10 lists for small dataset, will be rebuilt dynamically
CREATE INDEX IF NOT EXISTS idx_conversations_embedding
    ON knowledge.conversations
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10)
    WHERE deleted_at IS NULL AND embedding IS NOT NULL;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_conversations_deleted
    ON knowledge.conversations (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE knowledge.conversations IS 'All WhatsApp messages with embeddings for semantic search (soft delete enabled)';
COMMENT ON COLUMN knowledge.conversations.embedding IS 'OpenAI text-embedding-3-small (1536 dims)';
COMMENT ON COLUMN knowledge.conversations.message_text_tsv IS 'Full-text search vector (auto-updated by trigger)';
COMMENT ON COLUMN knowledge.conversations.deleted_at IS 'Soft delete timestamp for audit trail';

-- ═══════════════════════════════════════════════════════════
--  TABLE: clients
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge.clients (
    id SERIAL PRIMARY KEY,

    -- Identificação
    chat_id VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    cpf VARCHAR(14),
    full_name VARCHAR(200),

    -- Timing
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_messages INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Classificação
    client_type VARCHAR(50) NOT NULL DEFAULT 'new',
    case_types TEXT[],
    current_stage VARCHAR(50) NOT NULL DEFAULT 'discovery',

    -- Integração LawApp
    lawapp_id UUID,

    -- Metadata flexível
    metadata JSONB,

    -- Resumo semântico (gerado por LLM)
    context_summary TEXT,

    -- Soft delete (audit trail)
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT clients_chat_id_unique UNIQUE (chat_id),
    CONSTRAINT clients_cpf_unique UNIQUE (cpf),
    CONSTRAINT clients_chat_id_check CHECK (chat_id ~ '^[0-9]+(@.+)?$'),
    CONSTRAINT clients_phone_check CHECK (
        phone IS NULL OR phone ~ '^\+?[1-9]\d{7,14}$'
    ),
    CONSTRAINT clients_cpf_check CHECK (
        cpf IS NULL OR cpf ~ '^\d{11}$'
    ),
    CONSTRAINT clients_client_type_check CHECK (
        client_type IN ('new', 'returning', 'vip')
    ),
    CONSTRAINT clients_current_stage_check CHECK (
        current_stage IN ('discovery', 'intake', 'documents', 'approved', 'rejected', 'stalled')
    ),
    CONSTRAINT clients_total_messages_check CHECK (total_messages >= 0),
    CONSTRAINT clients_metadata_size_check CHECK (
        metadata IS NULL OR pg_column_size(metadata) < 1048576
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_clients_cpf
    ON knowledge.clients (cpf)
    WHERE cpf IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_phone
    ON knowledge.clients (phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_stage
    ON knowledge.clients (current_stage)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_lawapp
    ON knowledge.clients (lawapp_id)
    WHERE lawapp_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_clients_last_seen
    ON knowledge.clients (last_seen DESC)
    WHERE deleted_at IS NULL;

-- Composite index for status + time queries
CREATE INDEX IF NOT EXISTS idx_clients_stage_time
    ON knowledge.clients (current_stage, last_seen DESC)
    WHERE deleted_at IS NULL;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_clients_deleted
    ON knowledge.clients (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE knowledge.clients IS 'Client aggregation with metadata and LLM-generated summaries (soft delete enabled)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: documents
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge.documents (
    id SERIAL PRIMARY KEY,

    -- Relacionamentos
    client_id INT NOT NULL REFERENCES knowledge.clients(id) ON DELETE CASCADE,
    conversation_id INT REFERENCES knowledge.conversations(id) ON DELETE SET NULL,

    -- Classificação
    document_type VARCHAR(50) NOT NULL,

    -- Arquivo
    file_name VARCHAR(255),
    mime_type VARCHAR(100),
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT,

    -- Extração
    extracted_text TEXT,
    structured_data JSONB,

    -- Validação
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by VARCHAR(100),
    verified_at TIMESTAMPTZ,

    -- Timing
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete (audit trail)
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT documents_file_size_check CHECK (
        file_size_bytes IS NULL OR file_size_bytes > 0
    ),
    CONSTRAINT documents_structured_data_size_check CHECK (
        structured_data IS NULL OR pg_column_size(structured_data) < 1048576
    ),
    CONSTRAINT documents_verified_at_check CHECK (
        (verified = FALSE AND verified_at IS NULL) OR
        (verified = TRUE AND verified_at IS NOT NULL)
    )
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_client
    ON knowledge.documents (client_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_type
    ON knowledge.documents (document_type)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_verified
    ON knowledge.documents (verified)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded
    ON knowledge.documents (uploaded_at DESC)
    WHERE deleted_at IS NULL;

-- Composite index for client + type queries
CREATE INDEX IF NOT EXISTS idx_documents_client_type
    ON knowledge.documents (client_id, document_type)
    WHERE deleted_at IS NULL;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_documents_deleted
    ON knowledge.documents (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE knowledge.documents IS 'Files uploaded by clients (RG, CPF, etc) with OCR extraction (soft delete enabled)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: faq
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge.faq (
    id SERIAL PRIMARY KEY,

    question TEXT NOT NULL,
    answer TEXT NOT NULL,

    category VARCHAR(50),
    keywords TEXT[],

    -- Analytics
    use_count INT NOT NULL DEFAULT 0,
    last_used TIMESTAMPTZ,

    -- Embedding
    embedding VECTOR(1536),

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Soft delete
    deleted_at TIMESTAMPTZ,
    deleted_by VARCHAR(100),

    -- Constraints
    CONSTRAINT faq_use_count_check CHECK (use_count >= 0),
    CONSTRAINT faq_question_length_check CHECK (length(question) >= 5),
    CONSTRAINT faq_answer_length_check CHECK (length(answer) >= 10)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_faq_category
    ON knowledge.faq (category)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_faq_use_count
    ON knowledge.faq (use_count DESC)
    WHERE deleted_at IS NULL;

-- IVFFlat index (10 clusters for small FAQ table ~50 rows)
CREATE INDEX IF NOT EXISTS idx_faq_embedding
    ON knowledge.faq
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 10)
    WHERE deleted_at IS NULL AND embedding IS NOT NULL;

-- Soft delete index
CREATE INDEX IF NOT EXISTS idx_faq_deleted
    ON knowledge.faq (deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE knowledge.faq IS 'Frequent questions with embeddings for zero-cost Layer 1 matching (soft delete enabled)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: session_context
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge.session_context (
    session_id VARCHAR(100) PRIMARY KEY,
    chat_id VARCHAR(100) NOT NULL,

    -- Fluxo atual
    current_flow VARCHAR(50),
    current_step VARCHAR(50),

    -- Dados coletados nesta sessão
    collected_data JSONB,

    -- Perguntas pendentes
    pending_questions TEXT[],

    -- Expiração (24h após última msg)
    expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT session_chat_id_check CHECK (chat_id ~ '^[0-9]+(@.+)?$'),
    CONSTRAINT session_collected_data_size_check CHECK (
        collected_data IS NULL OR pg_column_size(collected_data) < 1048576
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_session_chat
    ON knowledge.session_context (chat_id);

CREATE INDEX IF NOT EXISTS idx_session_expires
    ON knowledge.session_context (expires_at)
    WHERE expires_at IS NOT NULL;

COMMENT ON TABLE knowledge.session_context IS 'Active conversation state (intake flow, collected data)';

-- ═══════════════════════════════════════════════════════════
--  AUDIT TABLE: audit_log
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS knowledge.audit_log (
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
    ON knowledge.audit_log (table_name, record_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at
    ON knowledge.audit_log (changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_changed_by
    ON knowledge.audit_log (changed_by);

COMMENT ON TABLE knowledge.audit_log IS 'Audit trail for all changes to sensitive tables';

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: updated_at auto-update
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.update_updated_at_column()
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
        WHERE table_schema = 'knowledge'
        AND column_name = 'updated_at'
        AND table_name != 'audit_log'
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_update_updated_at ON knowledge.%I;
            CREATE TRIGGER trigger_update_updated_at
                BEFORE UPDATE ON knowledge.%I
                FOR EACH ROW
                EXECUTE FUNCTION knowledge.update_updated_at_column();
        ', t, t);
    END LOOP;
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: Full-text search auto-update
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.update_message_text_tsv()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.message_text IS NOT NULL THEN
        NEW.message_text_tsv = to_tsvector('portuguese', NEW.message_text);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_message_text_tsv ON knowledge.conversations;
CREATE TRIGGER trigger_update_message_text_tsv
    BEFORE INSERT OR UPDATE OF message_text ON knowledge.conversations
    FOR EACH ROW
    EXECUTE FUNCTION knowledge.update_message_text_tsv();

-- ═══════════════════════════════════════════════════════════
--  TRIGGERS: Audit trail for sensitive tables
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION knowledge.audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO knowledge.audit_log (table_name, record_id, operation, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO knowledge.audit_log (table_name, record_id, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO knowledge.audit_log (table_name, record_id, operation, old_data)
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
    FOR t IN SELECT unnest(ARRAY['clients', 'documents']) LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS trigger_audit ON knowledge.%I;
            CREATE TRIGGER trigger_audit
                AFTER INSERT OR UPDATE OR DELETE ON knowledge.%I
                FOR EACH ROW
                EXECUTE FUNCTION knowledge.audit_trigger_func();
        ', t, t);
    END LOOP;
END;
$$;

-- Record migration
SELECT public.record_migration('002_create_schema_knowledge', 'Create knowledge schema with security and audit', NULL, NULL);

COMMIT;
