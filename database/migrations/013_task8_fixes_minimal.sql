-- database/migrations/013_task8_fixes_minimal.sql
-- Minimal fixes needed for Task 8 tests to pass

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  STEP 1: Add client_id column and foreign key
-- ═══════════════════════════════════════════════════════════

ALTER TABLE knowledge.conversations
    ADD COLUMN IF NOT EXISTS client_id INT;

-- Backfill client_id from chat_id
UPDATE knowledge.conversations conv
SET client_id = (
    SELECT id FROM knowledge.clients c
    WHERE c.chat_id = conv.chat_id
    LIMIT 1
)
WHERE conv.client_id IS NULL;

-- Add foreign key constraint
ALTER TABLE knowledge.conversations
    DROP CONSTRAINT IF EXISTS conversations_client_id_fkey;

ALTER TABLE knowledge.conversations
    ADD CONSTRAINT conversations_client_id_fkey
    FOREIGN KEY (client_id)
    REFERENCES knowledge.clients(id)
    ON DELETE CASCADE;

-- Index for foreign key
CREATE INDEX IF NOT EXISTS idx_conversations_client
    ON knowledge.conversations (client_id);

-- ═══════════════════════════════════════════════════════════
--  STEP 2: Add deleted_at column for soft deletes
-- ═══════════════════════════════════════════════════════════

ALTER TABLE knowledge.conversations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_conversations_not_deleted
    ON knowledge.conversations (chat_id, timestamp)
    WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════
--  STEP 3: CPF validation function and constraint
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.validate_cpf(cpf TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_cpf TEXT;
    v_sum INT;
    v_digit1 INT;
    v_digit2 INT;
    i INT;
BEGIN
    -- Remove formatting
    v_cpf := regexp_replace(cpf, '[^0-9]', '', 'g');

    -- Must be 11 digits
    IF length(v_cpf) != 11 THEN
        RETURN FALSE;
    END IF;

    -- Reject all-same-digit (invalid)
    IF v_cpf ~ '^(\d)\1{10}$' THEN
        RETURN FALSE;
    END IF;

    -- Calculate first check digit
    v_sum := 0;
    FOR i IN 1..9 LOOP
        v_sum := v_sum + substring(v_cpf, i, 1)::INT * (11 - i);
    END LOOP;
    v_digit1 := 11 - (v_sum % 11);
    IF v_digit1 >= 10 THEN
        v_digit1 := 0;
    END IF;

    -- Verify first digit
    IF v_digit1 != substring(v_cpf, 10, 1)::INT THEN
        RETURN FALSE;
    END IF;

    -- Calculate second check digit
    v_sum := 0;
    FOR i IN 1..10 LOOP
        v_sum := v_sum + substring(v_cpf, i, 1)::INT * (12 - i);
    END LOOP;
    v_digit2 := 11 - (v_sum % 11);
    IF v_digit2 >= 10 THEN
        v_digit2 := 0;
    END IF;

    -- Verify second digit
    IF v_digit2 != substring(v_cpf, 11, 1)::INT THEN
        RETURN FALSE;
    END IF;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add CPF validation constraint
ALTER TABLE knowledge.clients
    DROP CONSTRAINT IF EXISTS clients_cpf_valid;

ALTER TABLE knowledge.clients
    ADD CONSTRAINT clients_cpf_valid
    CHECK (cpf IS NULL OR (length(regexp_replace(cpf, '[^0-9]', '', 'g')) = 11 AND validate_cpf(cpf)));

-- ═══════════════════════════════════════════════════════════
--  STEP 4: Email validation constraint (ReDoS protection)
-- ═══════════════════════════════════════════════════════════

ALTER TABLE intake_staging.leads
    DROP CONSTRAINT IF EXISTS leads_email_check;

ALTER TABLE intake_staging.leads
    ADD CONSTRAINT leads_email_check
    CHECK (
        email IS NULL OR (
            email ~ '^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,62}[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$'
            AND length(email) <= 254
            AND email NOT LIKE '%..'
            AND email NOT LIKE '.%'
            AND email NOT LIKE '%.'
        )
    );

-- ═══════════════════════════════════════════════════════════
--  STEP 5: Composite and partial indexes
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_conversations_chat_session_time
    ON knowledge.conversations (chat_id, session_id, timestamp);

CREATE INDEX IF NOT EXISTS idx_conversations_has_embedding
    ON knowledge.conversations (id)
    WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_storage_path
    ON knowledge.documents (storage_path);

-- ═══════════════════════════════════════════════════════════
--  STEP 6: total_messages trigger
-- ═══════════════════════════════════════════════════════════

-- Add total_messages column if not exists
ALTER TABLE knowledge.clients
    ADD COLUMN IF NOT EXISTS total_messages INT DEFAULT 0;

-- Function to update total_messages
CREATE OR REPLACE FUNCTION knowledge.update_total_messages()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Increment on insert
        UPDATE knowledge.clients
        SET total_messages = GREATEST(0, total_messages + 1)
        WHERE id = NEW.client_id;

    ELSIF TG_OP = 'DELETE' THEN
        -- Decrement on delete
        UPDATE knowledge.clients
        SET total_messages = GREATEST(0, total_messages - 1)
        WHERE id = OLD.client_id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Handle soft delete (deleted_at set)
        IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
            -- Soft delete: decrement
            UPDATE knowledge.clients
            SET total_messages = GREATEST(0, total_messages - 1)
            WHERE id = NEW.client_id;

        ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
            -- Un-delete: increment
            UPDATE knowledge.clients
            SET total_messages = GREATEST(0, total_messages + 1)
            WHERE id = NEW.client_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_update_total_messages ON knowledge.conversations;

CREATE TRIGGER trigger_update_total_messages
    AFTER INSERT OR UPDATE OR DELETE
    ON knowledge.conversations
    FOR EACH ROW
    EXECUTE FUNCTION knowledge.update_total_messages();

-- ═══════════════════════════════════════════════════════════
--  STEP 7: Backfill total_messages for existing clients
-- ═══════════════════════════════════════════════════════════

UPDATE knowledge.clients c
SET total_messages = (
    SELECT COUNT(*)
    FROM knowledge.conversations conv
    WHERE conv.client_id = c.id
    AND conv.deleted_at IS NULL
);

COMMIT;

-- Verify critical changes
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 013 complete';
    RAISE NOTICE '  - client_id foreign key added';
    RAISE NOTICE '  - CPF validation enabled';
    RAISE NOTICE '  - Email validation strengthened';
    RAISE NOTICE '  - Performance indexes created';
    RAISE NOTICE '  - total_messages trigger installed';
END $$;
