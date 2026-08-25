-- database/tests/test_performance_improvements.sql
-- Test indexes, triggers, and performance optimizations

\echo '🧪 Testing composite indexes...'

-- Test 1: Composite index for chat history exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'knowledge'
        AND tablename = 'conversations'
        AND indexname = 'idx_conversations_chat_timestamp_desc'
    ) THEN
        RAISE EXCEPTION 'FAIL: idx_conversations_chat_timestamp_desc not created';
    END IF;
    RAISE NOTICE '✅ PASS: Composite index idx_conversations_chat_timestamp_desc exists';
END $$;

\echo '✅ Composite index tests passed!'

-- Test GIN indexes
\echo '🧪 Testing GIN indexes for JSONB...'

-- Test 2: GIN index for case_data exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'leads'
        AND indexname = 'idx_leads_case_data_gin'
    ) THEN
        RAISE EXCEPTION 'FAIL: idx_leads_case_data_gin not created';
    END IF;
    RAISE NOTICE '✅ PASS: GIN index idx_leads_case_data_gin exists';
END $$;

-- Test 3: GIN index works for JSONB queries
DO $$
BEGIN
    -- Insert test data
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data)
    VALUES ('test_gin', 'aposentadoria', '{"age": 65, "work_duration": 35}'::jsonb);

    -- Query using JSONB operator (should use GIN index)
    IF NOT EXISTS (
        SELECT 1 FROM intake_staging.leads
        WHERE case_data @> '{"age": 65}'::jsonb
        AND chat_id = 'test_gin'
    ) THEN
        RAISE EXCEPTION 'FAIL: GIN index query failed';
    END IF;

    DELETE FROM intake_staging.leads WHERE chat_id = 'test_gin';
    RAISE NOTICE '✅ PASS: GIN index query works';
END $$;

\echo '✅ GIN index tests passed!'

-- Test updated_at triggers
\echo '🧪 Testing updated_at triggers...'

-- Test 4: Trigger function exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc
        WHERE proname = 'update_updated_at_column'
    ) THEN
        RAISE EXCEPTION 'FAIL: update_updated_at_column function not created';
    END IF;
    RAISE NOTICE '✅ PASS: update_updated_at_column function exists';
END $$;

-- Test 5: Trigger automatically updates updated_at
DO $$
DECLARE
    old_updated_at TIMESTAMP;
    new_updated_at TIMESTAMP;
BEGIN
    -- Insert test lead
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data)
    VALUES ('test_trigger', 'aposentadoria', '{}'::jsonb)
    RETURNING updated_at INTO old_updated_at;

    -- Wait 1 second
    PERFORM pg_sleep(1);

    -- Update the lead
    UPDATE intake_staging.leads SET case_type = 'auxilio_doenca'
    WHERE chat_id = 'test_trigger'
    RETURNING updated_at INTO new_updated_at;

    -- Check that updated_at changed
    IF new_updated_at <= old_updated_at THEN
        RAISE EXCEPTION 'FAIL: updated_at not automatically updated (old: %, new: %)', old_updated_at, new_updated_at;
    END IF;

    DELETE FROM intake_staging.leads WHERE chat_id = 'test_trigger';
    RAISE NOTICE '✅ PASS: Trigger automatically updates updated_at';
END $$;

\echo '✅ Trigger tests passed!'

-- Test ON UPDATE CASCADE
\echo '🧪 Testing ON UPDATE CASCADE...'

-- Test 6: Foreign key has ON UPDATE CASCADE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.referential_constraints rc
        JOIN information_schema.key_column_usage kcu
        ON rc.constraint_name = kcu.constraint_name
        WHERE kcu.table_schema = 'knowledge'
        AND kcu.table_name = 'documents'
        AND kcu.column_name = 'client_id'
        AND rc.update_rule = 'CASCADE'
    ) THEN
        RAISE EXCEPTION 'FAIL: ON UPDATE CASCADE not configured on documents.client_id';
    END IF;
    RAISE NOTICE '✅ PASS: ON UPDATE CASCADE configured on documents.client_id';
END $$;

\echo '✅ ON UPDATE CASCADE tests passed!'
