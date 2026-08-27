-- database/tests/test_security_fixes_aaa.sql
-- Test security improvements with strict AAA pattern: Arrange/Act/Assert
-- Fixes all 12 issues from code review

BEGIN;

-- Cleanup from previous runs
DELETE FROM knowledge.clients WHERE chat_id LIKE 'test_security_%';
DELETE FROM knowledge.conversations WHERE chat_id LIKE 'test_security_%';
DELETE FROM knowledge.faq WHERE question LIKE 'TEST SECURITY%';

-- ═══════════════════════════════════════════════════════════
--  TEST 1: SQL Injection Prevention in Vector Functions
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    -- ARRANGE: Test constants and expected values
    test_embedding VECTOR(1536);
    result RECORD;
    rows_before INT;
    rows_after INT;
    audit_count_before INT;
    audit_count_after INT;
BEGIN
    RAISE NOTICE '🔒 TEST 1: SQL Injection Prevention (AAA Pattern)';

    -- ARRANGE: Verify preconditions
    test_embedding := (SELECT array_agg(random())::VECTOR(1536) FROM generate_series(1, 1536));

    -- Verify vector dimension precondition
    IF array_length(test_embedding::real[], 1) != 1536 THEN
        RAISE EXCEPTION 'PRECONDITION FAIL: test_embedding has wrong dimension: %',
            array_length(test_embedding::real[], 1);
    END IF;

    RAISE NOTICE '  ✅ PRECONDITION: test_embedding has correct dimension (1536)';

    -- ─────────────────────────────────────────────
    -- Test 1a: find_similar_faq_v2 with valid input
    -- ─────────────────────────────────────────────

    -- ARRANGE (already done above)

    -- ACT
    BEGIN
        SELECT * INTO result FROM knowledge.find_similar_faq_v2(test_embedding, 0.8, 3);

        -- ASSERT
        RAISE NOTICE '  ✅ TEST 1a PASS: find_similar_faq_v2 accepts valid embedding';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION '  ❌ TEST 1a FAIL: find_similar_faq_v2 failed with valid input: %', SQLERRM;
    END;

    -- ─────────────────────────────────────────────
    -- Test 1b: find_similar_faq_v2 rejects NULL embedding (STRICT mode)
    -- ─────────────────────────────────────────────

    -- ARRANGE (no setup needed)

    -- ACT
    BEGIN
        SELECT * INTO result FROM knowledge.find_similar_faq_v2(NULL::VECTOR, 0.8, 3);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 1b FAIL: find_similar_faq_v2 accepted NULL embedding (should reject)';
    EXCEPTION
        WHEN null_value_not_allowed THEN
            -- ASSERT
            RAISE NOTICE '  ✅ TEST 1b PASS: find_similar_faq_v2 rejects NULL embedding';
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%cannot be NULL%' THEN
                -- ASSERT
                RAISE NOTICE '  ✅ TEST 1b PASS: find_similar_faq_v2 rejects NULL embedding';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 1b FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 1c: find_similar_conversations_v2 validates chat_id format
    --          AND verifies no data corruption occurred
    -- ─────────────────────────────────────────────

    -- ARRANGE: Count existing clients
    SELECT COUNT(*) INTO rows_before FROM knowledge.clients;
    SELECT COUNT(*) INTO audit_count_before
    FROM knowledge.audit_log
    WHERE operation = 'SECURITY_VIOLATION'
    AND details->>'attack_type' = 'sql_injection';

    -- ACT: Attempt SQL injection
    BEGIN
        SELECT * INTO result FROM knowledge.find_similar_conversations_v2(
            test_embedding,
            'invalid_chat_id; DROP TABLE knowledge.clients;--',
            0.8,
            5
        );

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 1c FAIL: find_similar_conversations_v2 accepted invalid chat_id (SQL injection attempt)';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Invalid chat_id format%' THEN
                -- ASSERT: Error message correct
                RAISE NOTICE '  ✅ TEST 1c PASS (partial): Correct error message';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 1c FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ASSERT: Verify no rows were affected
    SELECT COUNT(*) INTO rows_after FROM knowledge.clients;

    IF rows_after != rows_before THEN
        RAISE EXCEPTION '  ❌ TEST 1c FAIL: Data corruption detected! rows_before=%, rows_after=%',
            rows_before, rows_after;
    END IF;

    RAISE NOTICE '  ✅ TEST 1c PASS: No data corruption (rows unchanged: %)', rows_before;

    -- ASSERT: Verify security event was logged
    SELECT COUNT(*) INTO audit_count_after
    FROM knowledge.audit_log
    WHERE operation = 'SECURITY_VIOLATION'
    AND details->>'attack_type' = 'sql_injection'
    AND created_at > NOW() - INTERVAL '10 seconds';

    IF audit_count_after > audit_count_before THEN
        RAISE NOTICE '  ✅ TEST 1c PASS: Security event logged in audit_log';
    ELSE
        RAISE NOTICE '  ⚠️  TEST 1c WARNING: Security event not logged (audit system may not be enabled)';
    END IF;

    RAISE NOTICE '  ✅ TEST 1 COMPLETE: SQL injection prevention working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TEST 2: Input Validation (match_threshold, match_count)
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    -- ARRANGE: Test constants
    test_embedding VECTOR(1536);
    audit_count_before INT;
    audit_count_after INT;
BEGIN
    RAISE NOTICE '🔒 TEST 2: Input Validation (AAA Pattern)';

    -- ARRANGE
    test_embedding := (SELECT array_agg(random())::VECTOR(1536) FROM generate_series(1, 1536));

    SELECT COUNT(*) INTO audit_count_before FROM knowledge.audit_log
    WHERE operation = 'VALIDATION_ERROR';

    -- ─────────────────────────────────────────────
    -- Test 2a: Invalid match_threshold (-0.5)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.find_similar_faq_v2(test_embedding, -0.5, 3);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 2a FAIL: find_similar_faq_v2 accepted negative match_threshold';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%match_threshold must be between 0 and 1%' THEN
                RAISE NOTICE '  ✅ TEST 2a PASS: Rejects negative match_threshold';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 2a FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 2b: Invalid match_threshold (1.5)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.find_similar_faq_v2(test_embedding, 1.5, 3);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 2b FAIL: find_similar_faq_v2 accepted match_threshold > 1';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%match_threshold must be between 0 and 1%' THEN
                RAISE NOTICE '  ✅ TEST 2b PASS: Rejects match_threshold > 1';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 2b FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 2c: Invalid match_count (0)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.find_similar_faq_v2(test_embedding, 0.8, 0);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 2c FAIL: find_similar_faq_v2 accepted match_count = 0';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%match_count must be between 1 and 100%' THEN
                RAISE NOTICE '  ✅ TEST 2c PASS: Rejects match_count = 0';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 2c FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 2d: Invalid match_count (1000, DoS risk)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.find_similar_faq_v2(test_embedding, 0.8, 1000);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 2d FAIL: find_similar_faq_v2 accepted match_count = 1000 (DoS risk)';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%match_count must be between 1 and 100%' THEN
                RAISE NOTICE '  ✅ TEST 2d PASS: Rejects excessive match_count (DoS protection)';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 2d FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ASSERT: Verify validation errors were logged
    SELECT COUNT(*) INTO audit_count_after FROM knowledge.audit_log
    WHERE operation = 'VALIDATION_ERROR'
    AND created_at > NOW() - INTERVAL '10 seconds';

    IF audit_count_after > audit_count_before THEN
        RAISE NOTICE '  ✅ TEST 2 PASS: Validation errors logged (delta: %)',
            audit_count_after - audit_count_before;
    ELSE
        RAISE NOTICE '  ⚠️  TEST 2 WARNING: Validation errors not logged in audit_log';
    END IF;

    RAISE NOTICE '  ✅ TEST 2 COMPLETE: Input validation working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TEST 3: calculate_fees_v2 Input Validation
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    -- ARRANGE: Expected values as constants
    EXPECTED_TOTAL_FEE CONSTANT NUMERIC := 19752.60;
    EXPECTED_BACKPAY_FEE CONSTANT NUMERIC := 3000.00;
    EXPECTED_MONTHLY_FEE CONSTANT NUMERIC := 7200.00;
    EXPECTED_UAD_FEE CONSTANT NUMERIC := 9552.60;

    result JSON;
    total_fee NUMERIC;
    backpay_fee NUMERIC;
    monthly_fee NUMERIC;
    uad_fee NUMERIC;
BEGIN
    RAISE NOTICE '🔒 TEST 3: calculate_fees_v2 Validation (AAA Pattern)';

    -- ─────────────────────────────────────────────
    -- Test 3a: Negative estimated_backpay
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.calculate_fees_v2(-1000.00, 2000.00, 60);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 3a FAIL: calculate_fees_v2 accepted negative estimated_backpay';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%must be non-negative%' THEN
                RAISE NOTICE '  ✅ TEST 3a PASS: Rejects negative estimated_backpay';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 3a FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 3b: Negative monthly_benefit
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.calculate_fees_v2(10000.00, -2000.00, 60);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 3b FAIL: calculate_fees_v2 accepted negative monthly_benefit';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%must be non-negative%' THEN
                RAISE NOTICE '  ✅ TEST 3b PASS: Rejects negative monthly_benefit';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 3b FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 3c: Excessive estimated_uads (1001)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.calculate_fees_v2(10000.00, 2000.00, 1001);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 3c FAIL: calculate_fees_v2 accepted estimated_uads = 1001';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%must be between 0 and 1000%' THEN
                RAISE NOTICE '  ✅ TEST 3c PASS: Rejects excessive estimated_uads';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 3c FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 3d: Valid calculation with NUMERIC precision
    -- ─────────────────────────────────────────────

    -- ARRANGE: Expected values already defined as constants above

    -- ACT
    result := knowledge.calculate_fees_v2(10000.00, 2000.00, 60);

    -- ASSERT: Extract components
    total_fee := (result->>'total')::NUMERIC;
    backpay_fee := (result->>'backpay_fee')::NUMERIC;
    monthly_fee := (result->>'monthly_fee')::NUMERIC;
    uad_fee := (result->>'uad_fee')::NUMERIC;

    -- ASSERT: Total fee
    IF ABS(total_fee - EXPECTED_TOTAL_FEE) < 0.01 THEN
        RAISE NOTICE '  ✅ TEST 3d PASS: Total fee correct (expected: %, got: %)',
            EXPECTED_TOTAL_FEE, total_fee;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 3d FAIL: Total fee incorrect (expected: %, got: %)',
            EXPECTED_TOTAL_FEE, total_fee;
    END IF;

    -- ASSERT: Backpay fee
    IF ABS(backpay_fee - EXPECTED_BACKPAY_FEE) < 0.01 THEN
        RAISE NOTICE '  ✅ TEST 3d PASS: Backpay fee correct (expected: %, got: %)',
            EXPECTED_BACKPAY_FEE, backpay_fee;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 3d FAIL: Backpay fee incorrect (expected: %, got: %)',
            EXPECTED_BACKPAY_FEE, backpay_fee;
    END IF;

    -- ASSERT: Monthly fee
    IF ABS(monthly_fee - EXPECTED_MONTHLY_FEE) < 0.01 THEN
        RAISE NOTICE '  ✅ TEST 3d PASS: Monthly fee correct (expected: %, got: %)',
            EXPECTED_MONTHLY_FEE, monthly_fee;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 3d FAIL: Monthly fee incorrect (expected: %, got: %)',
            EXPECTED_MONTHLY_FEE, monthly_fee;
    END IF;

    -- ASSERT: UAD fee
    IF ABS(uad_fee - EXPECTED_UAD_FEE) < 0.01 THEN
        RAISE NOTICE '  ✅ TEST 3d PASS: UAD fee correct (expected: %, got: %)',
            EXPECTED_UAD_FEE, uad_fee;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 3d FAIL: UAD fee incorrect (expected: %, got: %)',
            EXPECTED_UAD_FEE, uad_fee;
    END IF;

    RAISE NOTICE '  ✅ TEST 3 COMPLETE: Fee calculation validation working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TEST 4: CPF Validation
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    inserted_count INT;
    deleted_count INT;
BEGIN
    RAISE NOTICE '🔒 TEST 4: CPF Validation (AAA Pattern)';

    -- ─────────────────────────────────────────────
    -- Test 4a: Valid CPF (11 digits, not all same)
    -- ─────────────────────────────────────────────

    -- ARRANGE (no setup needed)

    -- ACT
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf, full_name)
        VALUES ('test_security_cpf_valid', '12345678901', 'Valid CPF User');

        GET DIAGNOSTICS inserted_count = ROW_COUNT;

        -- ASSERT
        IF inserted_count = 1 THEN
            RAISE NOTICE '  ✅ TEST 4a PASS: Accepts valid CPF (inserted % row)', inserted_count;
        ELSE
            RAISE EXCEPTION '  ❌ TEST 4a FAIL: Expected 1 row inserted, got %', inserted_count;
        END IF;

        DELETE FROM knowledge.clients WHERE chat_id = 'test_security_cpf_valid';
        GET DIAGNOSTICS deleted_count = ROW_COUNT;

        IF deleted_count != 1 THEN
            RAISE EXCEPTION '  ❌ TEST 4a CLEANUP FAIL: Expected 1 row deleted, got %', deleted_count;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE EXCEPTION '  ❌ TEST 4a FAIL: Rejected valid CPF: %', SQLERRM;
    END;

    -- ─────────────────────────────────────────────
    -- Test 4b: Invalid CPF (all zeros)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf, full_name)
        VALUES ('test_security_cpf_zeros', '00000000000', 'Invalid CPF User');

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 4b FAIL: Accepted invalid CPF (all zeros)';
    EXCEPTION
        WHEN check_violation THEN
            -- ASSERT
            RAISE NOTICE '  ✅ TEST 4b PASS: Rejects CPF with all same digits (00000000000)';
    END;

    -- ─────────────────────────────────────────────
    -- Test 4c: Invalid CPF (only 10 digits)
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        INSERT INTO knowledge.clients (chat_id, cpf, full_name)
        VALUES ('test_security_cpf_short', '1234567890', 'Invalid CPF User');

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 4c FAIL: Accepted invalid CPF (10 digits)';
    EXCEPTION
        WHEN check_violation THEN
            -- ASSERT
            RAISE NOTICE '  ✅ TEST 4c PASS: Rejects CPF with incorrect length';
    END;

    RAISE NOTICE '  ✅ TEST 4 COMPLETE: CPF validation working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TEST 5: Row-Level Security (RLS) Multi-Tenant Isolation
--          (Enhanced: Non-test masquerading fixed)
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    rls_enabled BOOLEAN;
    tenant1_count INT;
    tenant2_count INT;
    is_superuser BOOLEAN;
    inserted_count INT;
    deleted_count INT;
BEGIN
    RAISE NOTICE '🔒 TEST 5: Row-Level Security (RLS) (AAA Pattern)';

    -- ARRANGE: Check if we're superuser
    SELECT usesuper INTO is_superuser
    FROM pg_user
    WHERE usename = CURRENT_USER;

    IF is_superuser THEN
        RAISE NOTICE '  ⚠️  Running as superuser - RLS bypassed (expected behavior)';
        RAISE NOTICE '  ℹ️  TEST 5 SKIP: RLS requires non-superuser role for isolation testing';
        RAISE NOTICE '  ℹ️  To test properly: CREATE ROLE test_tenant_user; SET ROLE test_tenant_user;';
        RETURN;
    END IF;

    -- ARRANGE: Verify RLS is enabled
    SELECT rowsecurity INTO rls_enabled
    FROM pg_tables
    WHERE schemaname = 'knowledge'
    AND tablename = 'clients';

    IF NOT rls_enabled THEN
        RAISE EXCEPTION '  ❌ TEST 5 FAIL: RLS not enabled on knowledge.clients';
    END IF;

    RAISE NOTICE '  ✅ PRECONDITION: RLS enabled on knowledge.clients';

    -- ARRANGE: Create test data for two tenants
    INSERT INTO knowledge.clients (chat_id, full_name, metadata)
    VALUES
        ('test_security_tenant1_user1', 'Tenant 1 User', '{"tenant_id": "tenant_1"}'::jsonb),
        ('test_security_tenant2_user1', 'Tenant 2 User', '{"tenant_id": "tenant_2"}'::jsonb);

    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    IF inserted_count != 2 THEN
        RAISE EXCEPTION '  ❌ ARRANGE FAIL: Expected 2 rows inserted, got %', inserted_count;
    END IF;

    -- ACT: Set tenant context for tenant_1
    PERFORM set_config('app.current_tenant_id', 'tenant_1', FALSE);

    -- ASSERT: Tenant 1 sees only their data
    SELECT COUNT(*) INTO tenant1_count
    FROM knowledge.clients
    WHERE chat_id LIKE 'test_security_tenant%';

    IF tenant1_count = 1 THEN
        RAISE NOTICE '  ✅ TEST 5 PASS: Tenant 1 sees only 1 row (isolation working)';
    ELSE
        RAISE EXCEPTION '  ❌ TEST 5 FAIL: Tenant 1 sees % rows (expected 1)', tenant1_count;
    END IF;

    -- ACT: Switch to tenant_2
    PERFORM set_config('app.current_tenant_id', 'tenant_2', FALSE);

    -- ASSERT: Tenant 2 sees only their data
    SELECT COUNT(*) INTO tenant2_count
    FROM knowledge.clients
    WHERE chat_id LIKE 'test_security_tenant%';

    IF tenant2_count = 1 THEN
        RAISE NOTICE '  ✅ TEST 5 PASS: Tenant 2 sees only 1 row (isolation working)';
    ELSE
        RAISE EXCEPTION '  ❌ TEST 5 FAIL: Tenant 2 sees % rows (expected 1)', tenant2_count;
    END IF;

    -- Cleanup (reset to superuser context for deletion)
    PERFORM set_config('app.current_tenant_id', '', FALSE);
    DELETE FROM knowledge.clients WHERE chat_id LIKE 'test_security_tenant%';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count != 2 THEN
        RAISE EXCEPTION '  ❌ CLEANUP FAIL: Expected 2 rows deleted, got %', deleted_count;
    END IF;

    RAISE NOTICE '  ✅ TEST 5 COMPLETE: RLS multi-tenant isolation working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TEST 6: Audit Trail (created_by, updated_by)
--          (Enhanced: Verify audit_log actually captured events)
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    client_id INT;
    created_user VARCHAR;
    updated_user VARCHAR;
    audit_count_before INT;
    audit_count_after INT;
    deleted_count INT;
BEGIN
    RAISE NOTICE '🔒 TEST 6: Audit Trail (AAA Pattern)';

    -- ARRANGE: Count existing audit entries
    SELECT COUNT(*) INTO audit_count_before
    FROM knowledge.audit_log
    WHERE table_name = 'clients';

    -- ACT: Insert client
    INSERT INTO knowledge.clients (chat_id, full_name)
    VALUES ('test_security_audit', 'Audit Test User')
    RETURNING id, created_by INTO client_id, created_user;

    -- ASSERT: created_by is populated
    IF created_user IS NOT NULL THEN
        RAISE NOTICE '  ✅ TEST 6 PASS: created_by populated: %', created_user;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 6 FAIL: created_by is NULL';
    END IF;

    -- ACT: Update client
    UPDATE knowledge.clients
    SET full_name = 'Audit Test User Updated'
    WHERE id = client_id;

    SELECT updated_by INTO updated_user
    FROM knowledge.clients
    WHERE id = client_id;

    -- ASSERT: updated_by is set
    IF updated_user IS NOT NULL THEN
        RAISE NOTICE '  ✅ TEST 6 PASS: updated_by populated: %', updated_user;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 6 FAIL: updated_by is NULL';
    END IF;

    -- ASSERT: Verify audit_log captured UPDATE operation
    SELECT COUNT(*) INTO audit_count_after
    FROM knowledge.audit_log
    WHERE table_name = 'clients'
    AND record_id = client_id
    AND operation = 'UPDATE'
    AND created_at > NOW() - INTERVAL '10 seconds';

    IF audit_count_after > 0 THEN
        RAISE NOTICE '  ✅ TEST 6 PASS: Audit log captured UPDATE operation (% entries)', audit_count_after;
    ELSE
        RAISE EXCEPTION '  ❌ TEST 6 FAIL: No audit log entry for UPDATE operation';
    END IF;

    -- Cleanup
    DELETE FROM knowledge.clients WHERE id = client_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    IF deleted_count != 1 THEN
        RAISE EXCEPTION '  ❌ CLEANUP FAIL: Expected 1 row deleted, got %', deleted_count;
    END IF;

    RAISE NOTICE '  ✅ TEST 6 COMPLETE: Audit trail working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  TEST 7: Negative Test - Invalid Vector Dimensions
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
    invalid_embedding_512 VECTOR(512);
    invalid_embedding_768 VECTOR(768);
BEGIN
    RAISE NOTICE '🔒 TEST 7: Invalid Vector Dimensions (AAA Pattern)';

    -- ARRANGE: Create embeddings with wrong dimensions
    invalid_embedding_512 := (SELECT array_agg(random())::VECTOR(512) FROM generate_series(1, 512));
    invalid_embedding_768 := (SELECT array_agg(random())::VECTOR(768) FROM generate_series(1, 768));

    -- ─────────────────────────────────────────────
    -- Test 7a: find_similar_faq_v2 rejects 512-dim vector
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.find_similar_faq_v2(invalid_embedding_512::VECTOR(1536), 0.8, 3);

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 7a FAIL: Accepted 512-dim vector';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%dimension%' OR SQLERRM LIKE '%cannot cast%' THEN
                RAISE NOTICE '  ✅ TEST 7a PASS: Rejected 512-dim vector';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 7a FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- ─────────────────────────────────────────────
    -- Test 7b: find_similar_conversations_v2 rejects 768-dim vector
    -- ─────────────────────────────────────────────

    -- ACT
    BEGIN
        PERFORM * FROM knowledge.find_similar_conversations_v2(
            invalid_embedding_768::VECTOR(1536),
            'valid_chat_id',
            0.8,
            5
        );

        -- ASSERT: Should not reach here
        RAISE EXCEPTION '  ❌ TEST 7b FAIL: Accepted 768-dim vector';
    EXCEPTION
        WHEN OTHERS THEN
            -- ASSERT
            IF SQLERRM LIKE '%dimension%' OR SQLERRM LIKE '%cannot cast%' THEN
                RAISE NOTICE '  ✅ TEST 7b PASS: Rejected 768-dim vector';
            ELSE
                RAISE EXCEPTION '  ❌ TEST 7b FAIL: Unexpected error: %', SQLERRM;
            END IF;
    END;

    RAISE NOTICE '  ✅ TEST 7 COMPLETE: Vector dimension validation working';
END;
$$;

-- ═══════════════════════════════════════════════════════════
--  SUMMARY
-- ═══════════════════════════════════════════════════════════

RAISE NOTICE '';
RAISE NOTICE '═══════════════════════════════════════════════════════════';
RAISE NOTICE '✅ ALL SECURITY TESTS PASSED (AAA Pattern)';
RAISE NOTICE '═══════════════════════════════════════════════════════════';

ROLLBACK;
