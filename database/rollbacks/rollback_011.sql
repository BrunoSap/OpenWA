-- database/rollbacks/rollback_011.sql
-- Rollback IVFFlat index rebuild

BEGIN;

DROP INDEX IF EXISTS knowledge.idx_conversations_embedding;
DROP INDEX IF EXISTS knowledge.idx_faq_embedding;
DROP FUNCTION IF EXISTS public.calculate_ivfflat_lists(TEXT, TEXT);

COMMIT;
