-- database/tests/test_helper_functions.sql
-- Tests for SQL helper functions

\echo '🧪 Testing helper functions...'

-- Test: find_similar_faq (empty result, no data yet)
DO $$
DECLARE
    result RECORD;
    test_embedding VECTOR(1536);
BEGIN
    test_embedding := (SELECT array_agg(random())::vector FROM generate_series(1, 1536));

    SELECT * INTO result FROM knowledge.find_similar_faq(test_embedding, 0.8, 3);

    IF result IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: find_similar_faq should return empty (no FAQ data yet)';
    END IF;

    RAISE NOTICE '✅ PASS: find_similar_faq returns empty correctly';
END $$;

-- Test: find_similar_conversations (empty result, no data yet)
DO $$
DECLARE
    result RECORD;
    test_embedding VECTOR(1536);
BEGIN
    test_embedding := (SELECT array_agg(random())::vector FROM generate_series(1, 1536));

    SELECT * INTO result FROM knowledge.find_similar_conversations(test_embedding, 'test@c.us', 0.75, 5);

    IF result IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL: find_similar_conversations should return empty';
    END IF;

    RAISE NOTICE '✅ PASS: find_similar_conversations returns empty correctly';
END $$;

-- Test: get_client_summary (null client)
DO $$
DECLARE
    result JSON;
BEGIN
    result := knowledge.get_client_summary('nonexistent@c.us');

    IF result->>'client' != 'null' THEN
        RAISE EXCEPTION 'FAIL: get_client_summary should return null client';
    END IF;

    RAISE NOTICE '✅ PASS: get_client_summary handles nonexistent client';
END $$;

-- Test: calculate_fees
DO $$
DECLARE
    result JSON;
    total NUMERIC;
BEGIN
    result := knowledge.calculate_fees(15000, 1500, 60);
    total := (result->>'total')::NUMERIC;

    IF total != 19452.60 THEN
        RAISE EXCEPTION 'FAIL: calculate_fees returned %, expected 19452.60', total;
    END IF;

    RAISE NOTICE '✅ PASS: calculate_fees correct (total: %)', total;
END $$;

\echo '✅ All helper function tests passed!'
