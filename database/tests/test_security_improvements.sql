-- database/tests/test_security_improvements.sql
-- Test RLS, input validation, and security constraints

\echo '🧪 Testing Row-Level Security...'

-- Test 1: RLS is enabled
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables t
        JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
        WHERE t.schemaname = 'knowledge' AND t.tablename = 'conversations' AND c.relrowsecurity = true
    ) THEN
        RAISE EXCEPTION 'FAIL: RLS not enabled on knowledge.conversations';
    END IF;
    RAISE NOTICE '✅ PASS: RLS enabled on knowledge.conversations';
END $$;

\echo '✅ RLS tests passed!'

-- Test input validation
\echo '🧪 Testing input validation...'

-- Test 2: Message text length limit
DO $$
BEGIN
    BEGIN
        INSERT INTO knowledge.conversations (chat_id, message_id, message_text)
        VALUES ('test', 'test1', repeat('x', 50001));
        RAISE EXCEPTION 'FAIL: Message text length constraint not working';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Message text length constraint works';
    END;
END $$;

-- Test 3: Email validation (reject invalid)
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
        VALUES ('test', 'aposentadoria', '{}'::jsonb, 'a@b.c');
        RAISE EXCEPTION 'FAIL: Email validation too permissive';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Email validation rejects invalid emails';
    END;
END $$;

-- Test 4: Email validation (accept valid)
DO $$
BEGIN
    INSERT INTO intake_staging.leads (chat_id, case_type, case_data, email)
    VALUES ('test_email_valid', 'aposentadoria', '{}'::jsonb, 'valid@example.com');
    DELETE FROM intake_staging.leads WHERE chat_id = 'test_email_valid';
    RAISE NOTICE '✅ PASS: Email validation accepts valid emails';
END $$;

-- Test 5: Phone format validation
DO $$
BEGIN
    BEGIN
        INSERT INTO knowledge.clients (chat_id, phone)
        VALUES ('test', 'invalid phone!');
        RAISE EXCEPTION 'FAIL: Phone format validation not working';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Phone format validation works';
    END;
END $$;

-- Test 6: CPF uniqueness (allows multiple NULLs)
DO $$
BEGIN
    INSERT INTO knowledge.clients (chat_id, cpf) VALUES ('test1', NULL);
    INSERT INTO knowledge.clients (chat_id, cpf) VALUES ('test2', NULL);
    DELETE FROM knowledge.clients WHERE chat_id IN ('test1', 'test2');
    RAISE NOTICE '✅ PASS: CPF uniqueness allows multiple NULLs';
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'FAIL: CPF uniqueness constraint rejects multiple NULLs';
END $$;

-- Test 7: CPF uniqueness (rejects duplicates)
DO $$
BEGIN
    INSERT INTO knowledge.clients (chat_id, cpf) VALUES ('test1', '12345678901');
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf) VALUES ('test2', '12345678901');
        RAISE EXCEPTION 'FAIL: CPF uniqueness allows duplicates';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE '✅ PASS: CPF uniqueness rejects duplicates';
    END;
    DELETE FROM knowledge.clients WHERE cpf = '12345678901';
END $$;

\echo '✅ All input validation tests passed!'
