-- database/migrations/001_install_pgvector.sql
-- Install pgvector extension for vector similarity search

BEGIN;

-- Check PostgreSQL version (must be 11+)
DO $$
BEGIN
    IF current_setting('server_version_num')::integer < 110000 THEN
        RAISE EXCEPTION 'PostgreSQL 11+ required. Current version: %', version();
    END IF;
END $$;

-- Install pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Verify installation
DO $$
DECLARE
    ext_version TEXT;
BEGIN
    SELECT extversion INTO ext_version
    FROM pg_extension
    WHERE extname = 'vector';

    IF ext_version IS NULL THEN
        RAISE EXCEPTION 'pgvector installation failed';
    END IF;

    RAISE NOTICE 'pgvector version % installed successfully', ext_version;
END $$;

COMMIT;
