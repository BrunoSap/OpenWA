-- database/tests/test_comprehensive_fixes_v2.sql
-- AAA-structured comprehensive tests with proper isolation and reporting

\echo '════════════════════════════════════════════════════════════'
\echo '🧪 COMPREHENSIVE FIXES TEST SUITE V2 (AAA-structured)'
\echo '════════════════════════════════════════════════════════════'

-- ════════════════════════════════════════════════════════════
-- TEST FRAMEWORK: Proper AAA structure with reporting
-- ════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS test_framework;

-- Test results table
CREATE TEMP TABLE test_results (
    test_suite VARCHAR(100),
    test_name VARCHAR(200),
    status VARCHAR(10),  -- PASS, FAIL
    error_message TEXT,
    executed_at TIMESTAMP DEFAULT NOW()
);

-- Test runner function
CREATE OR REPLACE FUNCTION test_framework.run_test(
    p_suite VARCHAR(100),
    p_name VARCHAR(200),
    p_test_sql TEXT
) RETURNS VOID AS $$
BEGIN
    BEGIN
        -- Execute test
        EXECUTE p_test_sql;

        -- Record success
        INSERT INTO test_results (test_suite, test_name, status)
        VALUES (p_suite, p_name, 'PASS');

        RAISE NOTICE '✅ PASS: % - %', p_suite, p_name;
    EXCEPTION WHEN OTHERS THEN
        -- Record failure
        INSERT INTO test_results (test_suite, test_name, status, error_message)
        VALUES (p_suite, p_name, 'FAIL', SQLERRM);

        RAISE NOTICE '❌ FAIL: % - %: %', p_suite, p_name, SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════
-- SUITE 1: Foreign Key Integrity
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '🧪 Suite 1: Foreign Key Integrity'

-- Test 1.1: conversations.client_id foreign key exists
SELECT test_framework.run_test(
    'Foreign Key',
    'conversations.client_id FK exists',
    $$
        -- ARRANGE: none needed (checking schema)

        -- ACT & ASSERT: Check constraint exists
        DO $test$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM information_schema.table_constraints
                WHERE constraint_schema = 'knowledge'
                AND table_name = 'conversations'
                AND constraint_name = 'conversations_client_id_fkey'
                AND constraint_type = 'FOREIGN KEY'
            ) THEN
                RAISE EXCEPTION 'conversations.client_id FK not found';
            END IF;
        END $test$;
    $$
);

-- Test 1.2: Orphaned conversations are rejected
SELECT test_framework.run_test(
    'Foreign Key',
    'Orphaned conversations rejected',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_orphan_' || extract(epoch from now())::TEXT;
        BEGIN
            -- ARRANGE: Ensure no client exists with this chat_id
            DELETE FROM knowledge.clients WHERE chat_id = v_test_chat_id;

            -- ACT: Try to insert conversation without client
            BEGIN
                INSERT INTO knowledge.conversations (chat_id, message_id, from_user, message_text)
                VALUES (v_test_chat_id, 'msg_orphan', 'client', 'Test');

                -- ASSERT: Should not reach here
                RAISE EXCEPTION 'Orphaned conversation was accepted';
            EXCEPTION WHEN foreign_key_violation THEN
                -- ASSERT: Expected behavior (foreign key violation)
                NULL;
            END;

            -- TEARDOWN: No data created
        END $test$;
    $$
);

-- Test 1.3: CASCADE delete works
SELECT test_framework.run_test(
    'Foreign Key',
    'CASCADE delete removes conversations',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_cascade_' || extract(epoch from now())::TEXT;
            v_client_id INT;
            v_remaining INT;
        BEGIN
            -- ARRANGE: Create client and conversation
            INSERT INTO knowledge.clients (chat_id, full_name)
            VALUES (v_test_chat_id, 'Cascade Test')
            RETURNING id INTO v_client_id;

            INSERT INTO knowledge.conversations (chat_id, client_id, message_id, from_user, message_text)
            VALUES (v_test_chat_id, v_client_id, 'msg_cascade', 'client', 'Test');

            -- ACT: Delete client
            DELETE FROM knowledge.clients WHERE id = v_client_id;

            -- ASSERT: Conversation was cascaded
            SELECT COUNT(*) INTO v_remaining
            FROM knowledge.conversations WHERE chat_id = v_test_chat_id;

            IF v_remaining > 0 THEN
                RAISE EXCEPTION 'CASCADE delete failed: % conversations remain', v_remaining;
            END IF;

            -- TEARDOWN: Already deleted by CASCADE
        END $test$;
    $$
);

-- ════════════════════════════════════════════════════════════
-- SUITE 2: CPF Validation (mod-11)
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '🧪 Suite 2: CPF Validation (mod-11)'

-- Test 2.1: Valid CPF accepted
SELECT test_framework.run_test(
    'CPF Validation',
    'Valid CPF 11144477735 accepted',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_cpf_valid_' || extract(epoch from now())::TEXT;
            v_client_id INT;
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Insert valid CPF
            INSERT INTO knowledge.clients (chat_id, cpf, full_name)
            VALUES (v_test_chat_id, '11144477735', 'Valid CPF Test')
            RETURNING id INTO v_client_id;

            -- ASSERT: Insert succeeded (would throw if validation failed)
            IF v_client_id IS NULL THEN
                RAISE EXCEPTION 'Insert returned NULL id';
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM knowledge.clients WHERE id = v_client_id;
        END $test$;
    $$
);

-- Test 2.2: Invalid CPF checksum rejected
SELECT test_framework.run_test(
    'CPF Validation',
    'Invalid CPF checksum rejected',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_cpf_invalid_' || extract(epoch from now())::TEXT;
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Try to insert invalid CPF
            BEGIN
                INSERT INTO knowledge.clients (chat_id, cpf, full_name)
                VALUES (v_test_chat_id, '11144477736', 'Invalid CPF');

                -- ASSERT: Should not reach here
                RAISE EXCEPTION 'Invalid CPF was accepted';
            EXCEPTION WHEN check_violation THEN
                -- ASSERT: Expected behavior
                NULL;
            END;

            -- TEARDOWN: No data created
        END $test$;
    $$
);

-- Test 2.3: All-same-digit CPF rejected
SELECT test_framework.run_test(
    'CPF Validation',
    'All-same-digit CPF rejected',
    $$
        DO $test$
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Try to insert same-digit CPF
            BEGIN
                INSERT INTO knowledge.clients (chat_id, cpf, full_name)
                VALUES ('test_cpf_same_' || extract(epoch from now())::TEXT, '11111111111', 'Same Digit');

                -- ASSERT: Should not reach here
                RAISE EXCEPTION 'Same-digit CPF was accepted';
            EXCEPTION WHEN check_violation THEN
                -- ASSERT: Expected behavior
                NULL;
            END;

            -- TEARDOWN: No data created
        END $test$;
    $$
);

-- Test 2.4: NULL CPF allowed
SELECT test_framework.run_test(
    'CPF Validation',
    'NULL CPF allowed',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_cpf_null_' || extract(epoch from now())::TEXT;
            v_client_id INT;
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Insert NULL CPF
            INSERT INTO knowledge.clients (chat_id, cpf, full_name)
            VALUES (v_test_chat_id, NULL, 'No CPF')
            RETURNING id INTO v_client_id;

            -- ASSERT: Insert succeeded
            IF v_client_id IS NULL THEN
                RAISE EXCEPTION 'Insert with NULL CPF failed';
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM knowledge.clients WHERE id = v_client_id;
        END $test$;
    $$
);

-- ════════════════════════════════════════════════════════════
-- SUITE 3: Email ReDoS Protection
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '🧪 Suite 3: Email ReDoS Protection'

-- Test 3.1: Valid email accepted
SELECT test_framework.run_test(
    'Email Validation',
    'Valid email accepted',
    $$
        DO $test$
        DECLARE
            v_lead_id INT;
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Insert valid email
            INSERT INTO intake_staging.leads (name, phone, email, status)
            VALUES ('Valid Email', '555-test-' || extract(epoch from now())::TEXT, 'user@example.com', 'new')
            RETURNING id INTO v_lead_id;

            -- ASSERT: Insert succeeded
            IF v_lead_id IS NULL THEN
                RAISE EXCEPTION 'Valid email was rejected';
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM intake_staging.leads WHERE id = v_lead_id;
        END $test$;
    $$
);

-- Test 3.2: Email with double dots rejected
SELECT test_framework.run_test(
    'Email Validation',
    'Double-dot email rejected',
    $$
        DO $test$
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Try to insert double-dot email
            BEGIN
                INSERT INTO intake_staging.leads (name, phone, email, status)
                VALUES ('Double Dot', '555-test-' || extract(epoch from now())::TEXT, 'user..name@example.com', 'new');

                -- ASSERT: Should not reach here
                RAISE EXCEPTION 'Double-dot email was accepted';
            EXCEPTION WHEN check_violation THEN
                -- ASSERT: Expected behavior
                NULL;
            END;

            -- TEARDOWN: No data created
        END $test$;
    $$
);

-- Test 3.3: Leading dot email rejected
SELECT test_framework.run_test(
    'Email Validation',
    'Leading-dot email rejected',
    $$
        DO $test$
        BEGIN
            -- ARRANGE: None needed

            -- ACT: Try to insert leading-dot email
            BEGIN
                INSERT INTO intake_staging.leads (name, phone, email, status)
                VALUES ('Leading Dot', '555-test-' || extract(epoch from now())::TEXT, '.user@example.com', 'new');

                -- ASSERT: Should not reach here
                RAISE EXCEPTION 'Leading-dot email was accepted';
            EXCEPTION WHEN check_violation THEN
                -- ASSERT: Expected behavior
                NULL;
            END;

            -- TEARDOWN: No data created
        END $test$;
    $$
);

-- ════════════════════════════════════════════════════════════
-- SUITE 4: Index Existence
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '🧪 Suite 4: Index Existence'

-- Test 4.1: Composite index exists
SELECT test_framework.run_test(
    'Index Verification',
    'idx_conversations_chat_session_time exists',
    $$
        DO $test$
        BEGIN
            -- ARRANGE: None needed

            -- ACT & ASSERT: Check index exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'knowledge'
                AND indexname = 'idx_conversations_chat_session_time'
            ) THEN
                RAISE EXCEPTION 'Composite index not found';
            END IF;
        END $test$;
    $$
);

-- Test 4.2: Partial index exists
SELECT test_framework.run_test(
    'Index Verification',
    'idx_conversations_has_embedding exists',
    $$
        DO $test$
        BEGIN
            -- ARRANGE: None needed

            -- ACT & ASSERT: Check partial index exists
            IF NOT EXISTS (
                SELECT 1 FROM pg_indexes
                WHERE schemaname = 'knowledge'
                AND indexname = 'idx_conversations_has_embedding'
            ) THEN
                RAISE EXCEPTION 'Partial index not found';
            END IF;
        END $test$;
    $$
);

-- ════════════════════════════════════════════════════════════
-- SUITE 5: total_messages Trigger
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '🧪 Suite 5: total_messages Trigger'

-- Test 5.1: total_messages increments on INSERT
SELECT test_framework.run_test(
    'total_messages Trigger',
    'Counter increments on INSERT',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_total_msg_' || extract(epoch from now())::TEXT;
            v_client_id INT;
            v_msg_count INT;
        BEGIN
            -- ARRANGE: Create client with 0 messages
            INSERT INTO knowledge.clients (chat_id, full_name, total_messages)
            VALUES (v_test_chat_id, 'Total Messages Test', 0)
            RETURNING id INTO v_client_id;

            -- ACT: Insert 3 messages
            INSERT INTO knowledge.conversations (chat_id, client_id, message_id, from_user, message_text)
            VALUES
                (v_test_chat_id, v_client_id, 'msg_1_' || v_client_id, 'client', 'Message 1'),
                (v_test_chat_id, v_client_id, 'msg_2_' || v_client_id, 'bot', 'Message 2'),
                (v_test_chat_id, v_client_id, 'msg_3_' || v_client_id, 'client', 'Message 3');

            -- ASSERT: total_messages = 3
            SELECT total_messages INTO v_msg_count
            FROM knowledge.clients WHERE id = v_client_id;

            IF v_msg_count != 3 THEN
                RAISE EXCEPTION 'Expected 3 messages, got %', v_msg_count;
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM knowledge.clients WHERE id = v_client_id;
        END $test$;
    $$
);

-- Test 5.2: total_messages decrements on soft delete
SELECT test_framework.run_test(
    'total_messages Trigger',
    'Counter decrements on soft delete',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_soft_del_' || extract(epoch from now())::TEXT;
            v_client_id INT;
            v_msg_id INT;
            v_msg_count INT;
        BEGIN
            -- ARRANGE: Create client with 2 messages
            INSERT INTO knowledge.clients (chat_id, full_name, total_messages)
            VALUES (v_test_chat_id, 'Soft Delete Test', 0)
            RETURNING id INTO v_client_id;

            INSERT INTO knowledge.conversations (chat_id, client_id, message_id, from_user, message_text)
            VALUES
                (v_test_chat_id, v_client_id, 'msg_1_' || v_client_id, 'client', 'Message 1'),
                (v_test_chat_id, v_client_id, 'msg_2_' || v_client_id, 'client', 'Message 2')
            RETURNING id INTO v_msg_id;

            -- ACT: Soft delete one message
            UPDATE knowledge.conversations
            SET deleted_at = NOW()
            WHERE message_id = 'msg_1_' || v_client_id;

            -- ASSERT: total_messages = 1
            SELECT total_messages INTO v_msg_count
            FROM knowledge.clients WHERE id = v_client_id;

            IF v_msg_count != 1 THEN
                RAISE EXCEPTION 'Expected 1 message after soft delete, got %', v_msg_count;
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM knowledge.clients WHERE id = v_client_id;
        END $test$;
    $$
);

-- Test 5.3: total_messages never goes negative
SELECT test_framework.run_test(
    'total_messages Trigger',
    'Counter never goes negative',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_negative_' || extract(epoch from now())::TEXT;
            v_client_id INT;
            v_msg_count INT;
        BEGIN
            -- ARRANGE: Create client with 1 message
            INSERT INTO knowledge.clients (chat_id, full_name, total_messages)
            VALUES (v_test_chat_id, 'Negative Test', 0)
            RETURNING id INTO v_client_id;

            INSERT INTO knowledge.conversations (chat_id, client_id, message_id, from_user, message_text)
            VALUES (v_test_chat_id, v_client_id, 'msg_1_' || v_client_id, 'client', 'Message 1');

            -- ACT: Hard delete the message
            DELETE FROM knowledge.conversations WHERE message_id = 'msg_1_' || v_client_id;

            -- ASSERT: total_messages >= 0
            SELECT total_messages INTO v_msg_count
            FROM knowledge.clients WHERE id = v_client_id;

            IF v_msg_count < 0 THEN
                RAISE EXCEPTION 'total_messages went negative: %', v_msg_count;
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM knowledge.clients WHERE id = v_client_id;
        END $test$;
    $$
);

-- ════════════════════════════════════════════════════════════
-- SUITE 6: Concurrent Access (proper isolation)
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '🧪 Suite 6: Concurrent Access'

-- Test 6.1: Batch inserts maintain counter consistency
SELECT test_framework.run_test(
    'Concurrent Access',
    'Batch inserts maintain consistency',
    $$
        DO $test$
        DECLARE
            v_test_chat_id TEXT := 'test_concurrent_' || extract(epoch from now())::TEXT;
            v_client_id INT;
            v_msg_count INT;
        BEGIN
            -- ARRANGE: Create client
            INSERT INTO knowledge.clients (chat_id, full_name, total_messages)
            VALUES (v_test_chat_id, 'Concurrent Test', 0)
            RETURNING id INTO v_client_id;

            -- ACT: Batch insert (simulates concurrent inserts in single transaction)
            INSERT INTO knowledge.conversations (chat_id, client_id, message_id, from_user, message_text)
            SELECT
                v_test_chat_id,
                v_client_id,
                'msg_conc_' || i || '_' || v_client_id,
                'client',
                'Concurrent message ' || i
            FROM generate_series(1, 10) AS i;

            -- ASSERT: total_messages = 10
            SELECT total_messages INTO v_msg_count
            FROM knowledge.clients WHERE id = v_client_id;

            IF v_msg_count != 10 THEN
                RAISE EXCEPTION 'Expected 10 messages, got % (lost updates)', v_msg_count;
            END IF;

            -- TEARDOWN: Clean up
            DELETE FROM knowledge.clients WHERE id = v_client_id;
        END $test$;
    $$
);

-- ════════════════════════════════════════════════════════════
-- TEST RESULTS SUMMARY
-- ════════════════════════════════════════════════════════════

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '📊 TEST RESULTS SUMMARY'
\echo '════════════════════════════════════════════════════════════'

-- Summary by suite
SELECT
    test_suite,
    COUNT(*) AS total_tests,
    SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) AS passed,
    SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) AS failed
FROM test_results
GROUP BY test_suite
ORDER BY test_suite;

-- Failed tests detail
\echo ''
\echo 'Failed Tests:'
SELECT
    test_suite || ': ' || test_name AS failed_test,
    error_message
FROM test_results
WHERE status = 'FAIL'
ORDER BY test_suite, test_name;

-- Overall verdict
DO $$
DECLARE
    v_total INT;
    v_passed INT;
    v_failed INT;
BEGIN
    SELECT
        COUNT(*),
        SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END),
        SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END)
    INTO v_total, v_passed, v_failed
    FROM test_results;

    RAISE NOTICE '';
    RAISE NOTICE '════════════════════════════════════════════════════════════';
    RAISE NOTICE 'OVERALL: % total | % passed | % failed', v_total, v_passed, v_failed;
    RAISE NOTICE '════════════════════════════════════════════════════════════';

    IF v_failed > 0 THEN
        RAISE EXCEPTION '❌ TESTS FAILED: %/%', v_failed, v_total;
    ELSE
        RAISE NOTICE '✅ ALL TESTS PASSED (%/%)', v_passed, v_total;
    END IF;
END $$;
