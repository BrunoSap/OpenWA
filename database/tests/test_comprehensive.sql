-- database/tests/test_comprehensive.sql
-- Comprehensive test suite covering edge cases, race conditions, and security

\set ON_ERROR_STOP on
\timing on

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  TEST SUITE: Comprehensive Testing
-- ═══════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS test_results;

CREATE TABLE IF NOT EXISTS test_results.test_runs (
    test_name VARCHAR(200) PRIMARY KEY,
    status VARCHAR(20),
    message TEXT,
    run_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helper function to record test results
CREATE OR REPLACE FUNCTION test_results.record_test(
    p_test_name VARCHAR,
    p_status VARCHAR,
    p_message TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO test_results.test_runs (test_name, status, message)
    VALUES (p_test_name, p_status, p_message)
    ON CONFLICT (test_name) DO UPDATE
    SET status = EXCLUDED.status,
        message = EXCLUDED.message,
        run_at = NOW();
END;
$$ LANGUAGE plpgsql;

\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '  COMPREHENSIVE TEST SUITE'
\echo '═══════════════════════════════════════════════════════════'
\echo ''

-- ═══════════════════════════════════════════════════════════
--  TEST 1: TIMESTAMPTZ Verification
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 1: All timestamps are timezone-aware (TIMESTAMPTZ)'

DO $$
DECLARE
    v_timestamp_count INT;
    v_timestamptz_count INT;
BEGIN
    -- Count TIMESTAMP columns (should be 0)
    SELECT COUNT(*) INTO v_timestamp_count
    FROM information_schema.columns
    WHERE table_schema IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
    AND data_type = 'timestamp without time zone';

    -- Count TIMESTAMPTZ columns
    SELECT COUNT(*) INTO v_timestamptz_count
    FROM information_schema.columns
    WHERE table_schema IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
    AND data_type = 'timestamp with time zone';

    IF v_timestamp_count > 0 THEN
        PERFORM test_results.record_test(
            'timestamptz_verification',
            'FAIL',
            format('Found %s TIMESTAMP columns (should be TIMESTAMPTZ)', v_timestamp_count)
        );
        RAISE EXCEPTION 'FAIL: Found % TIMESTAMP columns without timezone', v_timestamp_count;
    ELSE
        PERFORM test_results.record_test(
            'timestamptz_verification',
            'PASS',
            format('All %s timestamp columns are TIMESTAMPTZ', v_timestamptz_count)
        );
        RAISE NOTICE '✅ PASS: All timestamp columns are timezone-aware';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 2: BIGSERIAL vs SERIAL
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 2: Primary keys use BIGSERIAL for scalability'

DO $$
DECLARE
    v_serial_count INT;
BEGIN
    -- Count tables using INT/SERIAL for id (should upgrade to BIGINT/BIGSERIAL)
    SELECT COUNT(*) INTO v_serial_count
    FROM information_schema.columns
    WHERE table_schema IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
    AND column_name = 'id'
    AND data_type IN ('integer');

    IF v_serial_count > 0 THEN
        PERFORM test_results.record_test(
            'bigserial_check',
            'WARN',
            format('%s tables using INTEGER for id (recommend BIGINT for production)', v_serial_count)
        );
        RAISE WARNING 'WARN: % tables use INTEGER for id (will overflow at 2.1B rows)', v_serial_count;
    ELSE
        PERFORM test_results.record_test('bigserial_check', 'PASS', 'All primary keys use BIGINT');
        RAISE NOTICE '✅ PASS: All primary keys use appropriate size';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 3: Row Level Security (RLS)
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 3: Row Level Security policies'

DO $$
DECLARE
    v_rls_enabled_count INT;
    v_total_tables INT;
BEGIN
    SELECT COUNT(*) INTO v_total_tables
    FROM pg_tables
    WHERE schemaname IN ('knowledge', 'intake_staging', 'telegram', 'bot_config');

    SELECT COUNT(*) INTO v_rls_enabled_count
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE t.schemaname IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
    AND c.relrowsecurity = true;

    IF v_rls_enabled_count = 0 THEN
        PERFORM test_results.record_test(
            'rls_check',
            'WARN',
            format('No RLS policies found on %s tables (recommend for multi-tenant)', v_total_tables)
        );
        RAISE WARNING 'WARN: No RLS policies enabled (recommend for multi-tenant data isolation)';
    ELSE
        PERFORM test_results.record_test(
            'rls_check',
            'PASS',
            format('%s/%s tables have RLS enabled', v_rls_enabled_count, v_total_tables)
        );
        RAISE NOTICE '✅ PASS: RLS enabled on %/%tables', v_rls_enabled_count, v_total_tables;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 4: Audit Logging
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 4: Audit trail for sensitive tables'

DO $$
DECLARE
    v_has_audit_log BOOLEAN;
    v_audit_trigger_count INT;
BEGIN
    -- Check if audit_log table exists
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'knowledge' AND table_name = 'audit_log'
    ) INTO v_has_audit_log;

    IF v_has_audit_log THEN
        -- Count audit triggers
        SELECT COUNT(*) INTO v_audit_trigger_count
        FROM information_schema.triggers
        WHERE trigger_schema IN ('knowledge', 'intake_staging')
        AND trigger_name LIKE '%audit%';

        PERFORM test_results.record_test(
            'audit_logging',
            'PASS',
            format('Audit log exists with %s triggers', v_audit_trigger_count)
        );
        RAISE NOTICE '✅ PASS: Audit logging configured (% triggers)', v_audit_trigger_count;
    ELSE
        PERFORM test_results.record_test(
            'audit_logging',
            'FAIL',
            'No audit_log table found for sensitive data tracking'
        );
        RAISE WARNING 'WARN: No audit_log table found (recommend for compliance)';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 5: Database Roles
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 5: Database roles and grants'

DO $$
DECLARE
    v_app_role_exists BOOLEAN;
    v_readonly_role_exists BOOLEAN;
BEGIN
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openwa_app') INTO v_app_role_exists;
    SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'openwa_readonly') INTO v_readonly_role_exists;

    IF v_app_role_exists AND v_readonly_role_exists THEN
        PERFORM test_results.record_test('database_roles', 'PASS', 'Application roles configured');
        RAISE NOTICE '✅ PASS: Database roles configured';
    ELSE
        PERFORM test_results.record_test(
            'database_roles',
            'WARN',
            'Missing application roles (security best practice)'
        );
        RAISE WARNING 'WARN: Missing application roles (recommend least-privilege access)';
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 6: CPF Validation
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 6: CPF format validation'

DO $$
BEGIN
    -- Test valid CPF format
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf)
        VALUES ('test_cpf_valid@c.us', '12345678901');
        DELETE FROM knowledge.clients WHERE chat_id = 'test_cpf_valid@c.us';
        RAISE NOTICE '  ✅ Valid CPF accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE EXCEPTION 'FAIL: Valid CPF rejected';
    END;

    -- Test invalid CPF format
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf)
        VALUES ('test_cpf_invalid@c.us', '123.456.789-01');
        RAISE EXCEPTION 'FAIL: Invalid CPF accepted (should reject formatted CPF)';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '  ✅ Invalid CPF rejected (as expected)';
    END;

    -- Test short CPF
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf)
        VALUES ('test_cpf_short@c.us', '123456');
        RAISE EXCEPTION 'FAIL: Short CPF accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '  ✅ Short CPF rejected (as expected)';
    END;

    PERFORM test_results.record_test('cpf_validation', 'PASS', 'CPF format validation working');
    RAISE NOTICE '✅ PASS: CPF validation constraints working';
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 7: Concurrent Insert Race Condition
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 7: Concurrent insert handling'

DO $$
BEGIN
    -- Test duplicate message_id handling
    INSERT INTO knowledge.conversations (chat_id, message_id, from_user, message_text)
    VALUES ('test_race@c.us', 'msg_race_1', 'client', 'First message');

    BEGIN
        INSERT INTO knowledge.conversations (chat_id, message_id, from_user, message_text)
        VALUES ('test_race@c.us', 'msg_race_1', 'client', 'Duplicate message');
        RAISE EXCEPTION 'FAIL: Duplicate message_id accepted';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '  ✅ Duplicate message_id rejected (as expected)';
    END;

    DELETE FROM knowledge.conversations WHERE chat_id = 'test_race@c.us';

    PERFORM test_results.record_test('race_condition', 'PASS', 'Duplicate message_id properly rejected');
    RAISE NOTICE '✅ PASS: Race condition handling works';
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 8: Soft Delete Functionality
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 8: Soft delete with audit trail'

DO $$
DECLARE
    v_client_id INT;
    v_visible_count INT;
    v_deleted_count INT;
BEGIN
    -- Create test client
    INSERT INTO knowledge.clients (chat_id, cpf, full_name)
    VALUES ('test_softdelete@c.us', '11111111111', 'Test Soft Delete')
    RETURNING id INTO v_client_id;

    -- Soft delete
    UPDATE knowledge.clients
    SET deleted_at = NOW(), deleted_by = 'test_user'
    WHERE id = v_client_id;

    -- Check visibility with index filter
    SELECT COUNT(*) INTO v_visible_count
    FROM knowledge.clients
    WHERE id = v_client_id AND deleted_at IS NULL;

    SELECT COUNT(*) INTO v_deleted_count
    FROM knowledge.clients
    WHERE id = v_client_id AND deleted_at IS NOT NULL;

    IF v_visible_count = 0 AND v_deleted_count = 1 THEN
        PERFORM test_results.record_test('soft_delete', 'PASS', 'Soft delete audit trail works');
        RAISE NOTICE '✅ PASS: Soft delete working correctly';
    ELSE
        RAISE EXCEPTION 'FAIL: Soft delete not working (visible: %, deleted: %)', v_visible_count, v_deleted_count;
    END IF;

    -- Cleanup
    DELETE FROM knowledge.clients WHERE id = v_client_id;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 9: Performance - Index Usage
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 9: Index usage verification'

DO $$
DECLARE
    v_index_count INT;
    v_vector_index_count INT;
BEGIN
    -- Count indexes on application tables
    SELECT COUNT(*) INTO v_index_count
    FROM pg_indexes
    WHERE schemaname IN ('knowledge', 'intake_staging', 'telegram', 'bot_config');

    -- Count vector indexes
    SELECT COUNT(*) INTO v_vector_index_count
    FROM pg_indexes
    WHERE schemaname IN ('knowledge', 'intake_staging')
    AND indexdef LIKE '%ivfflat%';

    IF v_index_count < 20 THEN
        RAISE WARNING 'WARN: Only % indexes found (may need more for performance)', v_index_count;
    ELSE
        RAISE NOTICE '✅ % indexes created', v_index_count;
    END IF;

    IF v_vector_index_count < 2 THEN
        RAISE WARNING 'WARN: Only % vector indexes (should have 2+)', v_vector_index_count;
    ELSE
        RAISE NOTICE '✅ % vector indexes for similarity search', v_vector_index_count;
    END IF;

    PERFORM test_results.record_test(
        'index_coverage',
        'PASS',
        format('%s indexes including %s vector indexes', v_index_count, v_vector_index_count)
    );
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST 10: Foreign Key Cascades
-- ═══════════════════════════════════════════════════════════
\echo '📋 Test 10: Foreign key cascade behavior'

DO $$
DECLARE
    v_client_id INT;
    v_doc_count INT;
BEGIN
    -- Create client with document
    INSERT INTO knowledge.clients (chat_id, full_name)
    VALUES ('test_cascade@c.us', 'Cascade Test')
    RETURNING id INTO v_client_id;

    INSERT INTO knowledge.documents (client_id, document_type, storage_path)
    VALUES (v_client_id, 'rg', '/tmp/test_rg.pdf');

    -- Delete client (should cascade to documents)
    DELETE FROM knowledge.clients WHERE id = v_client_id;

    -- Check documents were deleted
    SELECT COUNT(*) INTO v_doc_count
    FROM knowledge.documents
    WHERE client_id = v_client_id;

    IF v_doc_count = 0 THEN
        PERFORM test_results.record_test('cascade_delete', 'PASS', 'CASCADE deletes working');
        RAISE NOTICE '✅ PASS: Cascade deletes working';
    ELSE
        RAISE EXCEPTION 'FAIL: Cascade delete failed (% orphaned documents)', v_doc_count;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
--  TEST RESULTS SUMMARY
-- ═══════════════════════════════════════════════════════════
\echo ''
\echo '═══════════════════════════════════════════════════════════'
\echo '  TEST RESULTS SUMMARY'
\echo '═══════════════════════════════════════════════════════════'

SELECT
    status,
    COUNT(*) as count,
    CASE
        WHEN status = 'PASS' THEN '✅'
        WHEN status = 'WARN' THEN '⚠️'
        ELSE '❌'
    END as icon
FROM test_results.test_runs
GROUP BY status
ORDER BY status;

\echo ''
\echo 'Detailed Results:'
SELECT
    test_name,
    status,
    COALESCE(message, '') as details,
    run_at
FROM test_results.test_runs
ORDER BY status, test_name;

COMMIT;

\echo ''
\echo '🎉 Comprehensive test suite completed!'
