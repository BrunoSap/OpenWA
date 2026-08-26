-- database/tests/fixtures/setup_test_env.sql
-- Test environment setup with proper AAA isolation
-- Creates test schema, fixtures, and helper functions

-- ════════════════════════════════════════════════════════════════════════════════════
-- ARRANGE: Create test schema for isolation
-- ════════════════════════════════════════════════════════════════════════════════════

DROP SCHEMA IF EXISTS test_fixtures CASCADE;
CREATE SCHEMA test_fixtures;

COMMENT ON SCHEMA test_fixtures IS 'Isolated test schema for database tests with AAA pattern compliance';

-- ════════════════════════════════════════════════════════════════════════════════════
-- ARRANGE: Test helper functions
-- ════════════════════════════════════════════════════════════════════════════════════

-- Function to clean all test data from production tables
CREATE OR REPLACE FUNCTION test_fixtures.clean_test_data()
RETURNS void AS $$
BEGIN
    -- Delete test data (marked by chat_id starting with 'test_')
    DELETE FROM knowledge.documents WHERE conversation_id IN (
        SELECT id FROM knowledge.conversations WHERE chat_id LIKE 'test_%'
    );
    DELETE FROM knowledge.conversations WHERE chat_id LIKE 'test_%';
    DELETE FROM knowledge.clients WHERE chat_id LIKE 'test_%';
    DELETE FROM intake_staging.lead_documents WHERE lead_id IN (
        SELECT id FROM intake_staging.leads WHERE chat_id LIKE 'test_%'
    );
    DELETE FROM intake_staging.document_reminders WHERE lead_id IN (
        SELECT id FROM intake_staging.leads WHERE chat_id LIKE 'test_%'
    );
    DELETE FROM intake_staging.lawapp_sync_queue WHERE lead_id IN (
        SELECT id FROM intake_staging.leads WHERE chat_id LIKE 'test_%'
    );
    DELETE FROM intake_staging.leads WHERE chat_id LIKE 'test_%';
    DELETE FROM knowledge.session_context WHERE chat_id LIKE 'test_%';

    RAISE NOTICE '🧹 Test data cleaned from production tables';
END;
$$ LANGUAGE plpgsql;

-- Function to create test conversation
CREATE OR REPLACE FUNCTION test_fixtures.create_test_conversation(
    p_chat_id TEXT,
    p_message_text TEXT DEFAULT 'Test message'
)
RETURNS UUID AS $$
DECLARE
    v_conv_id UUID;
BEGIN
    INSERT INTO knowledge.conversations (
        chat_id,
        message_id,
        message_text,
        from_user,
        timestamp
    ) VALUES (
        p_chat_id,
        'msg_' || gen_random_uuid()::text,
        p_message_text,
        true,
        NOW()
    )
    RETURNING id INTO v_conv_id;

    RETURN v_conv_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create test client
CREATE OR REPLACE FUNCTION test_fixtures.create_test_client(
    p_chat_id TEXT,
    p_cpf TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_client_id UUID;
BEGIN
    INSERT INTO knowledge.clients (
        chat_id,
        cpf,
        phone,
        stage,
        created_at
    ) VALUES (
        p_chat_id,
        p_cpf,
        p_phone,
        'lead',
        NOW()
    )
    RETURNING id INTO v_client_id;

    RETURN v_client_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create test lead
CREATE OR REPLACE FUNCTION test_fixtures.create_test_lead(
    p_chat_id TEXT,
    p_case_type TEXT DEFAULT 'aposentadoria',
    p_email TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_lead_id UUID;
BEGIN
    INSERT INTO intake_staging.leads (
        chat_id,
        case_type,
        case_data,
        email,
        created_at
    ) VALUES (
        p_chat_id,
        p_case_type,
        '{}'::jsonb,
        p_email,
        NOW()
    )
    RETURNING id INTO v_lead_id;

    RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql;

-- Function to assert test condition
CREATE OR REPLACE FUNCTION test_fixtures.assert_true(
    p_condition BOOLEAN,
    p_fail_message TEXT,
    p_pass_message TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    IF NOT p_condition THEN
        RAISE EXCEPTION 'FAIL: %', p_fail_message;
    END IF;

    IF p_pass_message IS NOT NULL THEN
        RAISE NOTICE '✅ PASS: %', p_pass_message;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to assert exception is raised
CREATE OR REPLACE FUNCTION test_fixtures.assert_raises(
    p_sql TEXT,
    p_expected_exception TEXT,
    p_test_description TEXT
)
RETURNS void AS $$
BEGIN
    BEGIN
        EXECUTE p_sql;
        RAISE EXCEPTION 'FAIL: % - No exception raised', p_test_description;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%' || p_expected_exception || '%' OR SQLSTATE = p_expected_exception THEN
            RAISE NOTICE '✅ PASS: % - Exception raised as expected', p_test_description;
        ELSE
            RAISE EXCEPTION 'FAIL: % - Wrong exception: % (expected: %)', p_test_description, SQLERRM, p_expected_exception;
        END IF;
    END;
END;
$$ LANGUAGE plpgsql;

-- ════════════════════════════════════════════════════════════════════════════════════
-- ARRANGE: Test data fixtures
-- ════════════════════════════════════════════════════════════════════════════════════

-- Create sample vector for testing (1536 dimensions)
CREATE OR REPLACE FUNCTION test_fixtures.generate_random_vector(p_dimensions INTEGER DEFAULT 1536)
RETURNS VECTOR AS $$
DECLARE
    v_vector_array TEXT;
BEGIN
    SELECT '[' || string_agg((random() * 2 - 1)::text, ',') || ']'
    INTO v_vector_array
    FROM generate_series(1, p_dimensions);

    RETURN v_vector_array::vector;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION test_fixtures.clean_test_data IS 'Removes all test data (chat_id LIKE test_%) from production tables';
COMMENT ON FUNCTION test_fixtures.create_test_conversation IS 'Creates a test conversation with default values';
COMMENT ON FUNCTION test_fixtures.create_test_client IS 'Creates a test client with optional CPF/phone/email';
COMMENT ON FUNCTION test_fixtures.create_test_lead IS 'Creates a test lead with default aposentadoria case';
COMMENT ON FUNCTION test_fixtures.assert_true IS 'Asserts condition is true, raises exception if false';
COMMENT ON FUNCTION test_fixtures.assert_raises IS 'Asserts that SQL statement raises expected exception';
COMMENT ON FUNCTION test_fixtures.generate_random_vector IS 'Generates random vector for testing (default 1536 dimensions)';

\echo '✅ Test fixtures environment setup complete'
