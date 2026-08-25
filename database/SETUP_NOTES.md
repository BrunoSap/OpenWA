# Database Setup Notes - Task 2

## Issue: pgvector Extension Not Available

The current `openwa-postgres` container uses the `postgres:16-alpine` image, which does not include the pgvector extension.

## Solution Applied

Updated `docker-compose.yml` line 416:
```yaml
# OLD:
image: postgres:16-alpine

# NEW:
image: pgvector/pgvector:pg16-alpine
```

## Required Action

**The container must be recreated for the change to take effect:**

```bash
cd /Users/I531631/claude/Pessoal/OpenWA

# Stop and remove the current container
docker stop openwa-postgres
docker rm openwa-postgres

# Recreate with the new pgvector-enabled image
docker-compose up -d postgres

# Verify pgvector is available
docker exec openwa-postgres psql -U openwa -d openwa -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec openwa-postgres psql -U openwa -d openwa -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
```

## After Container Recreated

Run the migrations:
```bash
cd database/scripts
./run_migrations.sh
```

Or run directly via Docker:
```bash
docker exec openwa-postgres psql -U openwa -d openwa -f - < database/migrations/001_install_pgvector.sql
```

Run the tests:
```bash
docker exec openwa-postgres psql -U openwa -d openwa -f - < database/tests/test_schema_creation.sql
```

## Status

- ✅ Migration file created: `database/migrations/001_install_pgvector.sql`
- ✅ Test file created: `database/tests/test_schema_creation.sql`
- ✅ docker-compose.yml updated to use pgvector image
- ⏳ **BLOCKED**: Container recreation required (requires user permission)
