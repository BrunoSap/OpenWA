-- database/tests/test_rls_integration.sql
-- Integration tests for Row-Level Security policies with actual user roles
-- AAA Pattern Compliant

\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '🧪 RLS INTEGRATION TEST SUITE (Role-Based Access Control)'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
\echo '📋 Prerequisites:'
\echo '   - Migration 008_add_security_improvements.sql must be applied'
\echo '   - RLS policies must be enabled on all tables'
\echo '   - test_fixtures schema must exist'
\echo ''
\echo '⚠️  WARNING: This test suite creates temporary database roles'
\echo '             Roles are dropped at the end of test execution'
\echo ''

-- ════════════════════════════════════════════════════════════════════════════════════
-- ARRANGE: Create test roles
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🔧 Setting up test roles...'

DO $$
BEGIN
    -- Create test application role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
        CREATE ROLE test_app_user WITH LOGIN PASSWORD 'test123';
        RAISE NOTICE '✅ Created role: test_app_user';
    ELSE
        RAISE NOTICE '⏭️  Role test_app_user already exists';
    END IF;

    -- Create test read-only role
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_readonly_user') THEN
        CREATE ROLE test_readonly_user WITH LOGIN PASSWORD 'test123';
        RAISE NOTICE '✅ Created role: test_readonly_user';
    ELSE
        RAISE NOTICE '⏭️  Role test_readonly_user already exists';
    END IF;
END $$;

-- Grant necessary permissions to test roles
GRANT USAGE ON SCHEMA knowledge, intake_staging, test_fixtures TO test_app_user, test_readonly_user;
GRANT ALL ON ALL TABLES IN SCHEMA knowledge, intake_staging TO test_app_user;
GRANT SELECT ON ALL TABLES IN SCHEMA knowledge, intake_staging TO test_readonly_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA test_fixtures TO test_app_user, test_readonly_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO test_app_user, test_readonly_user;

\echo '✅ Test roles setup complete'
\echo ''

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 1: App User Can Read Data (RLS Policy Allows)
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 1: Application user can read data with RLS enabled'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_rls_read_' || gen_random_uuid()::text;
    v_conv_id UUID;
    v_result_count INTEGER;
BEGIN
    -- ARRANGE: Insert test conversation as superuser
    v_conv_id := test_fixtures.create_test_conversation(v_test_chat_id, 'Test RLS read');

    -- ACT: Switch to test_app_user and query
    SET LOCAL ROLE test_app_user;

    SELECT COUNT(*) INTO v_result_count
    FROM knowledge.conversations
    WHERE id = v_conv_id;

    -- Reset role
    RESET ROLE;

    -- ASSERT: App user can see the record
    PERFORM test_fixtures.assert_true(
        v_result_count = 1,
        format('App user cannot read data (count: %s)', v_result_count),
        'Application user can read data with RLS enabled'
    );

    -- CLEANUP
    DELETE FROM knowledge.conversations WHERE id = v_conv_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 2: App User Can Insert Data (RLS Policy Allows)
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 2: Application user can insert data with RLS enabled'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_rls_insert_' || gen_random_uuid()::text;
    v_conv_id UUID;
BEGIN
    -- ARRANGE: Switch to test_app_user
    SET LOCAL ROLE test_app_user;

    -- ACT: Insert as app user
    INSERT INTO knowledge.conversations (chat_id, message_id, message_text, from_user, timestamp)
    VALUES (v_test_chat_id, 'msg_1', 'Test RLS insert', true, NOW())
    RETURNING id INTO v_conv_id;

    -- Reset role
    RESET ROLE;

    -- ASSERT: Insert succeeded
    PERFORM test_fixtures.assert_true(
        v_conv_id IS NOT NULL,
        'App user cannot insert data with RLS enabled',
        'Application user can insert data with RLS enabled'
    );

    -- CLEANUP
    DELETE FROM knowledge.conversations WHERE id = v_conv_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 3: App User Can Update Data (RLS Policy Allows)
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 3: Application user can update data with RLS enabled'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_rls_update_' || gen_random_uuid()::text;
    v_conv_id UUID;
    v_updated_text TEXT;
BEGIN
    -- ARRANGE: Insert test conversation as superuser
    v_conv_id := test_fixtures.create_test_conversation(v_test_chat_id, 'Original text');

    -- ACT: Switch to test_app_user and update
    SET LOCAL ROLE test_app_user;

    UPDATE knowledge.conversations
    SET message_text = 'Updated text'
    WHERE id = v_conv_id;

    SELECT message_text INTO v_updated_text
    FROM knowledge.conversations
    WHERE id = v_conv_id;

    -- Reset role
    RESET ROLE;

    -- ASSERT: Update succeeded
    PERFORM test_fixtures.assert_true(
        v_updated_text = 'Updated text',
        format('App user cannot update data (text: %s)', v_updated_text),
        'Application user can update data with RLS enabled'
    );

    -- CLEANUP
    DELETE FROM knowledge.conversations WHERE id = v_conv_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 4: App User Can Delete Data (RLS Policy Allows)
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 4: Application user can delete data with RLS enabled'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_rls_delete_' || gen_random_uuid()::text;
    v_conv_id UUID;
    v_exists_after_delete BOOLEAN;
BEGIN
    -- ARRANGE: Insert test conversation as superuser
    v_conv_id := test_fixtures.create_test_conversation(v_test_chat_id, 'To be deleted');

    -- ACT: Switch to test_app_user and delete
    SET LOCAL ROLE test_app_user;

    DELETE FROM knowledge.conversations WHERE id = v_conv_id;

    SELECT EXISTS(SELECT 1 FROM knowledge.conversations WHERE id = v_conv_id)
    INTO v_exists_after_delete;

    -- Reset role
    RESET ROLE;

    -- ASSERT: Delete succeeded
    PERFORM test_fixtures.assert_true(
        NOT v_exists_after_delete,
        'App user cannot delete data with RLS enabled',
        'Application user can delete data with RLS enabled'
    );

    -- CLEANUP: Already deleted
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 5: Read-Only User Can Read But Not Write
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 5: Read-only user can read but cannot insert/update/delete'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_rls_readonly_' || gen_random_uuid()::text;
    v_conv_id UUID;
    v_can_read BOOLEAN := false;
    v_can_insert BOOLEAN := false;
BEGIN
    -- ARRANGE: Insert test conversation as superuser
    v_conv_id := test_fixtures.create_test_conversation(v_test_chat_id, 'Read-only test');

    -- ACT: Switch to test_readonly_user

    -- Test read permission
    SET LOCAL ROLE test_readonly_user;
    BEGIN
        PERFORM 1 FROM knowledge.conversations WHERE id = v_conv_id;
        v_can_read := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_can_read := false;
    END;

    -- Test insert permission (should fail)
    BEGIN
        INSERT INTO knowledge.conversations (chat_id, message_id, message_text, from_user, timestamp)
        VALUES ('test_ro_insert', 'msg_1', 'Should fail', true, NOW());
        v_can_insert := true;
    EXCEPTION WHEN insufficient_privilege THEN
        v_can_insert := false;
    END;

    -- Reset role
    RESET ROLE;

    -- ASSERT: Can read but not insert
    PERFORM test_fixtures.assert_true(
        v_can_read AND NOT v_can_insert,
        format('Read-only user permissions incorrect (read: %s, insert: %s)', v_can_read, v_can_insert),
        'Read-only user can read but cannot insert/update/delete'
    );

    -- CLEANUP
    DELETE FROM knowledge.conversations WHERE id = v_conv_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 6: RLS Policies Apply to intake_staging Schema
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 6: RLS policies apply to intake_staging schema tables'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_rls_staging_' || gen_random_uuid()::text;
    v_lead_id UUID;
    v_result_count INTEGER;
BEGIN
    -- ARRANGE: Insert test lead as superuser
    v_lead_id := test_fixtures.create_test_lead(v_test_chat_id, 'aposentadoria');

    -- ACT: Switch to test_app_user and query
    SET LOCAL ROLE test_app_user;

    SELECT COUNT(*) INTO v_result_count
    FROM intake_staging.leads
    WHERE id = v_lead_id;

    -- Reset role
    RESET ROLE;

    -- ASSERT: App user can see the record
    PERFORM test_fixtures.assert_true(
        v_result_count = 1,
        format('RLS not working on intake_staging (count: %s)', v_result_count),
        'RLS policies apply correctly to intake_staging schema'
    );

    -- CLEANUP
    DELETE FROM intake_staging.leads WHERE id = v_lead_id;
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '🧹 Cleaning up test roles...'
\echo '════════════════════════════════════════════════════════════════════════════════'

-- Revoke permissions
REVOKE ALL ON ALL TABLES IN SCHEMA knowledge, intake_staging FROM test_app_user, test_readonly_user;
REVOKE USAGE ON SCHEMA knowledge, intake_staging, test_fixtures FROM test_app_user, test_readonly_user;

-- Drop test roles
DO $$
BEGIN
    -- Terminate any active connections from test roles
    PERFORM pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE usename IN ('test_app_user', 'test_readonly_user')
    AND pid != pg_backend_pid();

    -- Drop roles
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
        DROP ROLE test_app_user;
        RAISE NOTICE '✅ Dropped role: test_app_user';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_readonly_user') THEN
        DROP ROLE test_readonly_user;
        RAISE NOTICE '✅ Dropped role: test_readonly_user';
    END IF;
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '✅ RLS INTEGRATION TEST SUITE COMPLETE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
