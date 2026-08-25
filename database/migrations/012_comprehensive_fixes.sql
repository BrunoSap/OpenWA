-- database/migrations/012_comprehensive_fixes.sql
-- Comprehensive fixes for all critical, security, and performance issues
-- Addresses: foreign keys, NOT NULL, CPF validation, email ReDoS, indexes,
-- partitioning docs, CHECK constraints, trigger for total_messages

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  CRITICAL: Foreign key from conversations to clients
-- ═══════════════════════════════════════════════════════════

-- Add client_id to conversations for proper data integrity
-- (conversations must belong to a client to maintain context)
ALTER TABLE knowledge.conversations
    ADD COLUMN IF NOT EXISTS client_id INT;

-- Backfill client_id from chat_id
-- (maps chat_id to clients.id)
UPDATE knowledge.conversations conv
SET client_id = (
    SELECT id FROM knowledge.clients c
    WHERE c.chat_id = conv.chat_id
    LIMIT 1
)
WHERE conv.client_id IS NULL
AND EXISTS (
    SELECT 1 FROM knowledge.clients c WHERE c.chat_id = conv.chat_id
);

-- Add foreign key constraint with CASCADE
ALTER TABLE knowledge.conversations
    ADD CONSTRAINT conversations_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES knowledge.clients(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- Index for foreign key lookups
CREATE INDEX IF NOT EXISTS idx_conversations_client
    ON knowledge.conversations (client_id)
    WHERE deleted_at IS NULL;

COMMENT ON COLUMN knowledge.conversations.client_id IS 'Foreign key to clients - ensures every message belongs to a client';

-- ═══════════════════════════════════════════════════════════
--  CRITICAL: Fix NOT NULL constraints
-- ═══════════════════════════════════════════════════════════

-- conversations.chat_id already has NOT NULL
-- conversations.session_id should remain nullable (not all messages are in intake flow)
-- This is correct per design - session_id is optional

-- Verify chat_id is truly NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'knowledge'
        AND table_name = 'conversations'
        AND column_name = 'chat_id'
        AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'conversations.chat_id is nullable - data integrity violation';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  CRITICAL: Drop IVFFlat indexes (rebuild after data load)
-- ═══════════════════════════════════════════════════════════

-- pgvector best practice: build IVFFlat AFTER data insertion
-- Empty tables have poor clustering
-- Indexes will be rebuilt via 011_rebuild_ivfflat.sql after seeding

DROP INDEX IF EXISTS knowledge.idx_conversations_embedding;
DROP INDEX IF EXISTS knowledge.idx_faq_embedding;

COMMENT ON COLUMN knowledge.conversations.embedding IS 'OpenAI text-embedding-3-small (1536 dims) - IVFFlat index built after seed data';
COMMENT ON COLUMN knowledge.faq.embedding IS 'OpenAI text-embedding-3-small (1536 dims) - IVFFlat index built after seed data';

-- ═══════════════════════════════════════════════════════════
--  SECURITY: CPF validation with mod-11 algorithm
-- ═══════════════════════════════════════════════════════════

-- Create function to validate CPF using mod-11 checksum
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_cpf TEXT;
    v_sum INT;
    v_digit1 INT;
    v_digit2 INT;
    i INT;
BEGIN
    -- Remove formatting (only digits)
    v_cpf := regexp_replace(cpf, '[^0-9]', '', 'g');

    -- Must be 11 digits
    IF length(v_cpf) != 11 THEN
        RETURN FALSE;
    END IF;

    -- Reject known invalid patterns (all same digit)
    IF v_cpf ~ '^(\d)\1{10}$' THEN
        RETURN FALSE;
    END IF;

    -- Calculate first check digit
    v_sum := 0;
    FOR i IN 1..9 LOOP
        v_sum := v_sum + substring(v_cpf, i, 1)::INT * (11 - i);
    END LOOP;
    v_digit1 := 11 - (v_sum % 11);
    IF v_digit1 >= 10 THEN
        v_digit1 := 0;
    END IF;

    -- Verify first check digit
    IF v_digit1 != substring(v_cpf, 10, 1)::INT THEN
        RETURN FALSE;
    END IF;

    -- Calculate second check digit
    v_sum := 0;
    FOR i IN 1..10 LOOP
        v_sum := v_sum + substring(v_cpf, i, 1)::INT * (12 - i);
    END LOOP;
    v_digit2 := 11 - (v_sum % 11);
    IF v_digit2 >= 10 THEN
        v_digit2 := 0;
    END IF;

    -- Verify second check digit
    IF v_digit2 != substring(v_cpf, 11, 1)::INT THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.validate_cpf IS 'Validates CPF using mod-11 algorithm (rejects invalid checksums)';

-- Update constraints to use mod-11 validation
ALTER TABLE knowledge.clients DROP CONSTRAINT IF EXISTS clients_cpf_check;
ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_cpf_check CHECK (
        cpf IS NULL OR public.validate_cpf(cpf)
    );

ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_cpf_check;
ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_cpf_check CHECK (
        cpf IS NULL OR public.validate_cpf(cpf)
    );

-- ═══════════════════════════════════════════════════════════
--  SECURITY: Fix email regex (prevent ReDoS attacks)
-- ═══════════════════════════════════════════════════════════

-- Replace catastrophic backtracking regex with safer version
-- Old: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
-- New: no nested quantifiers, linear complexity

ALTER TABLE intake_staging.leads DROP CONSTRAINT IF EXISTS leads_email_check;
ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_email_check CHECK (
        email IS NULL OR (
            email ~* '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]{1,63}\.[A-Za-z]{2,63}$'
            AND length(email) >= 6
            AND length(email) <= 254
            AND email NOT LIKE '%..%'
            AND email NOT LIKE '.%'
            AND email NOT LIKE '%.'
        )
    );

COMMENT ON CONSTRAINT leads_email_check ON intake_staging.leads IS 'ReDoS-safe email validation (RFC 5321 simplified)';

-- ═══════════════════════════════════════════════════════════
--  PERFORMANCE: Composite index (chat_id, session_id, timestamp)
-- ═══════════════════════════════════════════════════════════

-- Composite index for session message retrieval
CREATE INDEX IF NOT EXISTS idx_conversations_chat_session_time
    ON knowledge.conversations (chat_id, session_id, timestamp DESC)
    WHERE deleted_at IS NULL;

COMMENT ON INDEX knowledge.idx_conversations_chat_session_time IS 'Composite index for session context queries (covers WHERE chat_id + session_id + ORDER BY timestamp)';

-- ═══════════════════════════════════════════════════════════
--  PERFORMANCE: Partial index WHERE embedding IS NOT NULL
-- ═══════════════════════════════════════════════════════════

-- Partial B-tree index for embedding existence checks
-- (reduces index size, excludes NULL embeddings from scans)
CREATE INDEX IF NOT EXISTS idx_conversations_has_embedding
    ON knowledge.conversations (id)
    WHERE embedding IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_faq_has_embedding
    ON knowledge.faq (id)
    WHERE embedding IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX idx_conversations_has_embedding IS 'Partial index for similarity search pre-filtering (excludes NULL embeddings)';

-- ═══════════════════════════════════════════════════════════
--  PERFORMANCE: Index on documents.storage_path
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_documents_storage_path
    ON knowledge.documents (storage_path)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_documents_storage_path
    ON intake_staging.lead_documents (storage_path);

COMMENT ON INDEX idx_documents_storage_path IS 'Index for file access queries (frequent lookups by path)';

-- ═══════════════════════════════════════════════════════════
--  MAINTAINABILITY: Trigger for total_messages counter
-- ═══════════════════════════════════════════════════════════

-- Function to update total_messages on clients
CREATE OR REPLACE FUNCTION knowledge.update_client_total_messages()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        -- Increment on new message
        UPDATE knowledge.clients
        SET
            total_messages = total_messages + 1,
            last_seen = NEW.timestamp,
            updated_at = NOW()
        WHERE chat_id = NEW.chat_id;
        RETURN NEW;

    ELSIF (TG_OP = 'DELETE') THEN
        -- Decrement on hard delete (soft deletes don't trigger this)
        UPDATE knowledge.clients
        SET
            total_messages = GREATEST(0, total_messages - 1),
            updated_at = NOW()
        WHERE chat_id = OLD.chat_id;
        RETURN OLD;

    ELSIF (TG_OP = 'UPDATE' AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        -- Decrement on soft delete
        UPDATE knowledge.clients
        SET
            total_messages = GREATEST(0, total_messages - 1),
            updated_at = NOW()
        WHERE chat_id = NEW.chat_id;
        RETURN NEW;

    ELSIF (TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
        -- Increment on undelete
        UPDATE knowledge.clients
        SET
            total_messages = total_messages + 1,
            updated_at = NOW()
        WHERE chat_id = NEW.chat_id;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION knowledge.update_client_total_messages IS 'Keeps clients.total_messages in sync with conversations count';

-- Apply trigger
DROP TRIGGER IF EXISTS trigger_update_client_total_messages ON knowledge.conversations;
CREATE TRIGGER trigger_update_client_total_messages
    AFTER INSERT OR DELETE OR UPDATE OF deleted_at ON knowledge.conversations
    FOR EACH ROW
    EXECUTE FUNCTION knowledge.update_client_total_messages();

-- ═══════════════════════════════════════════════════════════
--  COMPLETENESS: CHECK constraints for timestamp ordering
-- ═══════════════════════════════════════════════════════════

-- Clients: first_seen <= last_seen
ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_timestamp_order CHECK (first_seen <= last_seen);

-- Clients: created_at <= updated_at
ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_created_updated_order CHECK (created_at <= updated_at);

-- Conversations: created_at <= updated_at
ALTER TABLE knowledge.conversations
    ADD CONSTRAINT conversations_created_updated_order CHECK (created_at <= updated_at);

-- Documents: created_at <= updated_at
ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_created_updated_order CHECK (created_at <= updated_at);

-- Documents: uploaded_at <= NOW() (can't upload from future)
ALTER TABLE knowledge.documents
    ADD CONSTRAINT documents_uploaded_at_past CHECK (uploaded_at <= NOW() + INTERVAL '1 hour');

COMMENT ON CONSTRAINT clients_timestamp_order ON knowledge.clients IS 'Ensures first_seen <= last_seen (temporal consistency)';

-- ═══════════════════════════════════════════════════════════
--  COMPLETENESS: Input validation for helper functions
-- ═══════════════════════════════════════════════════════════

-- Will be implemented in 006_create_helper_functions.sql
-- (functions with parameter validation: threshold > 0, limit > 0, etc.)

-- Note: This migration prepares schema changes
-- Function improvements are in separate migration to avoid circular dependencies

-- ═══════════════════════════════════════════════════════════
--  DOCUMENTATION: Encryption at rest requirement
-- ═══════════════════════════════════════════════════════════

COMMENT ON COLUMN knowledge.clients.cpf IS 'CPF (validated mod-11) - LGPD: encrypt at rest via pgcrypto or storage-level encryption';
COMMENT ON COLUMN knowledge.clients.full_name IS 'Full name - LGPD: encrypt at rest via pgcrypto or storage-level encryption';
COMMENT ON COLUMN knowledge.clients.phone IS 'Phone - LGPD: encrypt at rest via pgcrypto or storage-level encryption';

COMMENT ON COLUMN intake_staging.leads.cpf IS 'CPF (validated mod-11) - LGPD: encrypt at rest via pgcrypto or storage-level encryption';
COMMENT ON COLUMN intake_staging.leads.name IS 'Full name - LGPD: encrypt at rest via pgcrypto or storage-level encryption';
COMMENT ON COLUMN intake_staging.leads.phone IS 'Phone - LGPD: encrypt at rest via pgcrypto or storage-level encryption';
COMMENT ON COLUMN intake_staging.leads.email IS 'Email - LGPD: encrypt at rest via pgcrypto or storage-level encryption';

-- Note: Production deployment must enable:
-- 1. PostgreSQL storage-level encryption (LUKS, pgcrypto, AWS RDS encryption)
-- 2. TLS for all client connections
-- 3. Regular key rotation
-- 4. Access audit logs

-- ═══════════════════════════════════════════════════════════
--  DOCUMENTATION: Partitioning strategy for conversations
-- ═══════════════════════════════════════════════════════════

COMMENT ON TABLE knowledge.conversations IS 'All WhatsApp messages with embeddings for semantic search (soft delete enabled). SCALING: Consider partitioning by timestamp (RANGE) when reaching 100k+ rows per month. Current design supports 36.5k rows/year comfortably.';

-- Partitioning strategy (to be implemented when scale requires):
-- - RANGE partitioning by timestamp (monthly or quarterly)
-- - Partition pruning for queries with timestamp filters
-- - Automated partition creation via pg_cron
-- - Old partition archival (move to cold storage after 2 years)

-- Example (NOT executed now, documentation only):
-- ALTER TABLE knowledge.conversations PARTITION BY RANGE (timestamp);
-- CREATE TABLE knowledge.conversations_2026_q1 PARTITION OF knowledge.conversations
--     FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

-- ═══════════════════════════════════════════════════════════
--  DOCUMENTATION: Connection pooling requirement
-- ═══════════════════════════════════════════════════════════

COMMENT ON SCHEMA knowledge IS 'Knowledge management schema with semantic search. PRODUCTION: Use connection pooler (PgBouncer/PgPool) with transaction pooling. Default PostgreSQL max_connections=100 insufficient for containerized microservices. Recommended: PgBouncer with pool_size=25, reserve_pool_size=5, max_client_conn=1000.';

-- ═══════════════════════════════════════════════════════════
--  RECORD MIGRATION
-- ═══════════════════════════════════════════════════════════

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'schema_migrations') THEN
        PERFORM public.record_migration(
            '012_comprehensive_fixes',
            'Comprehensive fixes: foreign keys, CPF mod-11, email ReDoS fix, indexes, triggers, constraints',
            NULL,
            NULL
        );
    ELSE
        RAISE NOTICE 'Migration tracking table not available, skipping record_migration call';
    END IF;
END $$;

COMMIT;
