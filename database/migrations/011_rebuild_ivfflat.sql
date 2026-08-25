-- database/migrations/011_rebuild_ivfflat.sql
-- Rebuild IVFFlat indexes AFTER data insertion with correct list count
-- Run this AFTER 007_seed_data.sql

BEGIN;

\echo '🔧 Rebuilding IVFFlat indexes with dynamic list count...'

-- Function to calculate optimal list count
CREATE OR REPLACE FUNCTION public.calculate_ivfflat_lists(
    p_table_name TEXT,
    p_column_name TEXT DEFAULT 'embedding'
) RETURNS INTEGER AS $$
DECLARE
    row_count INTEGER;
    optimal_lists INTEGER;
BEGIN
    -- Count non-null embeddings
    EXECUTE format('SELECT COUNT(*) FROM %I WHERE %I IS NOT NULL', p_table_name, p_column_name)
    INTO row_count;

    -- Calculate optimal list count: sqrt(rows)
    -- Minimum 10 lists, maximum 1000
    optimal_lists := GREATEST(10, LEAST(1000, FLOOR(SQRT(row_count))));

    RAISE NOTICE 'Table % has % rows → % lists', p_table_name, row_count, optimal_lists;

    RETURN optimal_lists;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.calculate_ivfflat_lists IS 'Calculate optimal IVFFlat list count (sqrt(rows), clamped 10-1000)';

-- Rebuild conversations IVFFlat index
DO $$
DECLARE
    lists_count INTEGER;
BEGIN
    lists_count := public.calculate_ivfflat_lists('knowledge.conversations');

    EXECUTE format(
        'CREATE INDEX idx_conversations_embedding
        ON knowledge.conversations
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = %s)',
        lists_count
    );

    RAISE NOTICE '✅ Created idx_conversations_embedding with % lists', lists_count;
END $$;

-- Rebuild FAQ IVFFlat index
DO $$
DECLARE
    lists_count INTEGER;
BEGIN
    lists_count := public.calculate_ivfflat_lists('knowledge.faq');

    EXECUTE format(
        'CREATE INDEX idx_faq_embedding
        ON knowledge.faq
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = %s)',
        lists_count
    );

    RAISE NOTICE '✅ Created idx_faq_embedding with % lists', lists_count;
END $$;

COMMENT ON INDEX knowledge.idx_conversations_embedding IS 'IVFFlat index for cosine similarity search (dynamically sized)';
COMMENT ON INDEX knowledge.idx_faq_embedding IS 'IVFFlat index for FAQ matching (dynamically sized)';

\echo '✅ IVFFlat indexes rebuilt with optimal list count'

COMMIT;
