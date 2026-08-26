-- database/migrations/000_schema_migrations.sql
-- Migration tracking table (standard pattern)
-- This migration is idempotent and must be run first

BEGIN;

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by VARCHAR(100) DEFAULT CURRENT_USER,
    execution_time_ms INTEGER,
    checksum VARCHAR(64),

    CONSTRAINT schema_migrations_version_check CHECK (version ~ '^\d{3}_.*'),
    CONSTRAINT schema_migrations_execution_time_check CHECK (execution_time_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_version ON public.schema_migrations (version);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_applied_at ON public.schema_migrations (applied_at DESC);

COMMENT ON TABLE public.schema_migrations IS 'Tracks which database migrations have been applied';
COMMENT ON COLUMN public.schema_migrations.version IS 'Migration filename (e.g., 001_install_pgvector)';
COMMENT ON COLUMN public.schema_migrations.checksum IS 'SHA256 hash of migration file for integrity verification';

-- Function to record migration
CREATE OR REPLACE FUNCTION public.record_migration(
    p_version VARCHAR(50),
    p_name VARCHAR(200),
    p_execution_time_ms INTEGER DEFAULT NULL,
    p_checksum VARCHAR(64) DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum)
    VALUES (p_version, p_name, p_execution_time_ms, p_checksum)
    ON CONFLICT (version) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.record_migration IS 'Records a migration as applied (idempotent)';

COMMIT;
