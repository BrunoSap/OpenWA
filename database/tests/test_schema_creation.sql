-- database/tests/test_schema_creation.sql
-- Comprehensive schema validation tests with AAA structure

-- ============================================================================
-- SETUP / ARRANGE PHASE
-- ============================================================================
\echo '🔧 Setting up test environment...'

-- Clean up any previous test data
DO $$
BEGIN
    -- Clean telegram test data
    DELETE FROM telegram.topic_context WHERE lead_id < 0;
    DELETE FROM telegram.client_tasks WHERE lead_id < 0;
    DELETE FROM telegram.lead_topics WHERE lead_id < 0;
    DELETE FROM telegram.user_permissions WHERE telegram_user_id < 0;

    -- Clean intake_staging test data
    DELETE FROM intake_staging.lead_documents WHERE lead_id < 0;
    DELETE FROM intake_staging.leads WHERE id < 0;

    -- Clean knowledge test data
    DELETE FROM knowledge.clients WHERE chat_id LIKE 'test_%';

    RAISE NOTICE '✅ Test environment cleaned';
END $$;

\echo '✅ Setup complete'

-- ============================================================================
-- TEST SUITE 1: PGVECTOR INSTALLATION
-- ============================================================================
\echo ''
\echo '🧪 Testing pgvector installation...'

-- Test 1.1: Extension exists
-- ARRANGE: Check pg_extension catalog
-- ACT: Query for vector extension
-- ASSERT: Extension must exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
    ) THEN
        RAISE EXCEPTION 'FAIL: pgvector extension not installed';
    END IF;
    RAISE NOTICE '✅ PASS: pgvector extension installed';
END $$;

-- Test 1.2: Can create vector column
-- ARRANGE: None needed
-- ACT: Create temp table with VECTOR(1536) column
-- ASSERT: Should succeed without error
DO $$
BEGIN
    CREATE TEMP TABLE test_vector (
        id SERIAL PRIMARY KEY,
        embedding VECTOR(1536)
    );
    DROP TABLE test_vector;
    RAISE NOTICE '✅ PASS: VECTOR(1536) type works';
END $$;

-- Test 1.3: Can use vector operators
-- ARRANGE: None needed
-- ACT: Test cosine distance operator (<=>)
-- ASSERT: Should return valid float result
DO $$
DECLARE
    result FLOAT;
BEGIN
    SELECT '[1,0,0]'::vector <=> '[0,1,0]'::vector INTO result;
    IF result IS NULL THEN
        RAISE EXCEPTION 'FAIL: Vector operators not working';
    END IF;
    RAISE NOTICE '✅ PASS: Vector operators work (cosine distance: %)', result;
END $$;

\echo '✅ All pgvector tests passed!'

-- ============================================================================
-- TEST SUITE 2: TELEGRAM SCHEMA
-- ============================================================================
\echo ''
\echo '🧪 Testing telegram schema...'

-- Test 2.1: All telegram tables exist
-- ARRANGE: Check pg_tables catalog
-- ACT: Query for each expected table
-- ASSERT: All tables must exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'telegram' AND tablename = 'lead_topics') THEN
        RAISE EXCEPTION 'FAIL: telegram.lead_topics not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'telegram' AND tablename = 'client_tasks') THEN
        RAISE EXCEPTION 'FAIL: telegram.client_tasks not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'telegram' AND tablename = 'topic_context') THEN
        RAISE EXCEPTION 'FAIL: telegram.topic_context not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'telegram' AND tablename = 'user_permissions') THEN
        RAISE EXCEPTION 'FAIL: telegram.user_permissions not created';
    END IF;

    RAISE NOTICE '✅ PASS: All telegram tables created';
END $$;

-- Test 2.2: Telegram indexes exist
-- ARRANGE: Check pg_indexes catalog
-- ACT: Query for each expected index
-- ASSERT: All indexes must exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'telegram' AND indexname = 'idx_lead_topics_group') THEN
        RAISE EXCEPTION 'FAIL: idx_lead_topics_group not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'telegram' AND indexname = 'idx_lead_topics_archived') THEN
        RAISE EXCEPTION 'FAIL: idx_lead_topics_archived not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'telegram' AND indexname = 'idx_client_tasks_pending') THEN
        RAISE EXCEPTION 'FAIL: idx_client_tasks_pending not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'telegram' AND indexname = 'idx_client_tasks_created') THEN
        RAISE EXCEPTION 'FAIL: idx_client_tasks_created not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'telegram' AND indexname = 'idx_topic_context_lead') THEN
        RAISE EXCEPTION 'FAIL: idx_topic_context_lead not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'telegram' AND indexname = 'idx_user_permissions_role') THEN
        RAISE EXCEPTION 'FAIL: idx_user_permissions_role not created';
    END IF;

    RAISE NOTICE '✅ PASS: All telegram indexes created';
END $$;

-- Test 2.3: task_type CHECK constraint (positive case)
-- ARRANGE: Insert test lead
-- ACT: Insert valid task_type
-- ASSERT: Should succeed
DO $$
DECLARE
    test_lead_id INT;
BEGIN
    -- Arrange: Create test lead (using actual schema columns)
    INSERT INTO intake_staging.leads (id, chat_id, phone, case_type, case_data)
    VALUES (-1, 'test_lead_1', '555-0001', 'trabalhista', '{}')
    RETURNING id INTO test_lead_id;

    -- Act: Insert with valid task_type
    INSERT INTO telegram.client_tasks (lead_id, task_type, task_data)
    VALUES (test_lead_id, 'ask_question', '{"question": "test"}');

    -- Assert: Success
    RAISE NOTICE '✅ PASS: task_type accepts valid value (ask_question)';

    -- Cleanup
    DELETE FROM telegram.client_tasks WHERE lead_id = test_lead_id;
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 2.4: task_type CHECK constraint (negative case)
-- ARRANGE: Insert test lead
-- ACT: Try to insert invalid task_type
-- ASSERT: Should fail with check_violation
DO $$
DECLARE
    test_lead_id INT;
BEGIN
    -- Arrange: Create test lead
    INSERT INTO intake_staging.leads (id, chat_id, phone, case_type, case_data)
    VALUES (-2, 'test_lead_2', '555-0002', 'trabalhista', '{}')
    RETURNING id INTO test_lead_id;

    -- Act: Try invalid task_type
    BEGIN
        INSERT INTO telegram.client_tasks (lead_id, task_type, task_data)
        VALUES (test_lead_id, 'invalid_type', '{"test": "data"}');

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: task_type constraint did not reject invalid value';
    EXCEPTION WHEN check_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: task_type constraint rejects invalid value';
    END;

    -- Cleanup
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 2.5: status CHECK constraint (positive case)
-- ARRANGE: Insert test lead
-- ACT: Insert valid status
-- ASSERT: Should succeed
DO $$
DECLARE
    test_lead_id INT;
BEGIN
    -- Arrange: Create test lead
    INSERT INTO intake_staging.leads (id, chat_id, phone, case_type, case_data)
    VALUES (-3, 'test_lead_3', '555-0003', 'trabalhista', '{}')
    RETURNING id INTO test_lead_id;

    -- Act: Insert with valid status
    INSERT INTO telegram.client_tasks (lead_id, task_type, status, task_data)
    VALUES (test_lead_id, 'ask_question', 'pending', '{"question": "test"}');

    -- Assert: Success
    RAISE NOTICE '✅ PASS: status accepts valid value (pending)';

    -- Cleanup
    DELETE FROM telegram.client_tasks WHERE lead_id = test_lead_id;
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 2.6: status CHECK constraint (negative case)
-- ARRANGE: Insert test lead
-- ACT: Try to insert invalid status
-- ASSERT: Should fail with check_violation
DO $$
DECLARE
    test_lead_id INT;
BEGIN
    -- Arrange: Create test lead
    INSERT INTO intake_staging.leads (id, chat_id, phone, case_type, case_data)
    VALUES (-4, 'test_lead_4', '555-0004', 'trabalhista', '{}')
    RETURNING id INTO test_lead_id;

    -- Act: Try invalid status
    BEGIN
        INSERT INTO telegram.client_tasks (lead_id, task_type, status, task_data)
        VALUES (test_lead_id, 'ask_question', 'wrong_status', '{"question": "test"}');

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: status constraint did not reject invalid value';
    EXCEPTION WHEN check_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: status constraint rejects invalid value';
    END;

    -- Cleanup
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 2.7: role CHECK constraint (positive case)
-- ARRANGE: None needed
-- ACT: Insert valid role
-- ASSERT: Should succeed
DO $$
BEGIN
    -- Act: Insert with valid role (using actual column name telegram_user_id)
    INSERT INTO telegram.user_permissions (telegram_user_id, role)
    VALUES (-1, 'admin');

    -- Assert: Success
    RAISE NOTICE '✅ PASS: role accepts valid value (admin)';

    -- Cleanup
    DELETE FROM telegram.user_permissions WHERE telegram_user_id = -1;
END $$;

-- Test 2.8: role CHECK constraint (negative case)
-- ARRANGE: None needed
-- ACT: Try to insert invalid role
-- ASSERT: Should fail with check_violation
DO $$
BEGIN
    -- Act: Try invalid role
    BEGIN
        INSERT INTO telegram.user_permissions (telegram_user_id, role)
        VALUES (-2, 'bad_role');

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: role constraint did not reject invalid value';
    EXCEPTION WHEN check_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: role constraint rejects invalid value';
    END;
END $$;

-- Test 2.9: Foreign key validation (lead_id)
-- ARRANGE: None needed
-- ACT: Try to insert task with non-existent lead_id
-- ASSERT: Should fail with foreign_key_violation
DO $$
BEGIN
    BEGIN
        INSERT INTO telegram.client_tasks (lead_id, task_type, task_data)
        VALUES (999999, 'ask_question', '{"question": "test"}');

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: Foreign key constraint not working for client_tasks.lead_id';
    EXCEPTION WHEN foreign_key_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: Foreign key constraint works for client_tasks.lead_id';
    END;
END $$;

\echo '✅ telegram schema tests passed!'

-- ============================================================================
-- TEST SUITE 3: KNOWLEDGE SCHEMA
-- ============================================================================
\echo ''
\echo '🧪 Testing knowledge schema...'

-- Test 3.1: All knowledge tables exist
-- ARRANGE: Check pg_tables catalog
-- ACT: Query for each expected table
-- ASSERT: All tables must exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'knowledge' AND tablename = 'conversations') THEN
        RAISE EXCEPTION 'FAIL: knowledge.conversations not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'knowledge' AND tablename = 'clients') THEN
        RAISE EXCEPTION 'FAIL: knowledge.clients not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'knowledge' AND tablename = 'documents') THEN
        RAISE EXCEPTION 'FAIL: knowledge.documents not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'knowledge' AND tablename = 'faq') THEN
        RAISE EXCEPTION 'FAIL: knowledge.faq not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'knowledge' AND tablename = 'session_context') THEN
        RAISE EXCEPTION 'FAIL: knowledge.session_context not created';
    END IF;

    RAISE NOTICE '✅ PASS: All knowledge tables created';
END $$;

-- Test 3.2: client_type CHECK constraint (positive case)
-- ARRANGE: None needed
-- ACT: Insert valid client_type
-- ASSERT: Should succeed
DO $$
BEGIN
    -- Act: Insert with valid client_type (actual values: new, returning, vip)
    INSERT INTO knowledge.clients (chat_id, client_type)
    VALUES ('test_client_1', 'new');

    -- Assert: Success
    RAISE NOTICE '✅ PASS: client_type accepts valid value (new)';

    -- Cleanup
    DELETE FROM knowledge.clients WHERE chat_id = 'test_client_1';
END $$;

-- Test 3.3: client_type CHECK constraint (negative case)
-- ARRANGE: None needed
-- ACT: Try to insert invalid client_type
-- ASSERT: Should fail with check_violation
DO $$
BEGIN
    BEGIN
        INSERT INTO knowledge.clients (chat_id, client_type)
        VALUES ('test_client_2', 'invalid_type');

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: client_type constraint not working';
    EXCEPTION WHEN check_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: client_type constraint works';
    END;
END $$;

\echo '✅ Knowledge schema tests passed!'

-- ============================================================================
-- TEST SUITE 4: INTAKE_STAGING SCHEMA
-- ============================================================================
\echo ''
\echo '🧪 Testing intake_staging schema...'

-- Test 4.1: All intake_staging tables exist
-- ARRANGE: Check pg_tables catalog
-- ACT: Query for each expected table
-- ASSERT: All tables must exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'intake_staging' AND tablename = 'leads') THEN
        RAISE EXCEPTION 'FAIL: intake_staging.leads not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'intake_staging' AND tablename = 'lead_documents') THEN
        RAISE EXCEPTION 'FAIL: intake_staging.lead_documents not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'intake_staging' AND tablename = 'lawapp_sync_queue') THEN
        RAISE EXCEPTION 'FAIL: intake_staging.lawapp_sync_queue not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'intake_staging' AND tablename = 'document_reminders') THEN
        RAISE EXCEPTION 'FAIL: intake_staging.document_reminders not created';
    END IF;

    RAISE NOTICE '✅ PASS: All intake_staging tables created';
END $$;

-- Test 4.2: Foreign key constraint validation
-- ARRANGE: None needed
-- ACT: Try to insert document with non-existent lead_id
-- ASSERT: Should fail with foreign_key_violation
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.lead_documents (lead_id, document_type, storage_path)
        VALUES (999999, 'rg', '/fake/path');

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: Foreign key constraint not working';
    EXCEPTION WHEN foreign_key_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: Foreign key constraint works';
    END;
END $$;

\echo '✅ intake_staging schema tests passed!'

-- ============================================================================
-- TEST SUITE 5: BOT_CONFIG SCHEMA
-- ============================================================================
\echo ''
\echo '🧪 Testing bot_config schema...'

-- Test 5.1: All bot_config tables exist
-- ARRANGE: Check pg_tables catalog
-- ACT: Query for each expected table
-- ASSERT: All tables must exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'bot_config' AND tablename = 'auto_answer_rules') THEN
        RAISE EXCEPTION 'FAIL: bot_config.auto_answer_rules not created';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'bot_config' AND tablename = 'cron_jobs') THEN
        RAISE EXCEPTION 'FAIL: bot_config.cron_jobs not created';
    END IF;

    RAISE NOTICE '✅ PASS: All bot_config tables created';
END $$;

-- Test 5.2: frequency_seconds CHECK constraint (positive case)
-- ARRANGE: None needed
-- ACT: Insert valid frequency_seconds
-- ASSERT: Should succeed
DO $$
BEGIN
    -- Act: Insert with valid frequency_seconds
    INSERT INTO bot_config.cron_jobs (id, name, frequency_seconds)
    VALUES ('test_job_1', 'Test Job 1', 60);

    -- Assert: Success
    RAISE NOTICE '✅ PASS: frequency_seconds accepts valid value (60)';

    -- Cleanup
    DELETE FROM bot_config.cron_jobs WHERE id = 'test_job_1';
END $$;

-- Test 5.3: frequency_seconds CHECK constraint (negative case)
-- ARRANGE: None needed
-- ACT: Try to insert negative frequency_seconds
-- ASSERT: Should fail with check_violation
DO $$
BEGIN
    BEGIN
        INSERT INTO bot_config.cron_jobs (id, name, frequency_seconds)
        VALUES ('test_job_2', 'Test Job 2', -1);

        -- Should not reach here
        RAISE EXCEPTION 'FAIL: frequency_seconds constraint not working';
    EXCEPTION WHEN check_violation THEN
        -- Assert: Expected exception
        RAISE NOTICE '✅ PASS: frequency_seconds constraint works';
    END;
END $$;

\echo '✅ bot_config schema tests passed!'

-- ============================================================================
-- TEARDOWN / CLEANUP PHASE
-- ============================================================================
\echo ''
\echo '🧹 Cleaning up test data...'

DO $$
BEGIN
    -- Clean telegram test data
    DELETE FROM telegram.topic_context WHERE lead_id < 0;
    DELETE FROM telegram.client_tasks WHERE lead_id < 0;
    DELETE FROM telegram.lead_topics WHERE lead_id < 0;
    DELETE FROM telegram.user_permissions WHERE telegram_user_id < 0;

    -- Clean intake_staging test data
    DELETE FROM intake_staging.lead_documents WHERE lead_id < 0;
    DELETE FROM intake_staging.leads WHERE id < 0;

    -- Clean knowledge test data
    DELETE FROM knowledge.clients WHERE chat_id LIKE 'test_%';

    -- Clean bot_config test data
    DELETE FROM bot_config.cron_jobs WHERE id LIKE 'test_%';

    RAISE NOTICE '✅ Cleanup complete';
END $$;

\echo ''
\echo '🎉 ====================================='
\echo '🎉 ALL SCHEMA TESTS PASSED SUCCESSFULLY'
\echo '🎉 ====================================='
