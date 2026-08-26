-- database/migrations/000_migration_system.sql
-- Migration tracking and versioning system
-- This MUST be run before any other migrations

BEGIN;

-- ═══════════════════════════════════════════════════════════
--  MIGRATION TRACKING TABLE
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id BIGSERIAL PRIMARY KEY,
    version VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,

    -- Execution tracking
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    execution_time_ms INT NOT NULL,

    -- Checksum for migration file integrity
    checksum VARCHAR(64) NOT NULL,

    -- Rollback support
    rolled_back BOOLEAN DEFAULT FALSE,
    rolled_back_at TIMESTAMPTZ,

    -- Metadata
    applied_by VARCHAR(100) DEFAULT CURRENT_USER,
    notes TEXT,

    CONSTRAINT schema_migrations_execution_time_check CHECK (execution_time_ms >= 0)
);

CREATE INDEX idx_schema_migrations_version ON public.schema_migrations (version);
CREATE INDEX idx_schema_migrations_applied_at ON public.schema_migrations (applied_at DESC);
CREATE INDEX idx_schema_migrations_rolled_back ON public.schema_migrations (rolled_back);

COMMENT ON TABLE public.schema_migrations IS 'Migration tracking with versioning and rollback support';
COMMENT ON COLUMN public.schema_migrations.checksum IS 'SHA256 of migration file to detect tampering';

-- ═══════════════════════════════════════════════════════════
--  MIGRATION LOCK TABLE (Prevents concurrent runs)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.migration_lock (
    lock_id INT PRIMARY KEY DEFAULT 1,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_by VARCHAR(100) NOT NULL DEFAULT CURRENT_USER,
    process_id INT,

    CONSTRAINT migration_lock_single_row CHECK (lock_id = 1)
);

COMMENT ON TABLE public.migration_lock IS 'Advisory lock to prevent concurrent migration execution';

-- ═══════════════════════════════════════════════════════════
--  DATABASE ROLES AND GRANTS
-- ═══════════════════════════════════════════════════════════

-- Application role (read/write, no DDL)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'openwa_app') THEN
        CREATE ROLE openwa_app WITH LOGIN PASSWORD NULL;
        RAISE NOTICE 'Created role: openwa_app (set password via ALTER ROLE)';
    ELSE
        RAISE NOTICE 'Role openwa_app already exists';
    END IF;
END $$;

-- Read-only role (analytics, reporting)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'openwa_readonly') THEN
        CREATE ROLE openwa_readonly WITH LOGIN PASSWORD NULL;
        RAISE NOTICE 'Created role: openwa_readonly (set password via ALTER ROLE)';
    ELSE
        RAISE NOTICE 'Role openwa_readonly already exists';
    END IF;
END $$;

-- Migration role (DDL only, used by CI/CD)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'openwa_migration') THEN
        CREATE ROLE openwa_migration WITH LOGIN PASSWORD NULL;
        RAISE NOTICE 'Created role: openwa_migration (set password via ALTER ROLE)';
    ELSE
        RAISE NOTICE 'Role openwa_migration already exists';
    END IF;
END $$;

-- Grant permissions
GRANT CONNECT ON DATABASE CURRENT_DATABASE() TO openwa_app, openwa_readonly, openwa_migration;

-- Migration role can create schemas and extensions
GRANT CREATE ON DATABASE CURRENT_DATABASE() TO openwa_migration;

COMMENT ON ROLE openwa_app IS 'Application role: read/write data, no schema changes';
COMMENT ON ROLE openwa_readonly IS 'Read-only role: SELECT only for analytics/reporting';
COMMENT ON ROLE openwa_migration IS 'Migration role: DDL operations for schema changes';

-- ═══════════════════════════════════════════════════════════
--  HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════

-- Function to acquire migration lock
CREATE OR REPLACE FUNCTION public.acquire_migration_lock()
RETURNS BOOLEAN AS $$
DECLARE
    lock_acquired BOOLEAN;
BEGIN
    -- Try to insert lock row (will fail if already locked)
    BEGIN
        INSERT INTO public.migration_lock (lock_id, locked_at, locked_by, process_id)
        VALUES (1, NOW(), CURRENT_USER, pg_backend_pid());

        RAISE NOTICE 'Migration lock acquired by % (PID %)', CURRENT_USER, pg_backend_pid();
        RETURN TRUE;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE WARNING 'Migration lock already held. Check public.migration_lock table.';
            RETURN FALSE;
    END;
END;
$$ LANGUAGE plpgsql;

-- Function to release migration lock
CREATE OR REPLACE FUNCTION public.release_migration_lock()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.migration_lock WHERE lock_id = 1;
    RAISE NOTICE 'Migration lock released';
END;
$$ LANGUAGE plpgsql;

-- Function to check if migration was already applied
CREATE OR REPLACE FUNCTION public.is_migration_applied(p_version VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM public.schema_migrations
    WHERE version = p_version AND NOT rolled_back;

    RETURN v_count > 0;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- Record this migration
DO $$
BEGIN
    IF NOT public.is_migration_applied('000_migration_system') THEN
        INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum)
        VALUES ('000_migration_system', 'Migration tracking system', 0, 'PLACEHOLDER');
        RAISE NOTICE 'Migration 000_migration_system applied';
    END IF;
END $$;
