-- database/rollbacks/rollback_010.sql
-- Rollback: Restore original IVFFlat indexes

BEGIN;

-- Restore conversations IVFFlat index (original hardcoded 100 lists)
CREATE INDEX IF NOT EXISTS idx_conversations_embedding
ON knowledge.conversations
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Restore FAQ IVFFlat index (original hardcoded 10 lists)
CREATE INDEX IF NOT EXISTS idx_faq_embedding
ON knowledge.faq
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);

COMMIT;
