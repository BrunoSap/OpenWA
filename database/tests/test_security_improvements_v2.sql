-- database/tests/test_security_improvements_v2.sql
-- Test RLS, input validation, and security constraints
-- AAA Pattern Compliant: Explicit Arrange, Act, Assert phases

\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '🧪 SECURITY IMPROVEMENTS TEST SUITE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
\echo '📋 Prerequisites:'
\echo '   - Migration 008_add_security_improvements.sql must be applied'
\echo '   - test_fixtures schema must exist (run fixtures/setup_test_env.sql)'
\echo ''

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 1: Row-Level Security Enabled
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 1: RLS enabled on all knowledge schema tables'

DO $$
DECLARE
    v_tables_with_rls INTEGER;
    v_expected_tables INTEGER := 5; -- conversations, clients, documents, faq, session_context
BEGIN
    -- ARRANGE: Count tables in knowledge schema
    -- (No setup needed - testing existing schema)

    -- ACT: Query pg_tables for RLS status
    SELECT COUNT(*)
    INTO v_tables_with_rls
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
    WHERE t.schemaname = 'knowledge'
        AND t.tablename IN ('conversations', 'clients', 'documents', 'faq', 'session_context')
        AND c.relrowsecurity = true;

    -- ASSERT: All expected tables have RLS enabled
    PERFORM test_fixtures.assert_true(
        v_tables_with_rls = v_expected_tables,
        format('RLS enabled on %s/%s knowledge tables', v_tables_with_rls, v_expected_tables),
        format('RLS enabled on all %s knowledge schema tables', v_expected_tables)
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 2: RLS Enabled on intake_staging Schema
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 2: RLS enabled on all intake_staging schema tables'

DO $$
DECLARE
    v_tables_with_rls INTEGER;
    v_expected_tables INTEGER := 4; -- leads, lead_documents, lawapp_sync_queue, document_reminders
BEGIN
    -- ARRANGE: Count tables in intake_staging schema
    -- (No setup needed - testing existing schema)

    -- ACT: Query pg_tables for RLS status
    SELECT COUNT(*)
    INTO v_tables_with_rls
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
    WHERE t.schemaname = 'intake_staging'
        AND t.tablename IN ('leads', 'lead_documents', 'lawapp_sync_queue', 'document_reminders')
        AND c.relrowsecurity = true;

    -- ASSERT: All expected tables have RLS enabled
    PERFORM test_fixtures.assert_true(
        v_tables_with_rls = v_expected_tables,
        format('RLS enabled on %s/%s intake_staging tables', v_tables_with_rls, v_expected_tables),
        format('RLS enabled on all %s intake_staging schema tables', v_expected_tables)
    );
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 3: Message Text Length Constraint
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 3: Message text length constraint (50,000 char limit)'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_msg_length_' || gen_random_uuid()::text;
BEGIN
    -- ARRANGE: Prepare test data with message exceeding 50,000 characters
    -- (No fixture insertion needed - testing constraint on insert)

    -- ACT & ASSERT: Attempt to insert message exceeding limit
    BEGIN
        INSERT INTO knowledge.conversations (chat_id, message_id, message_text, from_user, timestamp)
        VALUES (v_test_chat_id, 'msg_1', repeat('x', 50001), true, NOW());

        -- If we reach here, constraint did not work
        RAISE EXCEPTION 'Message text length constraint not enforced';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Message text length constraint enforced (rejects 50,001 chars)';
    END;

    -- CLEANUP: No data inserted due to constraint violation
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 4: Email Validation - Reject Invalid
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 4: Email validation rejects invalid emails'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_email_invalid_' || gen_random_uuid()::text;
BEGIN
    -- ARRANGE: Prepare invalid email addresses
    -- (Testing various invalid formats)

    -- ACT & ASSERT: Attempt to insert invalid email (too short: a@b.c = 5 chars)
    BEGIN
        INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
        VALUES (v_test_chat_id, 'aposentadoria', '{}'::jsonb, 'a@b.c');

        RAISE EXCEPTION 'Email validation too permissive (accepted a@b.c)';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Email validation rejects too-short emails (a@b.c)';
    END;

    -- CLEANUP: No data inserted due to constraint violation
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 5: Email Validation - Accept Valid
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 5: Email validation accepts valid emails'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_email_valid_' || gen_random_uuid()::text;
    v_lead_id UUID;
BEGIN
    -- ARRANGE: Prepare valid email address
    -- (No prior setup needed)

    -- ACT: Insert lead with valid email
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
    VALUES (v_test_chat_id, 'aposentadoria', '{}'::jsonb, 'valid@example.com')
    RETURNING id INTO v_lead_id;

    -- ASSERT: Insert succeeded
    PERFORM test_fixtures.assert_true(
        v_lead_id IS NOT NULL,
        'Email validation rejected valid email',
        'Email validation accepts valid emails (valid@example.com)'
    );

    -- CLEANUP: Remove test data
    DELETE FROM intake_staging.leads WHERE id = v_lead_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 6: Phone Format Validation
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 6: Phone format validation enforced'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_phone_' || gen_random_uuid()::text;
BEGIN
    -- ARRANGE: Prepare invalid phone format
    -- (No fixture insertion needed)

    -- ACT & ASSERT: Attempt to insert invalid phone
    BEGIN
        INSERT INTO knowledge.clients (chat_id, phone, stage)
        VALUES (v_test_chat_id, 'invalid phone!', 'lead');

        RAISE EXCEPTION 'Phone format validation not enforced';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Phone format validation rejects invalid formats';
    END;

    -- CLEANUP: No data inserted due to constraint violation
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 7: CPF Uniqueness - Allows Multiple NULLs
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 7: CPF uniqueness constraint allows multiple NULL values'

DO $$
DECLARE
    v_client_id_1 UUID;
    v_client_id_2 UUID;
BEGIN
    -- ARRANGE: Create two clients with NULL CPF
    v_client_id_1 := test_fixtures.create_test_client('test_cpf_null_1_' || gen_random_uuid()::text, NULL);
    v_client_id_2 := test_fixtures.create_test_client('test_cpf_null_2_' || gen_random_uuid()::text, NULL);

    -- ACT: Both inserts succeeded (no exception)

    -- ASSERT: Both clients exist with NULL CPF
    PERFORM test_fixtures.assert_true(
        v_client_id_1 IS NOT NULL AND v_client_id_2 IS NOT NULL,
        'CPF uniqueness constraint rejects multiple NULLs',
        'CPF uniqueness constraint allows multiple NULL values'
    );

    -- CLEANUP: Remove test clients
    DELETE FROM knowledge.clients WHERE id IN (v_client_id_1, v_client_id_2);
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 8: CPF Uniqueness - Rejects Duplicates
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 8: CPF uniqueness constraint rejects duplicate non-NULL values'

DO $$
DECLARE
    v_test_cpf TEXT := '12345678901';
    v_client_id_1 UUID;
BEGIN
    -- ARRANGE: Create first client with CPF
    v_client_id_1 := test_fixtures.create_test_client(
        'test_cpf_dup_1_' || gen_random_uuid()::text,
        v_test_cpf
    );

    -- ACT & ASSERT: Attempt to insert duplicate CPF
    BEGIN
        PERFORM test_fixtures.create_test_client(
            'test_cpf_dup_2_' || gen_random_uuid()::text,
            v_test_cpf
        );

        RAISE EXCEPTION 'CPF uniqueness constraint allows duplicates';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '✅ PASS: CPF uniqueness constraint rejects duplicate non-NULL values';
    END;

    -- CLEANUP: Remove test client
    DELETE FROM knowledge.clients WHERE id = v_client_id_1;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 9: Referential Integrity - CASCADE on documents
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 9: documents.conversation_id ON DELETE CASCADE enforced'

DO $$
DECLARE
    v_test_chat_id TEXT := 'test_cascade_' || gen_random_uuid()::text;
    v_conv_id UUID;
    v_doc_id UUID;
    v_doc_exists BOOLEAN;
BEGIN
    -- ARRANGE: Create conversation and document
    v_conv_id := test_fixtures.create_test_conversation(v_test_chat_id, 'Test message');

    INSERT INTO knowledge.documents (conversation_id, document_type, file_path)
    VALUES (v_conv_id, 'image', '/test/path.jpg')
    RETURNING id INTO v_doc_id;

    -- ACT: Delete conversation
    DELETE FROM knowledge.conversations WHERE id = v_conv_id;

    -- ASSERT: Document was cascade deleted
    SELECT EXISTS(SELECT 1 FROM knowledge.documents WHERE id = v_doc_id)
    INTO v_doc_exists;

    PERFORM test_fixtures.assert_true(
        NOT v_doc_exists,
        'Document not cascade deleted with conversation',
        'documents.conversation_id ON DELETE CASCADE enforced'
    );

    -- CLEANUP: Already deleted by cascade
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '✅ SECURITY IMPROVEMENTS TEST SUITE COMPLETE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
