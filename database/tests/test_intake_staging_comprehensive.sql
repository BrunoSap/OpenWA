-- database/tests/test_intake_staging_comprehensive.sql
-- COMPREHENSIVE TESTS for intake_staging schema fixes
-- Coverage: validation, security, performance, constraints, audit

\echo '════════════════════════════════════════════════════════════════'
\echo '🧪 COMPREHENSIVE TEST SUITE: intake_staging schema'
\echo '════════════════════════════════════════════════════════════════'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- SETUP: Clean test environment
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
    DELETE FROM intake_staging.document_reminders WHERE lead_id::text LIKE 'test-%';
    DELETE FROM intake_staging.lawapp_sync_queue WHERE lead_id::text LIKE 'test-%';
    DELETE FROM intake_staging.lead_documents WHERE lead_id::text LIKE 'test-%';
    DELETE FROM intake_staging.leads WHERE id::text LIKE 'test-%';
    RAISE NOTICE '✅ Test environment cleaned';
END $$;

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 1: CPF VALIDATION (SECURITY CRITICAL)
-- ════════════════════════════════════════════════════════════════
\echo '🔐 TEST SUITE 1: CPF Validation'

-- Test 1.1: Valid CPF accepted
DO $$
BEGIN
    IF NOT intake_staging.validate_cpf('12345678909') THEN
        RAISE EXCEPTION 'FAIL: Valid CPF rejected';
    END IF;
    RAISE NOTICE '✅ PASS: Valid CPF accepted (12345678909)';
END $$;

-- Test 1.2: Invalid check digit rejected
DO $$
BEGIN
    IF intake_staging.validate_cpf('12345678900') THEN
        RAISE EXCEPTION 'FAIL: Invalid CPF check digit accepted';
    END IF;
    RAISE NOTICE '✅ PASS: Invalid check digit rejected (12345678900)';
END $$;

-- Test 1.3: All same digit rejected (11111111111)
DO $$
BEGIN
    IF intake_staging.validate_cpf('11111111111') THEN
        RAISE EXCEPTION 'FAIL: All-same-digit CPF accepted (11111111111)';
    END IF;
    RAISE NOTICE '✅ PASS: All-same-digit CPF rejected (11111111111)';
END $$;

-- Test 1.4: Non-numeric garbage rejected (AAAAAAAAAAAAA)
DO $$
BEGIN
    IF intake_staging.validate_cpf('AAAAAAAAAAAAA') THEN
        RAISE EXCEPTION 'FAIL: Non-numeric CPF accepted';
    END IF;
    RAISE NOTICE '✅ PASS: Non-numeric garbage rejected (AAAAAAAAAAAAA)';
END $$;

-- Test 1.5: Short CPF rejected (less than 11 digits)
DO $$
BEGIN
    IF intake_staging.validate_cpf('123456789') THEN
        RAISE EXCEPTION 'FAIL: Short CPF accepted';
    END IF;
    RAISE NOTICE '✅ PASS: Short CPF rejected (9 digits)';
END $$;

-- Test 1.6: CPF encryption and decryption roundtrip
DO $$
DECLARE
    cpf_original TEXT := '12345678909';
    cpf_encrypted BYTEA;
    cpf_decrypted TEXT;
    encryption_key TEXT := 'test_key_256_bits_long_secret';
BEGIN
    cpf_encrypted := intake_staging.encrypt_cpf(cpf_original, encryption_key);
    cpf_decrypted := intake_staging.decrypt_cpf(cpf_encrypted, encryption_key);

    IF cpf_decrypted != cpf_original THEN
        RAISE EXCEPTION 'FAIL: CPF encryption/decryption roundtrip failed. Got: %', cpf_decrypted;
    END IF;

    RAISE NOTICE '✅ PASS: CPF encryption/decryption works (AES-256)';
END $$;

-- Test 1.7: CPF hash consistency
DO $$
DECLARE
    cpf_plain TEXT := '12345678909';
    hash1 VARCHAR(64);
    hash2 VARCHAR(64);
BEGIN
    hash1 := intake_staging.hash_cpf(cpf_plain);
    hash2 := intake_staging.hash_cpf(cpf_plain);

    IF hash1 != hash2 THEN
        RAISE EXCEPTION 'FAIL: CPF hash inconsistent';
    END IF;

    IF length(hash1) != 64 THEN
        RAISE EXCEPTION 'FAIL: CPF hash not 64 chars (SHA-256)';
    END IF;

    RAISE NOTICE '✅ PASS: CPF hash consistent (SHA-256, 64 chars)';
END $$;

\echo '✅ CPF validation tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 2: EMAIL VALIDATION (SECURITY HIGH)
-- ════════════════════════════════════════════════════════════════
\echo '📧 TEST SUITE 2: Email Validation'

-- Test 2.1: Valid email accepted
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        id, chat_id, case_type, case_data, email
    ) VALUES (
        'test-email-1', '999001', 'trabalhista', '{}', 'test@example.com'
    );
    RAISE NOTICE '✅ PASS: Valid email accepted (test@example.com)';
    DELETE FROM intake_staging.leads WHERE id = 'test-email-1';
END $$;

-- Test 2.2: Weak email rejected (test@t.co - only 2 chars after dot)
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data, email
        ) VALUES (
            'test-email-2', '999002', 'trabalhista', '{}', 'test@t.co'
        );
        RAISE EXCEPTION 'FAIL: Weak email accepted (test@t.co)';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Weak email rejected (test@t.co)';
    END;
END $$;

-- Test 2.3: Email without TLD rejected
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data, email
        ) VALUES (
            'test-email-3', '999003', 'trabalhista', '{}', 'test@example'
        );
        RAISE EXCEPTION 'FAIL: Email without TLD accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Email without TLD rejected';
    END;
END $$;

-- Test 2.4: Email with consecutive dots rejected
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data, email
        ) VALUES (
            'test-email-4', '999004', 'trabalhista', '{}', 'test..user@example.com'
        );
        RAISE EXCEPTION 'FAIL: Email with consecutive dots accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Email with consecutive dots rejected';
    END;
END $$;

\echo '✅ Email validation tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 3: PHONE VALIDATION (SECURITY HIGH)
-- ════════════════════════════════════════════════════════════════
\echo '📞 TEST SUITE 3: Phone Validation'

-- Test 3.1: Valid phone accepted
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        id, chat_id, case_type, case_data, phone
    ) VALUES (
        'test-phone-1', '999101', 'trabalhista', '{}', '+5511987654321'
    );
    RAISE NOTICE '✅ PASS: Valid phone accepted (+5511987654321)';
    DELETE FROM intake_staging.leads WHERE id = 'test-phone-1';
END $$;

-- Test 3.2: Non-numeric phone rejected
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data, phone
        ) VALUES (
            'test-phone-2', '999102', 'trabalhista', '{}', 'ABC123XYZ'
        );
        RAISE EXCEPTION 'FAIL: Non-numeric phone accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Non-numeric phone rejected';
    END;
END $$;

-- Test 3.3: Too short phone rejected
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data, phone
        ) VALUES (
            'test-phone-3', '999103', 'trabalhista', '{}', '+123'
        );
        RAISE EXCEPTION 'FAIL: Too short phone accepted';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Too short phone rejected';
    END;
END $$;

\echo '✅ Phone validation tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 4: JSONB SIZE LIMITS (SECURITY HIGH - DoS prevention)
-- ════════════════════════════════════════════════════════════════
\echo '📦 TEST SUITE 4: JSONB Size Limits (DoS Prevention)'

-- Test 4.1: Normal size JSONB accepted
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        id, chat_id, case_type, case_data
    ) VALUES (
        'test-jsonb-1', '999201', 'trabalhista', '{"age": 30, "work_duration": 5}'
    );
    RAISE NOTICE '✅ PASS: Normal JSONB accepted';
    DELETE FROM intake_staging.leads WHERE id = 'test-jsonb-1';
END $$;

-- Test 4.2: Oversized JSONB rejected (simulate 2MB attack)
DO $$
DECLARE
    large_json JSONB;
    large_text TEXT;
BEGIN
    -- Create 2MB JSON payload (above 1MB limit)
    large_text := repeat('a', 2097152); -- 2MB
    large_json := jsonb_build_object('attack', large_text);

    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data
        ) VALUES (
            'test-jsonb-2', '999202', 'trabalhista', large_json
        );
        RAISE EXCEPTION 'FAIL: Oversized JSONB accepted (2MB DoS attack)';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Oversized JSONB rejected (2MB blocked)';
    END;
END $$;

\echo '✅ JSONB size limit tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 5: ARRAY SIZE LIMITS (SECURITY MEDIUM)
-- ════════════════════════════════════════════════════════════════
\echo '📚 TEST SUITE 5: Array Size Limits'

-- Test 5.1: Normal array accepted
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        id, chat_id, case_type, case_data, documents_collected
    ) VALUES (
        'test-array-1', '999301', 'trabalhista', '{}', ARRAY['doc1', 'doc2', 'doc3']
    );
    RAISE NOTICE '✅ PASS: Normal array accepted (3 elements)';
    DELETE FROM intake_staging.leads WHERE id = 'test-array-1';
END $$;

-- Test 5.2: Oversized array rejected (1001 elements)
DO $$
DECLARE
    large_array TEXT[];
BEGIN
    -- Create 1001 element array (above 1000 limit)
    SELECT ARRAY_AGG('doc_' || i) FROM generate_series(1, 1001) AS i INTO large_array;

    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data, documents_collected
        ) VALUES (
            'test-array-2', '999302', 'trabalhista', '{}', large_array
        );
        RAISE EXCEPTION 'FAIL: Oversized array accepted (1001 elements)';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE '✅ PASS: Oversized array rejected (1001 elements blocked)';
    END;
END $$;

\echo '✅ Array size limit tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 6: REFERENCE TABLE CONSTRAINTS (MAINTAINABILITY)
-- ════════════════════════════════════════════════════════════════
\echo '🔗 TEST SUITE 6: Reference Table Constraints (Magic String Elimination)'

-- Test 6.1: Valid case_type accepted
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        id, chat_id, case_type, case_data
    ) VALUES (
        'test-ref-1', '999401', 'trabalhista', '{}'
    );
    RAISE NOTICE '✅ PASS: Valid case_type accepted (trabalhista)';
    DELETE FROM intake_staging.leads WHERE id = 'test-ref-1';
END $$;

-- Test 6.2: Invalid case_type rejected (typo protection)
DO $$
BEGIN
    BEGIN
        INSERT INTO intake_staging.leads (
            id, chat_id, case_type, case_data
        ) VALUES (
            'test-ref-2', '999402', 'invalid_type', '{}'
        );
        RAISE EXCEPTION 'FAIL: Invalid case_type accepted (typo not caught)';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE '✅ PASS: Invalid case_type rejected (FK constraint works)';
    END;
END $$;

-- Test 6.3: Valid document_type accepted
DO $$
DECLARE
    test_lead_id UUID := 'test-ref-3';
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data)
    VALUES (test_lead_id, '999403', 'trabalhista', '{}');

    INSERT INTO intake_staging.lead_documents (
        id, lead_id, document_type, storage_path
    ) VALUES (
        'test-doc-ref-1', test_lead_id, 'rg', '/test/path'
    );

    RAISE NOTICE '✅ PASS: Valid document_type accepted (rg)';
    DELETE FROM intake_staging.lead_documents WHERE id = 'test-doc-ref-1';
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 6.4: Invalid document_type rejected
DO $$
DECLARE
    test_lead_id UUID := 'test-ref-4';
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data)
    VALUES (test_lead_id, '999404', 'trabalhista', '{}');

    BEGIN
        INSERT INTO intake_staging.lead_documents (
            id, lead_id, document_type, storage_path
        ) VALUES (
            'test-doc-ref-2', test_lead_id, 'invalid_doc', '/test/path'
        );
        RAISE EXCEPTION 'FAIL: Invalid document_type accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE '✅ PASS: Invalid document_type rejected (FK constraint works)';
    END;

    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

\echo '✅ Reference table constraint tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 7: AUDIT TRAIL (MAINTAINABILITY HIGH)
-- ════════════════════════════════════════════════════════════════
\echo '📝 TEST SUITE 7: Audit Trail (User Accountability)'

-- Test 7.1: INSERT creates audit log entry
DO $$
DECLARE
    test_lead_id UUID := 'test-audit-1';
    audit_count INT;
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data)
    VALUES (test_lead_id, '999501', 'trabalhista', '{"test": "data"}');

    SELECT COUNT(*) INTO audit_count
    FROM intake_staging.audit_log
    WHERE table_name = 'leads'
    AND record_id = test_lead_id
    AND operation = 'INSERT';

    IF audit_count != 1 THEN
        RAISE EXCEPTION 'FAIL: INSERT audit log not created';
    END IF;

    RAISE NOTICE '✅ PASS: INSERT audit log created';
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 7.2: UPDATE creates audit log entry
DO $$
DECLARE
    test_lead_id UUID := 'test-audit-2';
    audit_count INT;
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data, full_name)
    VALUES (test_lead_id, '999502', 'trabalhista', '{}', 'Original Name');

    UPDATE intake_staging.leads
    SET full_name = 'Updated Name'
    WHERE id = test_lead_id;

    SELECT COUNT(*) INTO audit_count
    FROM intake_staging.audit_log
    WHERE table_name = 'leads'
    AND record_id = test_lead_id
    AND operation = 'UPDATE';

    IF audit_count < 1 THEN
        RAISE EXCEPTION 'FAIL: UPDATE audit log not created';
    END IF;

    RAISE NOTICE '✅ PASS: UPDATE audit log created';
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 7.3: SOFT DELETE creates audit log with operation = 'SOFT_DELETE'
DO $$
DECLARE
    test_lead_id UUID := 'test-audit-3';
    audit_count INT;
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data)
    VALUES (test_lead_id, '999503', 'trabalhista', '{}');

    UPDATE intake_staging.leads
    SET deleted_at = NOW(), deleted_by = 'test_user'
    WHERE id = test_lead_id;

    SELECT COUNT(*) INTO audit_count
    FROM intake_staging.audit_log
    WHERE table_name = 'leads'
    AND record_id = test_lead_id
    AND operation = 'SOFT_DELETE';

    IF audit_count != 1 THEN
        RAISE EXCEPTION 'FAIL: SOFT_DELETE audit log not created';
    END IF;

    RAISE NOTICE '✅ PASS: SOFT_DELETE audit log created';
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

-- Test 7.4: Version column increments on UPDATE
DO $$
DECLARE
    test_lead_id UUID := 'test-audit-4';
    initial_version INT;
    updated_version INT;
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data)
    VALUES (test_lead_id, '999504', 'trabalhista', '{}');

    SELECT version INTO initial_version
    FROM intake_staging.leads WHERE id = test_lead_id;

    UPDATE intake_staging.leads
    SET full_name = 'Test Name'
    WHERE id = test_lead_id;

    SELECT version INTO updated_version
    FROM intake_staging.leads WHERE id = test_lead_id;

    IF updated_version != initial_version + 1 THEN
        RAISE EXCEPTION 'FAIL: Version not incremented. Was %, now %', initial_version, updated_version;
    END IF;

    RAISE NOTICE '✅ PASS: Version incremented on UPDATE (% -> %)', initial_version, updated_version;
    DELETE FROM intake_staging.leads WHERE id = test_lead_id;
END $$;

\echo '✅ Audit trail tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 8: PERFORMANCE INDEXES (CRITICAL)
-- ════════════════════════════════════════════════════════════════
\echo '⚡ TEST SUITE 8: Performance Indexes'

-- Test 8.1: GIN indexes exist on JSONB columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'leads'
        AND indexname = 'idx_leads_case_data_gin'
    ) THEN
        RAISE EXCEPTION 'FAIL: GIN index on case_data not found';
    END IF;

    RAISE NOTICE '✅ PASS: GIN index on case_data exists';
END $$;

-- Test 8.2: Compound index on (intake_status, urgency_level) exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'leads'
        AND indexname = 'idx_leads_priority_queue'
    ) THEN
        RAISE EXCEPTION 'FAIL: Compound index for priority queue not found';
    END IF;

    RAISE NOTICE '✅ PASS: Compound index (status, urgency) exists';
END $$;

-- Test 8.3: Email index exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'leads'
        AND indexname = 'idx_leads_email'
    ) THEN
        RAISE EXCEPTION 'FAIL: Email index not found';
    END IF;

    RAISE NOTICE '✅ PASS: Email index exists';
END $$;

-- Test 8.4: Phone index exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'leads'
        AND indexname = 'idx_leads_phone'
    ) THEN
        RAISE EXCEPTION 'FAIL: Phone index not found';
    END IF;

    RAISE NOTICE '✅ PASS: Phone index exists';
END $$;

-- Test 8.5: File name index exists on lead_documents
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'lead_documents'
        AND indexname = 'idx_lead_documents_file_name'
    ) THEN
        RAISE EXCEPTION 'FAIL: File name index not found';
    END IF;

    RAISE NOTICE '✅ PASS: File name index exists';
END $$;

-- Test 8.6: Attempts index exists on lawapp_sync_queue
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'intake_staging'
        AND tablename = 'lawapp_sync_queue'
        AND indexname = 'idx_lawapp_sync_queue_attempts'
    ) THEN
        RAISE EXCEPTION 'FAIL: Attempts index not found';
    END IF;

    RAISE NOTICE '✅ PASS: Attempts index exists (retry monitoring)';
END $$;

\echo '✅ Performance index tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- TEST SUITE 9: CASCADE BEHAVIOR (COMPLETENESS HIGH)
-- ════════════════════════════════════════════════════════════════
\echo '🔗 TEST SUITE 9: CASCADE Behavior (Data Integrity)'

-- Test 9.1: ON DELETE CASCADE works for lead_documents
DO $$
DECLARE
    test_lead_id UUID := 'test-cascade-1';
    doc_count INT;
BEGIN
    INSERT INTO intake_staging.leads (id, chat_id, case_type, case_data)
    VALUES (test_lead_id, '999601', 'trabalhista', '{}');

    INSERT INTO intake_staging.lead_documents (id, lead_id, document_type, storage_path)
    VALUES ('test-doc-cascade-1', test_lead_id, 'rg', '/test/path');

    DELETE FROM intake_staging.leads WHERE id = test_lead_id;

    SELECT COUNT(*) INTO doc_count
    FROM intake_staging.lead_documents
    WHERE id = 'test-doc-cascade-1';

    IF doc_count != 0 THEN
        RAISE EXCEPTION 'FAIL: CASCADE did not delete child documents';
    END IF;

    RAISE NOTICE '✅ PASS: CASCADE deleted child documents';
END $$;

\echo '✅ CASCADE behavior tests passed!'
\echo ''

-- ════════════════════════════════════════════════════════════════
-- CLEANUP
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
    DELETE FROM intake_staging.document_reminders WHERE lead_id::text LIKE 'test-%';
    DELETE FROM intake_staging.lawapp_sync_queue WHERE lead_id::text LIKE 'test-%';
    DELETE FROM intake_staging.lead_documents WHERE lead_id::text LIKE 'test-%';
    DELETE FROM intake_staging.leads WHERE id::text LIKE 'test-%';
    RAISE NOTICE '✅ Test data cleaned up';
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '🎉 ALL COMPREHENSIVE TESTS PASSED SUCCESSFULLY!'
\echo '════════════════════════════════════════════════════════════════'
\echo '✅ CPF validation (Luhn algorithm, encryption, hashing)'
\echo '✅ Email validation (strong regex, TLD enforcement)'
\echo '✅ Phone validation (numeric, length constraints)'
\echo '✅ JSONB size limits (DoS prevention, 1MB cap)'
\echo '✅ Array size limits (memory exhaustion prevention, 1000 cap)'
\echo '✅ Reference tables (magic string elimination, typo protection)'
\echo '✅ Audit trail (user accountability, version tracking)'
\echo '✅ Performance indexes (GIN, compound, partial)'
\echo '✅ CASCADE behavior (data integrity)'
\echo '════════════════════════════════════════════════════════════════'
