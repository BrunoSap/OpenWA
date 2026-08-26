-- database/migrations/006_cpf_helper_functions.sql
-- CPF validation, encryption, and hashing helper functions
-- Required for migration 003 tests (Suite 1: tests 1.1-1.7)

-- ════════════════════════════════════════════════════════════════
-- PRE-CONDITIONS: Verify pgcrypto extension
-- ════════════════════════════════════════════════════════════════
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        RAISE EXCEPTION 'PRE-CONDITION FAILED: pgcrypto extension required. Run: CREATE EXTENSION pgcrypto;';
    END IF;
    RAISE NOTICE '✅ pgcrypto extension found';
END $$;

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- FUNCTION 1: validate_cpf (Luhn algorithm with Brazilian CPF rules)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION intake_staging.validate_cpf(cpf_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    cpf TEXT;
    digit1 INT;
    digit2 INT;
    sum1 INT := 0;
    sum2 INT := 0;
    i INT;
BEGIN
    -- Remove non-numeric characters
    cpf := regexp_replace(cpf_input, '[^0-9]', '', 'g');

    -- Check length
    IF length(cpf) != 11 THEN
        RETURN FALSE;
    END IF;

    -- Check if all digits are the same (invalid CPF pattern)
    IF cpf ~ '^(.)\1{10}$' THEN
        RETURN FALSE;
    END IF;

    -- Calculate first check digit
    FOR i IN 1..9 LOOP
        sum1 := sum1 + substring(cpf, i, 1)::INT * (11 - i);
    END LOOP;
    digit1 := 11 - (sum1 % 11);
    IF digit1 >= 10 THEN
        digit1 := 0;
    END IF;

    -- Calculate second check digit
    FOR i IN 1..10 LOOP
        sum2 := sum2 + substring(cpf, i, 1)::INT * (12 - i);
    END LOOP;
    digit2 := 11 - (sum2 % 11);
    IF digit2 >= 10 THEN
        digit2 := 0;
    END IF;

    -- Validate check digits
    IF substring(cpf, 10, 1)::INT = digit1 AND substring(cpf, 11, 1)::INT = digit2 THEN
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION intake_staging.validate_cpf IS 'Validates Brazilian CPF using Luhn algorithm and rejects all-same-digit patterns';

-- ════════════════════════════════════════════════════════════════
-- FUNCTION 2: encrypt_cpf (AES-256 encryption)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION intake_staging.encrypt_cpf(cpf_plain TEXT, encryption_key TEXT)
RETURNS BYTEA AS $$
BEGIN
    -- Validate CPF before encrypting
    IF NOT intake_staging.validate_cpf(cpf_plain) THEN
        RAISE EXCEPTION 'Invalid CPF: %', cpf_plain;
    END IF;

    -- Encrypt using AES-256
    RETURN encrypt(
        cpf_plain::BYTEA,
        digest(encryption_key, 'sha256'),
        'aes'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION intake_staging.encrypt_cpf IS 'Encrypts valid CPF using AES-256 (requires pgcrypto extension)';

-- ════════════════════════════════════════════════════════════════
-- FUNCTION 3: decrypt_cpf (AES-256 decryption)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION intake_staging.decrypt_cpf(cpf_encrypted BYTEA, encryption_key TEXT)
RETURNS TEXT AS $$
DECLARE
    decrypted_bytes BYTEA;
BEGIN
    -- Decrypt using AES-256
    decrypted_bytes := decrypt(
        cpf_encrypted,
        digest(encryption_key, 'sha256'),
        'aes'
    );

    RETURN convert_from(decrypted_bytes, 'UTF8');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION intake_staging.decrypt_cpf IS 'Decrypts CPF encrypted with encrypt_cpf (AES-256)';

-- ════════════════════════════════════════════════════════════════
-- FUNCTION 4: hash_cpf (SHA-256 one-way hash)
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION intake_staging.hash_cpf(cpf_plain TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Validate CPF before hashing
    IF NOT intake_staging.validate_cpf(cpf_plain) THEN
        RAISE EXCEPTION 'Invalid CPF: %', cpf_plain;
    END IF;

    -- Hash using SHA-256 (64 hex chars)
    RETURN encode(digest(cpf_plain, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION intake_staging.hash_cpf IS 'One-way SHA-256 hash of valid CPF (64 hex chars)';

-- ════════════════════════════════════════════════════════════════
-- INLINE ASSERT PHASE: Verify all functions were created
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
    missing_functions TEXT := '';
BEGIN
    RAISE NOTICE '🔍 Verifying CPF helper functions...';

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'intake_staging' AND p.proname = 'validate_cpf'
    ) THEN
        missing_functions := missing_functions || '❌ Function: validate_cpf' || E'\n';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'intake_staging' AND p.proname = 'encrypt_cpf'
    ) THEN
        missing_functions := missing_functions || '❌ Function: encrypt_cpf' || E'\n';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'intake_staging' AND p.proname = 'decrypt_cpf'
    ) THEN
        missing_functions := missing_functions || '❌ Function: decrypt_cpf' || E'\n';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'intake_staging' AND p.proname = 'hash_cpf'
    ) THEN
        missing_functions := missing_functions || '❌ Function: hash_cpf' || E'\n';
    END IF;

    IF missing_functions != '' THEN
        RAISE EXCEPTION 'MIGRATION VERIFICATION FAILED:%', E'\n' || missing_functions;
    END IF;

    RAISE NOTICE '✅ All CPF helper functions verified successfully';
END $$;

-- ════════════════════════════════════════════════════════════════
-- SMOKE TESTS: Verify functions work correctly
-- ════════════════════════════════════════════════════════════════

DO $$
DECLARE
    cpf_valid TEXT := '12345678909';
    cpf_invalid TEXT := '12345678900';
    cpf_encrypted BYTEA;
    cpf_decrypted TEXT;
    cpf_hash VARCHAR(64);
BEGIN
    RAISE NOTICE '🧪 Running smoke tests...';

    -- Test 1: validate_cpf
    IF NOT intake_staging.validate_cpf(cpf_valid) THEN
        RAISE EXCEPTION 'Smoke test failed: validate_cpf rejected valid CPF';
    END IF;

    IF intake_staging.validate_cpf(cpf_invalid) THEN
        RAISE EXCEPTION 'Smoke test failed: validate_cpf accepted invalid CPF';
    END IF;

    -- Test 2: encrypt_cpf + decrypt_cpf roundtrip
    cpf_encrypted := intake_staging.encrypt_cpf(cpf_valid, 'test_key_256_bits');
    cpf_decrypted := intake_staging.decrypt_cpf(cpf_encrypted, 'test_key_256_bits');

    IF cpf_decrypted != cpf_valid THEN
        RAISE EXCEPTION 'Smoke test failed: encrypt/decrypt roundtrip failed';
    END IF;

    -- Test 3: hash_cpf consistency
    cpf_hash := intake_staging.hash_cpf(cpf_valid);

    IF length(cpf_hash) != 64 THEN
        RAISE EXCEPTION 'Smoke test failed: hash_cpf did not return 64 chars';
    END IF;

    IF intake_staging.hash_cpf(cpf_valid) != cpf_hash THEN
        RAISE EXCEPTION 'Smoke test failed: hash_cpf not consistent';
    END IF;

    RAISE NOTICE '✅ All smoke tests passed';
END $$;

-- Record migration (skipped - migration system not required for this standalone migration)
-- SELECT public.record_migration('006_cpf_helper_functions', 'CPF validation, encryption (AES-256), and hashing (SHA-256) helper functions', NULL, NULL);

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- POST-MIGRATION SUMMARY
-- ════════════════════════════════════════════════════════════════

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '✅ Migration 006: CPF Helper Functions Applied'
\echo '════════════════════════════════════════════════════════════════'
\echo '📊 Functions Created:'
\echo '  ├─ validate_cpf (Luhn algorithm + all-same-digit check)'
\echo '  ├─ encrypt_cpf (AES-256 encryption with validation)'
\echo '  ├─ decrypt_cpf (AES-256 decryption)'
\echo '  └─ hash_cpf (SHA-256 one-way hash with validation)'
\echo ''
\echo '🔗 Dependencies Met:'
\echo '  ✅ Migration 003 test suite 1 (tests 1.1-1.7) now fully supported'
\echo ''
\echo '🧪 Smoke Tests:'
\echo '  ✅ CPF validation (valid/invalid)'
\echo '  ✅ Encrypt/decrypt roundtrip'
\echo '  ✅ Hash consistency'
\echo '════════════════════════════════════════════════════════════════'
