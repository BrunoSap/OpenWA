-- database/migrations/002_create_schema_knowledge.sql
-- Schema for knowledge management (conversations, clients, documents, FAQ)

BEGIN;

-- Create schema
CREATE SCHEMA IF NOT EXISTS knowledge;

-- ═══════════════════════════════════════════════════════════
--  TABLE: conversations
-- ═══════════════════════════════════════════════════════════
CREATE TABLE knowledge.conversations (
    id SERIAL PRIMARY KEY,

    -- Identificação
    chat_id VARCHAR(100) NOT NULL,
    message_id VARCHAR(100) NOT NULL UNIQUE,
    session_id VARCHAR(100),

    -- Sender
    from_user VARCHAR(100),

    -- Timing
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Conteúdo
    message_type VARCHAR(20),
    message_text TEXT,

    -- Mídia
    raw_media JSONB,
    storage_path TEXT,
    extracted_data JSONB,

    -- Embedding para RAG
    embedding VECTOR(1536),

    -- Constraints
    CONSTRAINT conversations_from_user_check CHECK (from_user IN ('client', 'bot')),
    CONSTRAINT conversations_message_type_check CHECK (
        message_type IN ('text', 'audio', 'image', 'document', 'video')
    )
);

-- Indexes
CREATE INDEX idx_conversations_chat_timestamp ON knowledge.conversations (chat_id, timestamp);
CREATE INDEX idx_conversations_session ON knowledge.conversations (session_id);
CREATE INDEX idx_conversations_from_user ON knowledge.conversations (from_user);
CREATE INDEX idx_conversations_message_type ON knowledge.conversations (message_type);

-- IVFFlat index for vector similarity search
-- Note: Build index AFTER inserting data (lists = sqrt(n_rows))
-- For now, use 100 lists (optimal for ~10k rows)
CREATE INDEX idx_conversations_embedding
ON knowledge.conversations
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

COMMENT ON TABLE knowledge.conversations IS 'All WhatsApp messages with embeddings for semantic search';
COMMENT ON COLUMN knowledge.conversations.embedding IS 'OpenAI text-embedding-3-small (1536 dims)';
COMMENT ON INDEX knowledge.idx_conversations_embedding IS 'IVFFlat index for cosine similarity search (100 clusters)';

-- ═══════════════════════════════════════════════════════════
--  TABLE: clients
-- ═══════════════════════════════════════════════════════════
CREATE TABLE knowledge.clients (
    id SERIAL PRIMARY KEY,

    -- Identificação
    chat_id VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(20),
    cpf VARCHAR(14) UNIQUE,
    full_name VARCHAR(200),

    -- Timing
    first_seen TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP DEFAULT NOW(),
    total_messages INT DEFAULT 0,

    -- Classificação
    client_type VARCHAR(50) DEFAULT 'new',
    case_types TEXT[],
    current_stage VARCHAR(50) DEFAULT 'discovery',

    -- Integração LawApp
    lawapp_id UUID,

    -- Metadata flexível
    metadata JSONB,

    -- Resumo semântico (gerado por LLM)
    context_summary TEXT,

    -- Constraints
    CONSTRAINT clients_client_type_check CHECK (
        client_type IN ('new', 'returning', 'vip')
    ),
    CONSTRAINT clients_current_stage_check CHECK (
        current_stage IN ('discovery', 'intake', 'documents', 'approved', 'rejected', 'stalled')
    ),
    CONSTRAINT clients_total_messages_check CHECK (total_messages >= 0)
);

-- Indexes
CREATE INDEX idx_clients_cpf ON knowledge.clients (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX idx_clients_phone ON knowledge.clients (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_clients_stage ON knowledge.clients (current_stage);
CREATE INDEX idx_clients_lawapp ON knowledge.clients (lawapp_id) WHERE lawapp_id IS NOT NULL;
CREATE INDEX idx_clients_last_seen ON knowledge.clients (last_seen DESC);

COMMENT ON TABLE knowledge.clients IS 'Client aggregation with metadata and LLM-generated summaries';

-- ═══════════════════════════════════════════════════════════
--  TABLE: documents
-- ═══════════════════════════════════════════════════════════
CREATE TABLE knowledge.documents (
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

    -- Extração
    extracted_text TEXT,
    structured_data JSONB,

    -- Validação
    verified BOOLEAN DEFAULT FALSE,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_client ON knowledge.documents (client_id);
CREATE INDEX idx_documents_type ON knowledge.documents (document_type);
CREATE INDEX idx_documents_verified ON knowledge.documents (verified);
CREATE INDEX idx_documents_uploaded ON knowledge.documents (uploaded_at DESC);

COMMENT ON TABLE knowledge.documents IS 'Files uploaded by clients (RG, CPF, etc) with OCR extraction';

-- ═══════════════════════════════════════════════════════════
--  TABLE: faq
-- ═══════════════════════════════════════════════════════════
CREATE TABLE knowledge.faq (
    id SERIAL PRIMARY KEY,

    question TEXT NOT NULL,
    answer TEXT NOT NULL,

    category VARCHAR(50),
    keywords TEXT[],

    -- Analytics
    use_count INT DEFAULT 0,
    last_used TIMESTAMP,

    -- Embedding
    embedding VECTOR(1536),

    -- Constraints
    CONSTRAINT faq_use_count_check CHECK (use_count >= 0)
);

-- Indexes
CREATE INDEX idx_faq_category ON knowledge.faq (category);

-- IVFFlat index (10 clusters for small FAQ table ~50 rows)
CREATE INDEX idx_faq_embedding
ON knowledge.faq
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);

COMMENT ON TABLE knowledge.faq IS 'Frequent questions with embeddings for zero-cost Layer 1 matching';

-- ═══════════════════════════════════════════════════════════
--  TABLE: session_context
-- ═══════════════════════════════════════════════════════════
CREATE TABLE knowledge.session_context (
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
    expires_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_session_chat ON knowledge.session_context (chat_id);
CREATE INDEX idx_session_expires ON knowledge.session_context (expires_at);

COMMENT ON TABLE knowledge.session_context IS 'Active conversation state (intake flow, collected data)';

COMMIT;
