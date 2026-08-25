-- database/tests/test_integration.sql
-- Integration tests: full workflow testing (insert → query → update → delete)
-- Tests complete user journey through the system

\set ON_ERROR_STOP on
\timing on

BEGIN;

\echo '=== Integration Test Suite ==='
\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 1: Complete Client Intake Flow
-- ═══════════════════════════════════════════════════════════
\echo 'Test 1: Complete Client Intake Flow'

-- Step 1: Client sends first message
INSERT INTO knowledge.conversations (chat_id, message_id, from_user, message_text, message_type)
VALUES ('5511999999999', 'msg_001', 'client', 'Olá, preciso de ajuda com meu INSS', 'text');

-- Step 2: Bot responds
INSERT INTO knowledge.conversations (chat_id, message_id, from_user, message_text, message_type)
VALUES ('5511999999999', 'msg_002', 'bot', 'Olá! Vou te ajudar. Qual é o seu nome completo?', 'text');

-- Step 3: Create client record
INSERT INTO knowledge.clients (chat_id, phone, full_name, client_type, current_stage)
VALUES ('5511999999999', '+5511999999999', 'João da Silva', 'new', 'discovery')
RETURNING id;

-- Step 4: Client provides information
INSERT INTO knowledge.conversations (chat_id, message_id, from_user, message_text, message_type)
VALUES ('5511999999999', 'msg_003', 'client', 'Meu nome é João da Silva', 'text');

-- Step 5: Create lead
INSERT INTO intake_staging.leads (
    chat_id, phone, full_name, cpf, case_type, case_data, intake_status
)
VALUES (
    '5511999999999',
    '+5511999999999',
    'João da Silva',
    '12345678901',
    'aposentadoria_idade',
    '{"age": 65, "work_duration_years": 35}'::jsonb,
    'in_progress'
)
RETURNING id;

-- Step 6: Update client stage
UPDATE knowledge.clients
SET current_stage = 'intake', total_messages = 3
WHERE chat_id = '5511999999999';

-- Step 7: Verify complete workflow
DO $$
DECLARE
    conversation_count INT;
    client_exists BOOLEAN;
    lead_exists BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO conversation_count
    FROM knowledge.conversations
    WHERE chat_id = '5511999999999' AND deleted_at IS NULL;

    SELECT EXISTS(
        SELECT 1 FROM knowledge.clients
        WHERE chat_id = '5511999999999' AND deleted_at IS NULL
    ) INTO client_exists;

    SELECT EXISTS(
        SELECT 1 FROM intake_staging.leads
        WHERE chat_id = '5511999999999' AND deleted_at IS NULL
    ) INTO lead_exists;

    IF conversation_count != 3 THEN
        RAISE EXCEPTION 'Expected 3 conversations, found %', conversation_count;
    END IF;

    IF NOT client_exists THEN
        RAISE EXCEPTION 'Client record not found';
    END IF;

    IF NOT lead_exists THEN
        RAISE EXCEPTION 'Lead record not found';
    END IF;

    RAISE NOTICE '✓ Complete intake flow test passed';
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 2: Document Upload and Verification Flow
-- ═══════════════════════════════════════════════════════════
\echo 'Test 2: Document Upload and Verification Flow'

-- Get client_id
DO $$
DECLARE
    v_client_id INT;
    v_lead_id INT;
    v_doc_id INT;
BEGIN
    -- Get IDs
    SELECT id INTO v_client_id FROM knowledge.clients WHERE chat_id = '5511999999999' AND deleted_at IS NULL;
    SELECT id INTO v_lead_id FROM intake_staging.leads WHERE chat_id = '5511999999999' AND deleted_at IS NULL;

    -- Upload document to lead
    INSERT INTO intake_staging.lead_documents (
        lead_id, document_type, file_name, mime_type, file_size_bytes,
        storage_provider, storage_path, validated
    )
    VALUES (
        v_lead_id, 'rg', 'rg_joao.pdf', 'application/pdf', 524288,
        'minio', '/uploads/5511999999999/rg_joao.pdf', FALSE
    )
    RETURNING id INTO v_doc_id;

    -- Validate document
    UPDATE intake_staging.lead_documents
    SET validated = TRUE,
        validated_by = 'admin',
        validated_at = NOW()
    WHERE id = v_doc_id;

    -- Verify validation
    IF NOT EXISTS(
        SELECT 1 FROM intake_staging.lead_documents
        WHERE id = v_doc_id AND validated = TRUE AND validated_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Document validation check failed';
    END IF;

    RAISE NOTICE '✓ Document upload and verification flow test passed';
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 3: Soft Delete and Recovery
-- ═══════════════════════════════════════════════════════════
\echo 'Test 3: Soft Delete and Recovery'

DO $$
DECLARE
    v_client_id INT;
    v_conversation_id INT;
BEGIN
    -- Get IDs
    SELECT id INTO v_client_id FROM knowledge.clients WHERE chat_id = '5511999999999';
    SELECT id INTO v_conversation_id FROM knowledge.conversations WHERE message_id = 'msg_001';

    -- Soft delete conversation
    UPDATE knowledge.conversations
    SET deleted_at = NOW(), deleted_by = 'system'
    WHERE id = v_conversation_id;

    -- Verify soft delete (should not appear in normal queries)
    IF EXISTS(
        SELECT 1 FROM knowledge.conversations
        WHERE id = v_conversation_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Soft deleted conversation still visible';
    END IF;

    -- Verify still in database
    IF NOT EXISTS(
        SELECT 1 FROM knowledge.conversations
        WHERE id = v_conversation_id
    ) THEN
        RAISE EXCEPTION 'Soft deleted conversation was hard deleted';
    END IF;

    -- Recover conversation
    UPDATE knowledge.conversations
    SET deleted_at = NULL, deleted_by = NULL
    WHERE id = v_conversation_id;

    -- Verify recovery
    IF NOT EXISTS(
        SELECT 1 FROM knowledge.conversations
        WHERE id = v_conversation_id AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Conversation recovery failed';
    END IF;

    RAISE NOTICE '✓ Soft delete and recovery test passed';
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 4: Audit Trail Verification
-- ═══════════════════════════════════════════════════════════
\echo 'Test 4: Audit Trail Verification'

DO $$
DECLARE
    audit_count INT;
BEGIN
    -- Check audit log for client changes
    SELECT COUNT(*) INTO audit_count
    FROM knowledge.audit_log
    WHERE table_name = 'clients'
    AND operation IN ('INSERT', 'UPDATE');

    IF audit_count = 0 THEN
        RAISE EXCEPTION 'No audit records found for client changes';
    END IF;

    RAISE NOTICE '✓ Audit trail test passed (% records)', audit_count;
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 5: Constraint Validation
-- ═══════════════════════════════════════════════════════════
\echo 'Test 5: Constraint Validation'

-- Test invalid email
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        chat_id, email, case_type, case_data
    )
    VALUES (
        '5511888888888', 'invalid@a.b', 'aposentadoria_idade', '{}'::jsonb
    );
    RAISE EXCEPTION 'Invalid email was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '✓ Email validation test passed';
END $$;

-- Test invalid CPF
DO $$
BEGIN
    INSERT INTO knowledge.clients (chat_id, cpf)
    VALUES ('5511777777777', '123');
    RAISE EXCEPTION 'Invalid CPF was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '✓ CPF validation test passed';
END $$;

-- Test JSONB size limit
DO $$
BEGIN
    INSERT INTO intake_staging.leads (
        chat_id, case_type, case_data
    )
    VALUES (
        '5511666666666',
        'aposentadoria_idade',
        (SELECT json_build_object('huge_data', repeat('x', 2000000))::jsonb)
    );
    RAISE EXCEPTION 'Oversized JSONB was accepted';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '✓ JSONB size limit test passed';
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 6: Helper Function Integration
-- ═══════════════════════════════════════════════════════════
\echo 'Test 6: Helper Function Integration'

DO $$
DECLARE
    summary JSON;
    fees JSON;
BEGIN
    -- Test get_client_summary
    SELECT knowledge.get_client_summary('5511999999999') INTO summary;

    IF summary IS NULL THEN
        RAISE EXCEPTION 'get_client_summary returned NULL';
    END IF;

    IF NOT (summary->>'client' IS NOT NULL) THEN
        RAISE EXCEPTION 'Client data missing from summary';
    END IF;

    RAISE NOTICE '✓ get_client_summary test passed';

    -- Test calculate_fees
    SELECT knowledge.calculate_fees(10000.00, 1500.00, 60) INTO fees;

    IF fees IS NULL THEN
        RAISE EXCEPTION 'calculate_fees returned NULL';
    END IF;

    IF (fees->>'total')::NUMERIC <= 0 THEN
        RAISE EXCEPTION 'Invalid fee calculation';
    END IF;

    RAISE NOTICE '✓ calculate_fees test passed';
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 7: Concurrent Access (Optimistic Locking)
-- ═══════════════════════════════════════════════════════════
\echo 'Test 7: Concurrent Access Simulation'

DO $$
DECLARE
    v_client_id INT;
    v_initial_messages INT;
    v_final_messages INT;
BEGIN
    SELECT id, total_messages INTO v_client_id, v_initial_messages
    FROM knowledge.clients
    WHERE chat_id = '5511999999999';

    -- Simulate concurrent updates
    UPDATE knowledge.clients
    SET total_messages = total_messages + 1
    WHERE id = v_client_id;

    UPDATE knowledge.clients
    SET total_messages = total_messages + 1
    WHERE id = v_client_id;

    UPDATE knowledge.clients
    SET total_messages = total_messages + 1
    WHERE id = v_client_id;

    SELECT total_messages INTO v_final_messages
    FROM knowledge.clients
    WHERE id = v_client_id;

    IF v_final_messages != v_initial_messages + 3 THEN
        RAISE EXCEPTION 'Concurrent update failed: expected %, got %',
            v_initial_messages + 3, v_final_messages;
    END IF;

    RAISE NOTICE '✓ Concurrent access test passed';
END $$;

\echo ''

-- ═══════════════════════════════════════════════════════════
-- Test 8: updated_at Trigger
-- ═══════════════════════════════════════════════════════════
\echo 'Test 8: Auto-update Triggers'

DO $$
DECLARE
    v_lead_id INT;
    v_initial_updated_at TIMESTAMP;
    v_final_updated_at TIMESTAMP;
BEGIN
    SELECT id, updated_at INTO v_lead_id, v_initial_updated_at
    FROM intake_staging.leads
    WHERE chat_id = '5511999999999';

    -- Wait 1 second
    PERFORM pg_sleep(1);

    -- Update lead
    UPDATE intake_staging.leads
    SET intake_status = 'completed'
    WHERE id = v_lead_id;

    SELECT updated_at INTO v_final_updated_at
    FROM intake_staging.leads
    WHERE id = v_lead_id;

    IF v_final_updated_at <= v_initial_updated_at THEN
        RAISE EXCEPTION 'updated_at trigger did not fire';
    END IF;

    RAISE NOTICE '✓ Auto-update trigger test passed';
END $$;

\echo ''
\echo '=== All Integration Tests Passed ==='

ROLLBACK;
