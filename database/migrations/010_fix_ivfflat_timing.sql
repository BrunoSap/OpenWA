-- database/migrations/010_fix_ivfflat_timing.sql
-- Drop premature IVFFlat indexes (will recreate after seeding data)
-- This fixes the critical issue of creating IVFFlat indexes on empty tables

BEGIN;

\echo '⚠️  Dropping premature IVFFlat indexes (will recreate after data insertion)...'

-- Drop existing IVFFlat indexes
DROP INDEX IF EXISTS knowledge.idx_conversations_embedding;
DROP INDEX IF EXISTS knowledge.idx_faq_embedding;

COMMENT ON TABLE knowledge.conversations IS 'All WhatsApp messages with embeddings for semantic search. IVFFlat index will be created after data insertion.';
COMMENT ON TABLE knowledge.faq IS 'Frequent questions with embeddings for zero-cost Layer 1 matching. IVFFlat index will be created after data insertion.';

\echo '✅ IVFFlat indexes dropped. Run 011_rebuild_ivfflat.sql AFTER inserting data.'

COMMIT;
