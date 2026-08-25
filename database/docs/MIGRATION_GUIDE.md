# Database Migration Guide

## Overview

Production-grade migration system with versioning, safety checks, and rollback support.

## Quick Start

```bash
# Run all migrations
./database/scripts/run_migrations_v2.sh

# Rollback (interactive)
./database/scripts/rollback_v2.sh

# Run tests
./database/tests/run_all_tests_v2.sh
```

## Migration System Features

### ✅ Fixed Issues from Task 1

1. **Migration Tracking & Versioning**
   - ✅ `schema_migrations` table tracks all applied migrations
   - ✅ Checksums detect file tampering
   - ✅ Idempotent migrations (can run multiple times safely)

2. **Timezone-Aware Timestamps**
   - ✅ All `TIMESTAMP` changed to `TIMESTAMPTZ`
   - ✅ Prevents bugs in multi-timezone deployments

3. **Row Level Security (RLS)**
   - ⚠️  Currently disabled (recommend enabling for multi-tenant)
   - See "Enabling RLS" section below

4. **Backup Strategy**
   - ✅ Automatic backup before migrations
   - ✅ Backups stored in `database/backups/`
   - ✅ Rollback with restore capability

5. **Database Roles**
   - ✅ `openwa_app` - Application role (read/write)
   - ✅ `openwa_readonly` - Analytics role (read-only)
   - ✅ `openwa_migration` - Migration role (DDL)

6. **Security Fixes**
   - ✅ CPF format validation (`^\d{11}$`)
   - ✅ Phone format validation
   - ✅ SQL injection prevention in validation scripts
   - ✅ Audit logging for sensitive tables

7. **Performance Improvements**
   - ✅ IVFFlat index with dynamic lists parameter
   - ✅ `ivfflat.probes` configuration documented
   - ✅ Composite indexes for common queries
   - ✅ VACUUM ANALYZE after migrations

8. **Reliability**
   - ✅ Migration locking (prevents concurrent runs)
   - ✅ Pre-flight checks (connectivity, version, disk space)
   - ✅ Comprehensive test suite (edge cases, race conditions)

9. **Scalability**
   - ⚠️  Still using `SERIAL` (recommend `BIGSERIAL` for production)
   - See "Upgrading to BIGSERIAL" section below

## Migration Files

Migrations are numbered and run in order:

```
000_migration_system.sql        - Migration tracking infrastructure
001_install_pgvector.sql        - pgvector extension
002_create_schema_knowledge.sql - Conversations, clients, docs, FAQ
003_create_schema_intake_staging.sql - Lead intake
004_create_schema_telegram.sql  - Telegram state
005_create_schema_bot_config.sql - Bot configuration
006_create_helper_functions.sql - Utility functions
007_seed_data.sql               - Initial data
```

## Running Migrations

### Development

```bash
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=openwa
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password

./database/scripts/run_migrations_v2.sh
```

### Production

```bash
# Use migration role
export POSTGRES_USER=openwa_migration
export POSTGRES_PASSWORD=<secure_password>

# Run with logging
./database/scripts/run_migrations_v2.sh 2>&1 | tee migration_$(date +%Y%m%d).log
```

### Pre-Flight Checks

The migration runner automatically checks:
- ✅ Database connectivity
- ✅ PostgreSQL version (11+)
- ✅ Disk space (1GB+ free)
- ✅ Migration directory exists

### Migration Tracking

After migrations run, check status:

```sql
SELECT version, name, applied_at, execution_time_ms
FROM public.schema_migrations
ORDER BY applied_at DESC;
```

## Rollback

### Interactive Rollback

```bash
./database/scripts/rollback_v2.sh
```

Options:
1. Full rollback (DROP all schemas + pgvector)
2. Rollback specific schema
3. Restore from backup
4. List backups

### Automated Rollback

```bash
# Full rollback with confirmation
./database/scripts/rollback_v2.sh --full

# Restore from specific backup
./database/scripts/rollback_v2.sh --restore database/backups/pre_rollback_20260825_120000.sql

# List available backups
./database/scripts/rollback_v2.sh --list-backups
```

### Safety Features

- ✅ Automatic backup before rollback
- ✅ Confirmation required for destructive operations
- ✅ Backup path shown after rollback
- ✅ Restore instructions provided

## Testing

### Quick Test

```bash
./database/tests/run_all_tests_v2.sh
```

### Test Suites

1. **Schema Creation** - Tables, constraints, indexes
2. **Helper Functions** - SQL functions work correctly
3. **Seed Data** - Fixtures load successfully
4. **Comprehensive Tests** - Edge cases, race conditions
5. **Performance Tests** - pgvector query speed

### Comprehensive Tests Include

- ✅ TIMESTAMPTZ verification
- ✅ SERIAL vs BIGSERIAL check
- ✅ Row Level Security status
- ✅ Audit logging verification
- ✅ Database roles check
- ✅ CPF validation
- ✅ Race condition handling
- ✅ Soft delete functionality
- ✅ Index coverage
- ✅ Foreign key cascades

### Performance Validation

```bash
# Secure version with no SQL injection
python3 database/scripts/validate_performance_v2.py
```

Tests:
- Insert 1000 embeddings
- Run 100 similarity searches
- Measure avg, P95, P99 latency
- Validate < 50ms target

## Enabling Row Level Security (RLS)

For multi-tenant deployments:

```sql
-- Enable RLS on clients table
ALTER TABLE knowledge.clients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY client_isolation_policy ON knowledge.clients
    FOR ALL
    USING (chat_id = current_setting('app.current_chat_id', TRUE));

-- Set context before queries
SET app.current_chat_id = '5511999999999@c.us';
```

## Upgrading to BIGSERIAL

For tables expecting > 2.1B rows:

```sql
-- Upgrade id column from INTEGER to BIGINT
ALTER TABLE knowledge.conversations ALTER COLUMN id TYPE BIGINT;
ALTER TABLE knowledge.clients ALTER COLUMN id TYPE BIGINT;
ALTER TABLE knowledge.documents ALTER COLUMN id TYPE BIGINT;
-- ... repeat for other tables
```

## Backup & Recovery

### Manual Backup

```bash
pg_dump -h localhost -U postgres -d openwa -F c -f backup_$(date +%Y%m%d).sql
```

### Automated Backup (Cron)

```bash
# Add to crontab
0 2 * * * /path/to/database/scripts/backup.sh
```

### Restore from Backup

```bash
pg_restore -h localhost -U postgres -d openwa -c backup_20260825.sql
```

## Maintenance

### Vacuum & Analyze

After bulk operations:

```sql
VACUUM ANALYZE knowledge.conversations;
VACUUM ANALYZE knowledge.clients;
```

### Rebuild Vector Indexes

When data grows significantly:

```sql
-- Drop old index
DROP INDEX knowledge.idx_conversations_embedding;

-- Calculate optimal lists (sqrt of row count)
SELECT CEIL(SQRT(COUNT(*)))::INT AS optimal_lists
FROM knowledge.conversations
WHERE embedding IS NOT NULL;

-- Recreate with new lists parameter
CREATE INDEX idx_conversations_embedding
ON knowledge.conversations
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 316);  -- Use calculated value
```

### Tune IVFFlat Performance

```sql
-- Default probes (searches 1 list)
SET ivfflat.probes = 1;  -- Fast, lower recall

-- Balanced (searches 10 lists)
SET ivfflat.probes = 10;  -- Balanced

-- High accuracy (searches 50 lists)
SET ivfflat.probes = 50;  -- Slow, high recall
```

## Troubleshooting

### Migration Locked

```sql
-- Check lock status
SELECT * FROM public.migration_lock;

-- Force release (only if process died)
DELETE FROM public.migration_lock;
```

### Migration Failed

```bash
# Check log file
tail -n 50 /tmp/openwa_migrations.log

# Restore from backup
pg_restore -h localhost -U postgres -d openwa -c database/backups/openwa_backup_20260825_120000.sql
```

### Performance Issues

```bash
# Run performance validation
python3 database/scripts/validate_performance_v2.py

# Check index usage
psql -c "SELECT schemaname, tablename, indexname, idx_scan FROM pg_stat_user_indexes WHERE schemaname = 'knowledge' ORDER BY idx_scan;"
```

### SQL Injection Concerns

All validation scripts use parameterized queries:

```python
# SECURE ✅
cursor.execute("SELECT * FROM table WHERE id = %s", (user_id,))

# INSECURE ❌
cursor.execute(f"SELECT * FROM table WHERE id = {user_id}")
```

## Best Practices

1. **Always backup before migrations** - Automatic in v2 runner
2. **Test migrations on staging first** - Never test in production
3. **Use migration role** - Don't run as superuser
4. **Monitor execution time** - Tracked in schema_migrations
5. **Run VACUUM ANALYZE** - After bulk operations
6. **Set password policy** - Rotate role passwords regularly
7. **Enable SSL** - For production database connections
8. **Limit connection pool** - Avoid exhausting connections

## Security Checklist

- [ ] Database roles configured
- [ ] Passwords rotated regularly
- [ ] SSL/TLS enabled
- [ ] Firewall rules in place
- [ ] Audit logging enabled
- [ ] Backup encryption configured
- [ ] Row Level Security enabled (if multi-tenant)
- [ ] Sensitive data encrypted at rest

## Performance Checklist

- [ ] Indexes created on all foreign keys
- [ ] Composite indexes for common queries
- [ ] Vector indexes built with optimal lists
- [ ] ivfflat.probes configured
- [ ] VACUUM ANALYZE scheduled
- [ ] Connection pooling configured
- [ ] Query performance monitored

## Disaster Recovery

### Scenario 1: Database Corruption

```bash
# Restore from last backup
./database/scripts/rollback_v2.sh --restore database/backups/latest.sql
```

### Scenario 2: Migration Went Wrong

```bash
# Interactive rollback with backup
./database/scripts/rollback_v2.sh
# Choose option 3: Restore from backup
```

### Scenario 3: Data Loss

```bash
# Point-in-time recovery (if WAL archiving enabled)
pg_restore -t <timestamp> ...
```

## Support

For issues or questions:
1. Check migration logs in `/tmp/openwa_migrations.log`
2. Review test output from `run_all_tests_v2.sh`
3. Check database status: `./database/scripts/rollback_v2.sh` → option 5
4. Consult PostgreSQL logs

## Changelog

### v2.0 (2026-08-25) - Task 1 Fixes
- ✅ Migration tracking system
- ✅ All TIMESTAMP → TIMESTAMPTZ
- ✅ Backup before migrations
- ✅ Database roles and grants
- ✅ CPF/phone validation
- ✅ SQL injection fixes
- ✅ Audit logging
- ✅ Performance optimizations
- ✅ Comprehensive test suite
- ✅ Migration locking
- ✅ Pre-flight checks
- ✅ Interactive rollback

### v1.0 (Initial)
- Basic migration runner
- Schema creation
- Simple rollback
