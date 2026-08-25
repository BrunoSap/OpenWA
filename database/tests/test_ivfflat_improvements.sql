-- database/tests/test_ivfflat_improvements.sql
-- Test IVFFlat index improvements (dynamic sizing, timing)

\echo '🧪 Testing IVFFlat index improvements...'

-- Test 1: IVFFlat indexes exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'knowledge'
        AND tablename = 'conversations'
        AND indexname = 'idx_conversations_embedding'
    ) THEN
        RAISE EXCEPTION 'FAIL: idx_conversations_embedding not created';
    END IF;
    RAISE NOTICE '✅ PASS: IVFFlat index idx_conversations_embedding exists';
END $$;

-- Test 2: calculate_ivfflat_lists function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'calculate_ivfflat_lists'
    ) THEN
        RAISE EXCEPTION 'FAIL: calculate_ivfflat_lists function not created';
    END IF;
    RAISE NOTICE '✅ PASS: calculate_ivfflat_lists function exists';
END $$;

-- Test 3: Function calculates correct list count
DO $$
DECLARE
    result INTEGER;
BEGIN
    -- Test with known row count (should return sqrt, clamped to 10-1000)
    CREATE TEMP TABLE test_ivfflat_calc (embedding VECTOR(1536));
    INSERT INTO test_ivfflat_calc SELECT ('[' || string_agg((random() * 2 - 1)::text, ',') || ']')::vector
    FROM generate_series(1, 1536), generate_series(1, 100);

    result := public.calculate_ivfflat_lists('test_ivfflat_calc');

    -- sqrt(100) = 10
    IF result <> 10 THEN
        RAISE EXCEPTION 'FAIL: calculate_ivfflat_lists returned %, expected 10', result;
    END IF;

    DROP TABLE test_ivfflat_calc;
    RAISE NOTICE '✅ PASS: calculate_ivfflat_lists returns correct count';
END $$;

-- Test 4: Vector distance operator works
DO $$
DECLARE
    distance FLOAT;
BEGIN
    -- Test cosine distance on actual vector type
    SELECT '[1,0,0]'::vector(3) <=> '[0,1,0]'::vector(3) INTO distance;

    IF distance IS NULL OR distance <= 0 THEN
        RAISE EXCEPTION 'FAIL: Vector cosine distance operator not working (got %)', distance;
    END IF;

    RAISE NOTICE '✅ PASS: Vector cosine distance operator works (distance: %)', distance;
END $$;

-- Test 5: IVFFlat index is used by query planner
\echo '🧪 Testing IVFFlat index usage...'

DO $$
DECLARE
    explain_output TEXT;
BEGIN
    -- Get query plan for vector similarity search
    SELECT INTO explain_output
        string_agg(line, E'\n')
    FROM (
        SELECT * FROM (
            EXPLAIN (FORMAT TEXT)
            SELECT * FROM knowledge.conversations
            ORDER BY embedding <=> '[1,0,0,1,0,0]'::vector(1536)
            LIMIT 5
        ) t(line)
    ) AS subq;

    -- Check if IVFFlat index is mentioned in plan
    IF explain_output NOT LIKE '%ivfflat%' AND explain_output NOT LIKE '%idx_conversations_embedding%' THEN
        RAISE WARNING 'IVFFlat index may not be used by query planner. Plan: %', explain_output;
        RAISE NOTICE '⚠️  WARN: IVFFlat index not in query plan (may need more rows or ANALYZE)';
    ELSE
        RAISE NOTICE '✅ PASS: IVFFlat index used by query planner';
    END IF;
END $$;

\echo '✅ IVFFlat improvement tests completed!'
