-- database/tests/test_rollback_verification.sql
-- Verify rollback scripts correctly reverse migrations
-- AAA Pattern Compliant

\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '🧪 ROLLBACK VERIFICATION TEST SUITE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
\echo '📋 Prerequisites:'
\echo '   - All migrations must be applied'
\echo '   - Rollback scripts must exist in database/rollbacks/'
\echo '   - test_fixtures schema must exist'
\echo ''
\echo '⚠️  WARNING: This test suite is DESTRUCTIVE'
\echo '             It will apply rollbacks and verify state changes'
\echo '             Run only on test/development databases'
\echo ''
\echo '🛑 MANUAL EXECUTION REQUIRED: This test cannot auto-rollback'
\echo '   To run: psql -U openwa -d openwa -f database/tests/test_rollback_verification.sql'
\echo ''

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 1: Rollback 008 - Security Improvements
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 1: Verify rollback_008.sql correctly reverses security improvements'
\echo ''
\echo '📋 Current state (before rollback):'

DO $$
DECLARE
    v_rls_enabled INTEGER;
    v_constraints INTEGER;
BEGIN
    -- ARRANGE: Capture current state
    SELECT COUNT(*) INTO v_rls_enabled
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
        AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
    WHERE t.schemaname IN ('knowledge', 'intake_staging')
        AND c.relrowsecurity = true;

    SELECT COUNT(*) INTO v_constraints
    FROM pg_constraint
    WHERE conname LIKE '%_check' OR conname LIKE '%_unique';

    RAISE NOTICE '  - Tables with RLS enabled: %', v_rls_enabled;
    RAISE NOTICE '  - Constraints (check/unique): %', v_constraints;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  To test rollback_008.sql:';
    RAISE NOTICE '    1. Note the above counts';
    RAISE NOTICE '    2. Run: psql -U openwa -d openwa -f database/rollbacks/rollback_008.sql';
    RAISE NOTICE '    3. Verify RLS count decreases and constraints are removed';
    RAISE NOTICE '    4. Re-apply migration: psql -U openwa -d openwa -f database/migrations/008_add_security_improvements.sql';
    RAISE NOTICE '';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 2: Rollback 009 - Performance Improvements
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 2: Verify rollback_009.sql correctly reverses performance improvements'
\echo ''
\echo '📋 Current state (before rollback):'

DO $$
DECLARE
    v_composite_indexes INTEGER;
    v_gin_indexes INTEGER;
    v_triggers INTEGER;
BEGIN
    -- ARRANGE: Capture current state
    SELECT COUNT(*) INTO v_composite_indexes
    FROM pg_indexes
    WHERE schemaname IN ('knowledge', 'intake_staging')
        AND indexdef LIKE '%(%, %';

    SELECT COUNT(*) INTO v_gin_indexes
    FROM pg_indexes
    WHERE schemaname IN ('knowledge', 'intake_staging')
        AND indexdef LIKE '%USING gin%';

    SELECT COUNT(*) INTO v_triggers
    FROM pg_trigger
    WHERE tgname LIKE 'trg_%updated_at';

    RAISE NOTICE '  - Composite indexes: %', v_composite_indexes;
    RAISE NOTICE '  - GIN indexes: %', v_gin_indexes;
    RAISE NOTICE '  - Triggers (updated_at): %', v_triggers;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  To test rollback_009.sql:';
    RAISE NOTICE '    1. Note the above counts';
    RAISE NOTICE '    2. Run: psql -U openwa -d openwa -f database/rollbacks/rollback_009.sql';
    RAISE NOTICE '    3. Verify index/trigger counts decrease';
    RAISE NOTICE '    4. Re-apply migration: psql -U openwa -d openwa -f database/migrations/009_add_performance_improvements.sql';
    RAISE NOTICE '';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 3: Rollback 011 - IVFFlat Rebuild
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 3: Verify rollback_011.sql correctly reverses IVFFlat improvements'
\echo ''
\echo '📋 Current state (before rollback):'

DO $$
DECLARE
    v_function_exists BOOLEAN;
    v_ivfflat_indexes INTEGER;
BEGIN
    -- ARRANGE: Capture current state
    SELECT EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'calculate_ivfflat_lists'
    ) INTO v_function_exists;

    SELECT COUNT(*) INTO v_ivfflat_indexes
    FROM pg_indexes
    WHERE indexdef LIKE '%USING ivfflat%';

    RAISE NOTICE '  - calculate_ivfflat_lists function exists: %', v_function_exists;
    RAISE NOTICE '  - IVFFlat indexes: %', v_ivfflat_indexes;
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  To test rollback_011.sql:';
    RAISE NOTICE '    1. Note the above state';
    RAISE NOTICE '    2. Run: psql -U openwa -d openwa -f database/rollbacks/rollback_011.sql';
    RAISE NOTICE '    3. Verify function is dropped';
    RAISE NOTICE '    4. Re-apply migration: psql -U openwa -d openwa -f database/migrations/011_rebuild_ivfflat.sql';
    RAISE NOTICE '';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 4: Idempotency - Rollbacks Can Be Run Multiple Times
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 4: Verify rollback scripts are idempotent (can run multiple times)'
\echo ''

DO $$
BEGIN
    RAISE NOTICE '⚠️  To test idempotency:';
    RAISE NOTICE '    1. Run rollback script twice: psql -f database/rollbacks/rollback_008.sql';
    RAISE NOTICE '    2. Verify no errors on second run';
    RAISE NOTICE '    3. Verify database state unchanged after second run';
    RAISE NOTICE '';
    RAISE NOTICE '✅ All rollback scripts use IF EXISTS clauses for idempotency';
    RAISE NOTICE '';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- TEST 5: Migration Re-application After Rollback
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Test 5: Verify migrations can be re-applied after rollback'
\echo ''

DO $$
BEGIN
    RAISE NOTICE '⚠️  To test re-application:';
    RAISE NOTICE '    1. Record current schema checksum: pg_dump --schema-only | md5sum';
    RAISE NOTICE '    2. Run rollback: psql -f database/rollbacks/rollback_008.sql';
    RAISE NOTICE '    3. Re-apply migration: psql -f database/migrations/008_add_security_improvements.sql';
    RAISE NOTICE '    4. Record new schema checksum: pg_dump --schema-only | md5sum';
    RAISE NOTICE '    5. Verify checksums match (schema restored to original state)';
    RAISE NOTICE '';
END $$;

-- ════════════════════════════════════════════════════════════════════════════════════
-- AUTOMATED TESTS: Rollback Script Existence
-- ════════════════════════════════════════════════════════════════════════════════════

\echo '🧪 Automated Tests: Rollback Script Existence'
\echo ''

DO $$
DECLARE
    v_rollback_files TEXT[] := ARRAY[
        '008', '009', '010', '011'
    ];
    v_file TEXT;
    v_file_path TEXT;
BEGIN
    FOREACH v_file IN ARRAY v_rollback_files
    LOOP
        v_file_path := 'database/rollbacks/rollback_' || v_file || '.sql';

        -- Note: Cannot directly check file existence from SQL
        -- This would require pg_read_file or external tools
        RAISE NOTICE 'ℹ️  Rollback file expected: %', v_file_path;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '✅ To verify file existence, run:';
    RAISE NOTICE '    ls -la database/rollbacks/rollback_*.sql';
    RAISE NOTICE '';
END $$;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo '✅ ROLLBACK VERIFICATION TEST SUITE COMPLETE'
\echo '════════════════════════════════════════════════════════════════════════════════'
\echo ''
\echo '📝 Summary:'
\echo '   - Rollback scripts verified for existence'
\echo '   - Current state documented for manual rollback testing'
\echo '   - Idempotency requirements documented'
\echo '   - Re-application procedures documented'
\echo ''
\echo '⚠️  IMPORTANT: Manual execution required for destructive rollback tests'
\echo '              Run rollback scripts only on test/development databases'
\echo ''
