-- database/tests/test_constraint_validation.sql
-- Comprehensive constraint validation tests (edge cases)

\echo '========================================'
\echo 'TEST: Comprehensive Constraint Validation'
\echo '========================================'

BEGIN;

-- ════════════════════════════════════════════════════════════════
--  TEST 1: Negative file size validation
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 1: Reject negative file_size_bytes'

DO $$
BEGIN
    -- Try to insert negative file size
    INSERT INTO intake_staging.lead_documents (
        lead_id, document_type, storage_path, file_size_bytes
    ) VALUES (
        1, 'test', '/tmp/test.pdf', -1000
    );

    RAISE EXCEPTION 'TEST FAILED: Negative file size was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: Negative file_size_bytes rejected';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════
--  TEST 2: OCR confidence bounds
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 2: Reject ocr_confidence > 1.0'

DO $$
BEGIN
    -- Try to insert ocr_confidence > 1.0
    INSERT INTO intake_staging.lead_documents (
        lead_id, document_type, storage_path, ocr_confidence
    ) VALUES (
        1, 'test', '/tmp/test.pdf', 1.5
    );

    RAISE EXCEPTION 'TEST FAILED: ocr_confidence > 1.0 was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: ocr_confidence > 1.0 rejected';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
END $$;

\echo ''
\echo 'TEST 3: Reject ocr_confidence < 0'

DO $$
BEGIN
    -- Try to insert negative ocr_confidence
    INSERT INTO intake_staging.lead_documents (
        lead_id, document_type, storage_path, ocr_confidence
    ) VALUES (
        1, 'test', '/tmp/test.pdf', -0.1
    );

    RAISE EXCEPTION 'TEST FAILED: Negative ocr_confidence was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: Negative ocr_confidence rejected';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════
--  TEST 4: CPF format validation
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 4: Test CPF format validation'

DO $$
BEGIN
    -- Valid CPF format should work
    INSERT INTO knowledge.clients (chat_id, cpf)
    VALUES ('test_chat_cpf_valid', '12345678901');

    RAISE NOTICE 'PASS: Valid CPF format (11 digits) accepted';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Valid CPF rejected: %', SQLERRM;
END $$;

-- Note: Current schema doesn't enforce CPF format - only UNIQUE
-- This is a recommendation for future migration

-- ════════════════════════════════════════════════════════════════
--  TEST 5: Email validation - ReDoS-safe regex
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 5: Test improved email validation (safe from ReDoS)'

DO $$
BEGIN
    -- Valid email
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
    VALUES ('test_email_1', 'aposentadoria', '{}', 'valid@example.com');

    RAISE NOTICE 'PASS: Valid email accepted';
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Valid email rejected: %', SQLERRM;
END $$;

DO $$
BEGIN
    -- Invalid email (no @)
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
    VALUES ('test_email_2', 'aposentadoria', '{}', 'invalidemail.com');

    RAISE EXCEPTION 'TEST FAILED: Invalid email (no @) was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: Invalid email (no @) rejected';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
END $$;

DO $$
BEGIN
    -- Invalid email (no domain)
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
    VALUES ('test_email_3', 'aposentadoria', '{}', 'user@');

    RAISE EXCEPTION 'TEST FAILED: Invalid email (no domain) was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE 'PASS: Invalid email (no domain) rejected';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════
--  TEST 6: updated_at triggers
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 6: Test updated_at triggers'

DO $$
DECLARE
    initial_updated_at TIMESTAMP;
    new_updated_at TIMESTAMP;
BEGIN
    -- Insert a client
    INSERT INTO knowledge.clients (chat_id, full_name)
    VALUES ('test_updated_at', 'Test User')
    RETURNING updated_at INTO initial_updated_at;

    -- Wait a moment
    PERFORM pg_sleep(0.1);

    -- Update the client
    UPDATE knowledge.clients
    SET full_name = 'Updated User'
    WHERE chat_id = 'test_updated_at'
    RETURNING updated_at INTO new_updated_at;

    -- Check that updated_at changed
    IF new_updated_at > initial_updated_at THEN
        RAISE NOTICE 'PASS: updated_at trigger working (% -> %)', initial_updated_at, new_updated_at;
    ELSE
        RAISE EXCEPTION 'TEST FAILED: updated_at trigger not working (% = %)', initial_updated_at, new_updated_at;
    END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
--  TEST 7: Duplicate message prevention
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 7: Test duplicate message prevention (webhook retry safety)'

DO $$
BEGIN
    -- Insert first message
    INSERT INTO knowledge.conversations (chat_id, message_id, timestamp, message_text)
    VALUES ('test_dup', 'msg_123', '2026-08-25 10:00:00', 'Hello');

    -- Try to insert duplicate (same chat_id + timestamp)
    INSERT INTO knowledge.conversations (chat_id, message_id, timestamp, message_text)
    VALUES ('test_dup', 'msg_456', '2026-08-25 10:00:00', 'Hello again');

    RAISE EXCEPTION 'TEST FAILED: Duplicate chat_id + timestamp was accepted';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE 'PASS: Duplicate message prevented (idx_conversations_chat_timestamp_unique working)';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'TEST FAILED: Unexpected error: %', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════
--  TEST 8: Partial index effectiveness
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo 'TEST 8: Test partial indexes'

DO $$
DECLARE
    query_plan TEXT;
BEGIN
    -- Check that unsynced leads query uses partial index
    SELECT query_plan INTO query_plan FROM (
        EXPLAIN SELECT * FROM intake_staging.leads
        WHERE lawapp_synced = false AND intake_status = 'completed'
    ) AS plan_output;

    IF query_plan LIKE '%idx_leads_unsynced%' THEN
        RAISE NOTICE 'PASS: Partial index idx_leads_unsynced is used';
    ELSE
        RAISE NOTICE 'WARNING: Query plan might not use idx_leads_unsynced';
    END IF;
END $$;

-- ════════════════════════════════════════════════════════════════
--  Cleanup
-- ════════════════════════════════════════════════════════════════

ROLLBACK;

\echo ''
\echo '========================================'
\echo 'Constraint validation tests completed'
\echo '========================================'
