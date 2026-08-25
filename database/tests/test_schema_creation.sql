-- database/tests/test_schema_creation.sql
-- Test pgvector installation

\echo '🧪 Testing pgvector installation...'

-- Test 1: Extension exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
    ) THEN
        RAISE EXCEPTION 'FAIL: pgvector extension not installed';
    END IF;
    RAISE NOTICE '✅ PASS: pgvector extension installed';
END $$;

-- Test 2: Can create vector column
DO $$
BEGIN
    CREATE TEMP TABLE test_vector (
        id SERIAL PRIMARY KEY,
        embedding VECTOR(1536)
    );
    DROP TABLE test_vector;
    RAISE NOTICE '✅ PASS: VECTOR(1536) type works';
END $$;

-- Test 3: Can use vector operators
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

-- Test telegram schema
\echo '🧪 Testing telegram schema...'

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

\echo '✅ telegram schema tests passed!'

-- Test knowledge schema
\echo '🧪 Testing knowledge schema...'

DO $$
BEGIN
    -- Test tables exist
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

-- Test constraints
DO $$
BEGIN
    -- Test clients constraint (should fail)
    BEGIN
        INSERT INTO knowledge.clients (chat_id, client_type) VALUES ('test', 'invalid_type');
        RAISE EXCEPTION 'FAIL: client_type constraint not working';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: client_type constraint works';
    END;
END $$;

\echo '✅ Knowledge schema tests passed!'

-- Test intake_staging schema
\echo '🧪 Testing intake_staging schema...'

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

-- Test foreign key constraint
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.lead_documents (lead_id, document_type, storage_path)
        VALUES (999999, 'rg', '/fake/path');
        RAISE EXCEPTION 'FAIL: Foreign key constraint not working';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE '✅ PASS: Foreign key constraint works';
    END;
END $$;

\echo '✅ intake_staging schema tests passed!'

-- Test telegram schema
\echo '🧪 Testing telegram schema...'

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

\echo '✅ telegram schema tests passed!'

-- Test bot_config schema
\echo '🧪 Testing bot_config schema...'

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

-- Test constraint
DO $$
BEGIN
    BEGIN
        INSERT INTO bot_config.cron_jobs (id, name, frequency_seconds)
        VALUES ('test', 'Test Job', -1);
        RAISE EXCEPTION 'FAIL: frequency_seconds constraint not working';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: frequency_seconds constraint works';
    END;
END $$;

\echo '✅ bot_config schema tests passed!'
