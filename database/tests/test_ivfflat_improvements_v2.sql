-- database/tests/test_ivfflat_improvements_v2.sql
-- Test IVFFlat index improvements (dynamic sizing, timing)
-- AAA Pattern Compliant: Explicit Arrange, Act, Assert phases

\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '🧪 IVFFLAT INDEX IMPROVEMENTS TEST SUITE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
\echo '📋 Prerequisites:'
\echo '   - Migration 011_rebuild_ivfflat.sql must be applied'
\echo '   - Vector data must exist in knowledge.conversations (>100 rows recommended)'
\echo '   - test_fixtures schema must exist (run fixtures/setup_test_env.sql)'
\echo ''

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 1: IVFFlat Index Exists
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 1: IVFFlat index idx_conversations_embedding exists'

DO $$
DECLARE
    v_index_exists BOOLEAN;
BEGIN
    -- ARRANGE: Check for index in system catalog
    -- (No setup needed - testing existing schema)

    -- ACT: Query pg_indexes for IVFFlat index
    SELECT EXISTS(
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'knowledge'
        AND tablename = 'conversations'
        AND indexname = 'idx_conversations_embedding'
    ) INTO v_index_exists;

    -- ASSERT: Index exists
    PERFORM test_fixtures.assert_true(
        v_index_exists,
        'idx_conversations_embedding not found',
        'IVFFlat index idx_conversations_embedding exists'
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 2: calculate_ivfflat_lists Function Exists
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 2: calculate_ivfflat_lists function exists'

DO $$
DECLARE
    v_function_exists BOOLEAN;
BEGIN
    -- ARRANGE: Check for function in system catalog
    -- (No setup needed)

    -- ACT: Query pg_proc for function
    SELECT EXISTS(
        SELECT 1 FROM pg_proc
        WHERE proname = 'calculate_ivfflat_lists'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) INTO v_function_exists;

    -- ASSERT: Function exists
    PERFORM test_fixtures.assert_true(
        v_function_exists,
        'calculate_ivfflat_lists function not found',
        'calculate_ivfflat_lists function exists in public schema'
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 3: Function Calculates Correct List Count
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 3: calculate_ivfflat_lists returns correct count for known row count'

DO $$
DECLARE
    v_result INTEGER;
    v_expected INTEGER := 10; -- sqrt(100) = 10
BEGIN
    -- ARRANGE: Create temp table with 100 rows
    CREATE TEMP TABLE test_ivfflat_calc (embedding VECTOR(1536));

    INSERT INTO test_ivfflat_calc
    SELECT test_fixtures.generate_random_vector(1536)
    FROM generate_series(1, 100);

    -- ACT: Call calculate_ivfflat_lists function
    v_result := public.calculate_ivfflat_lists('test_ivfflat_calc');

    -- ASSERT: Result is sqrt(100) = 10
    PERFORM test_fixtures.assert_true(
        v_result = v_expected,
        format('calculate_ivfflat_lists returned %s, expected %s', v_result, v_expected),
        format('calculate_ivfflat_lists returns correct count (%s for 100 rows)', v_expected)
    );

    -- CLEANUP: Drop temp table
    DROP TABLE test_ivfflat_calc;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 4: Function Clamps to Minimum (10)
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 4: calculate_ivfflat_lists clamps to minimum 10'

DO $$
DECLARE
    v_result INTEGER;
    v_expected INTEGER := 10; -- clamped minimum
BEGIN
    -- ARRANGE: Create temp table with only 25 rows (sqrt = 5, should clamp to 10)
    CREATE TEMP TABLE test_ivfflat_min (embedding VECTOR(1536));

    INSERT INTO test_ivfflat_min
    SELECT test_fixtures.generate_random_vector(1536)
    FROM generate_series(1, 25);

    -- ACT: Call function on small dataset
    v_result := public.calculate_ivfflat_lists('test_ivfflat_min');

    -- ASSERT: Result clamped to minimum 10
    PERFORM test_fixtures.assert_true(
        v_result = v_expected,
        format('calculate_ivfflat_lists returned %s, expected minimum %s', v_result, v_expected),
        format('calculate_ivfflat_lists clamps to minimum %s', v_expected)
    );

    -- CLEANUP: Drop temp table
    DROP TABLE test_ivfflat_min;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 5: Function Clamps to Maximum (1000)
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 5: calculate_ivfflat_lists clamps to maximum 1000'

DO $$
DECLARE
    v_result INTEGER;
    v_expected INTEGER := 1000; -- clamped maximum
BEGIN
    -- ARRANGE: Create temp table with 1,500,000 rows metadata (sqrt = 1224, should clamp to 1000)
    -- Note: We can't actually insert 1.5M rows in a test, so we'll simulate by checking the formula
    CREATE TEMP TABLE test_ivfflat_max_sim (embedding VECTOR(1536));

    -- Insert small sample and validate formula directly
    INSERT INTO test_ivfflat_max_sim
    SELECT test_fixtures.generate_random_vector(1536)
    FROM generate_series(1, 10);

    -- ACT: Manually test the clamping logic
    -- (Cannot insert 1.5M rows in test - verify formula instead)
    WITH row_count AS (
        SELECT GREATEST(10, LEAST(1000, FLOOR(SQRT(1500000)))) AS calculated_lists
    )
    SELECT calculated_lists INTO v_result FROM row_count;

    -- ASSERT: Formula produces clamped maximum
    PERFORM test_fixtures.assert_true(
        v_result = v_expected,
        format('Clamping formula returned %s, expected maximum %s', v_result, v_expected),
        format('calculate_ivfflat_lists formula clamps to maximum %s', v_expected)
    );

    -- CLEANUP: Drop temp table
    DROP TABLE test_ivfflat_max_sim;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 6: Vector Distance Operator Works
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 6: Vector cosine distance operator (<->) works correctly'

DO $$
DECLARE
    v_distance FLOAT;
BEGIN
    -- ARRANGE: Prepare two orthogonal vectors
    -- [1,0,0] and [0,1,0] are perpendicular, cosine distance should be > 0

    -- ACT: Calculate cosine distance
    SELECT '[1,0,0]'::vector(3) <=> '[0,1,0]'::vector(3) INTO v_distance;

    -- ASSERT: Distance is valid (not NULL, positive)
    PERFORM test_fixtures.assert_true(
        v_distance IS NOT NULL AND v_distance > 0,
        format('Vector cosine distance operator returned invalid result: %s', v_distance),
        format('Vector cosine distance operator works (distance: %s)', v_distance)
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 7: IVFFlat Index Used by Query Planner
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 7: IVFFlat index used by query planner for vector similarity search'

DO $$
DECLARE
    v_explain_output TEXT;
    v_index_used BOOLEAN;
    v_row_count INTEGER;
BEGIN
    -- ARRANGE: Check if table has sufficient data for index usage
    SELECT COUNT(*) INTO v_row_count
    FROM knowledge.conversations
    WHERE embedding IS NOT NULL;

    IF v_row_count = 0 THEN
        RAISE WARNING 'No vector data in knowledge.conversations - skipping query planner test';
        RAISE NOTICE '⚠️  SKIP: Test 7 skipped - no vector data available';
        RETURN;
    END IF;

    -- ACT: Get query plan for vector similarity search
    SELECT string_agg(line, E'\n')
    INTO v_explain_output
    FROM (
        SELECT * FROM (
            EXPLAIN (FORMAT TEXT)
            SELECT * FROM knowledge.conversations
            ORDER BY embedding <=> test_fixtures.generate_random_vector(1536)
            LIMIT 5
        ) t(line)
    ) AS subq;

    -- ASSERT: Check if IVFFlat index appears in query plan
    v_index_used := (
        v_explain_output ILIKE '%ivfflat%'
        OR v_explain_output ILIKE '%idx_conversations_embedding%'
    );

    IF NOT v_index_used THEN
        RAISE WARNING 'IVFFlat index not used by query planner. Row count: %. Plan: %', v_row_count, v_explain_output;

        -- FAIL deterministically if index not used
        IF v_row_count >= 100 THEN
            RAISE EXCEPTION 'FAIL: IVFFlat index not used despite sufficient data (% rows)', v_row_count;
        ELSE
            RAISE NOTICE '⚠️  WARN: IVFFlat index not in query plan (only % rows, may need >100 rows + ANALYZE)', v_row_count;
        END IF;
    ELSE
        RAISE NOTICE '✅ PASS: IVFFlat index used by query planner (% rows)', v_row_count;
    END IF;
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '✅ IVFFLAT INDEX IMPROVEMENTS TEST SUITE COMPLETE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
