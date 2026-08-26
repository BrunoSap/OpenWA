-- database/migrations/rollback/003_rollback_intake_staging_fixes.sql
-- ROLLBACK script for migration 003_fix_intake_staging_critical_issues.sql
-- WARNING: This will remove all fixes applied in migration 003. Use with caution.

BEGIN;

\echo '════════════════════════════════════════════════════════════════'
\echo '⚠️  ROLLING BACK Migration 003 Fixes'
\echo '════════════════════════════════════════════════════════════════'

-- Drop performance indexes
DROP INDEX IF EXISTS intake_staging.idx_lawapp_sync_queue_attempts;
DROP INDEX IF EXISTS intake_staging.idx_lead_documents_file_name;
DROP INDEX IF EXISTS intake_staging.idx_leads_phone;
DROP INDEX IF EXISTS intake_staging.idx_leads_email;
DROP INDEX IF EXISTS intake_staging.idx_leads_priority_queue;
DROP INDEX IF EXISTS intake_staging.idx_leads_case_data_gin;

RAISE NOTICE '✅ Dropped 6 performance indexes';

-- Drop foreign key constraints
ALTER TABLE intake_staging.lead_documents
DROP CONSTRAINT IF EXISTS lead_documents_document_type_fkey;

ALTER TABLE intake_staging.leads
DROP CONSTRAINT IF EXISTS leads_case_type_fkey;

RAISE NOTICE '✅ Dropped foreign key constraints';

-- Drop array size constraints
ALTER TABLE intake_staging.leads
DROP CONSTRAINT IF EXISTS leads_documents_collected_size_check;

ALTER TABLE intake_staging.leads
DROP CONSTRAINT IF EXISTS leads_documents_missing_size_check;

RAISE NOTICE '✅ Dropped array size constraints';

-- Drop version column and trigger
DROP TRIGGER IF EXISTS trigger_increment_version ON intake_staging.leads;
DROP FUNCTION IF EXISTS intake_staging.increment_version();

ALTER TABLE intake_staging.leads
DROP COLUMN IF EXISTS version;

RAISE NOTICE '✅ Dropped version column and trigger';

-- Revert audit trigger to original (without SOFT_DELETE detection)
CREATE OR REPLACE FUNCTION intake_staging.audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data, new_data)
        VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO intake_staging.audit_log (table_name, record_id, operation, old_data)
        VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', row_to_json(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Revert audit_log operation constraint
ALTER TABLE intake_staging.audit_log
DROP CONSTRAINT IF EXISTS audit_log_operation_check;

ALTER TABLE intake_staging.audit_log
ADD CONSTRAINT audit_log_operation_check CHECK (
    operation IN ('INSERT', 'UPDATE', 'DELETE')
);

RAISE NOTICE '✅ Reverted audit trigger (removed SOFT_DELETE detection)';

-- Drop reference tables (CASCADE will remove FKs)
DROP TABLE IF EXISTS intake_staging.document_types CASCADE;
DROP TABLE IF EXISTS intake_staging.case_types CASCADE;

RAISE NOTICE '✅ Dropped reference tables';

-- Remove migration record
DELETE FROM public.migration_log
WHERE migration_name = '003_fix_intake_staging_critical_issues';

RAISE NOTICE '✅ Removed migration record';

COMMIT;

\echo ''
\echo '════════════════════════════════════════════════════════════════'
\echo '✅ Migration 003 Fixes Rolled Back Successfully'
\echo '════════════════════════════════════════════════════════════════'
\echo '⚠️  WARNING: The following were removed:'
\echo '  ├─ 2 reference tables (case_types, document_types)'
\echo '  ├─ 2 foreign key constraints'
\echo '  ├─ 1 version column'
\echo '  ├─ 2 array size constraints'
\echo '  ├─ 6 performance indexes'
\echo '  └─ SOFT_DELETE audit detection'
\echo ''
\echo '📝 To re-apply:'
\echo '  Run: database/migrations/003_fix_intake_staging_critical_issues.sql'
\echo '════════════════════════════════════════════════════════════════'
