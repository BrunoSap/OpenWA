# OpenWA Database Schema V2

Production-ready PostgreSQL database with pgvector, comprehensive indexes, and automatic migration tracking.

## 🚀 Quick Start

```bash
# 1. Install PostgreSQL 15+ with pgvector
brew install postgresql@15 pgvector

# 2. Start PostgreSQL
brew services start postgresql@15

# 3. Create database
createdb openwa

# 4. Set environment variables
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_DB=openwa
export POSTGRES_USER=postgres
export POSTGRES_PASSWORD=your_password

# 5. Run migrations
cd database/scripts
./run_migrations_v2.sh
```

## 📁 Schema Overview

### Schemas and Tables

| Schema | Tables | Purpose |
|--------|--------|---------|
| `knowledge` | conversations, clients, documents, faq, session_context | Core knowledge base with embeddings |
| `intake_staging` | leads, lead_documents, lawapp_sync_queue, document_reminders | Lead intake before LawApp sync |
| `telegram` | client_tasks | Telegram bot task management |
| `bot_config` | auto_answer_rules, cron_jobs, fee_parameters, embedding_config | Bot configuration |

### Key Features

✅ **Automatic timestamp management** (updated_at triggers)  
✅ **Vector similarity search** (pgvector IVFFlat indexes)  
✅ **JSONB query optimization** (GIN indexes)  
✅ **Webhook deduplication** (unique constraints)  
✅ **Migration tracking** (schema_migrations table)  
✅ **Configuration-driven fees** (no hardcoded business logic)  
✅ **ReDoS-safe validation** (improved regex patterns)  
✅ **Partial indexes** (optimized for common queries)

## 🔧 Configuration

### Fee Parameters

Fees are now **configuration-driven** instead of hardcoded:

```sql
SELECT * FROM bot_config.fee_parameters;

-- Update UAD value
UPDATE bot_config.fee_parameters
SET parameter_value = 165.50
WHERE parameter_name = 'uad_value_brl';
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `uad_value_brl` | 159.21 | UAD value in BRL (R$) |
| `atrasados_percent` | 30.0 | Backpay fee percentage |
| `vincendas_percent` | 30.0 | Future benefits percentage |
| `default_uad_count` | 60 | Default UAD estimate |
| `parcelamento_10x_percent` | 40.0 | Down payment for 10x |
| `parcelamento_15x_percent` | 40.0 | Down payment for 15x |

### Embedding Models

Track embedding model configuration (dimension is hardcoded in VECTOR columns):

```sql
SELECT * FROM bot_config.embedding_config WHERE is_active = true;

-- To switch models, you must ALTER TABLE all vector columns
-- Example: ALTER TABLE knowledge.conversations ALTER COLUMN embedding TYPE vector(3072);
```

## 📊 Performance Optimization

### Vector Index Tuning

IVFFlat indexes were created with **estimated** cluster counts:
- `idx_conversations_embedding`: 100 lists (~10k rows expected)
- `idx_faq_embedding`: 10 lists (~50 rows expected)

**After data insertion**, rebuild indexes with optimal cluster count:

```sql
-- Calculate optimal lists = sqrt(rows)
SELECT SQRT(COUNT(*))::INT AS optimal_lists FROM knowledge.conversations;

-- Rebuild index
DROP INDEX knowledge.idx_conversations_embedding;
CREATE INDEX idx_conversations_embedding
ON knowledge.conversations
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- Replace 100 with optimal_lists
```

### Connection Pooling

For production with 100+ concurrent connections, use **PgBouncer**:

```bash
# Install PgBouncer
brew install pgbouncer

# Configure /usr/local/etc/pgbouncer.ini
[databases]
openwa = host=localhost port=5432 dbname=openwa

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
auth_type = md5
auth_file = /usr/local/etc/pgbouncer_users.txt
pool_mode = transaction
max_client_conn = 100
default_pool_size = 20
```

PostgreSQL direct connections max out at ~200-300. PgBouncer handles 100+ with 20 backend connections.

### PostgreSQL Configuration

Recommended `postgresql.conf` tuning:

```conf
# Connection
max_connections = 200

# Memory
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 128MB
work_mem = 16MB

# Query Planner
random_page_cost = 1.1  # For SSD
effective_io_concurrency = 200  # For SSD

# WAL
wal_buffers = 16MB
checkpoint_completion_target = 0.9

# Vacuum
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 60s
```

## 🧪 Testing

### Run All Tests

```bash
cd database/tests
./run_all_tests.sh
```

### Individual Test Suites

```bash
# Schema creation and constraints
psql -h localhost -U postgres -d openwa -f test_schema_creation.sql

# Constraint validation (edge cases)
psql -h localhost -U postgres -d openwa -f test_constraint_validation.sql

# Helper functions
psql -h localhost -U postgres -d openwa -f test_helper_functions.sql

# Performance validation
python3 validate_performance.py
```

### Test Coverage

| Test Suite | Coverage |
|------------|----------|
| `test_schema_creation.sql` | Basic constraints, foreign keys |
| `test_constraint_validation.sql` | Edge cases (negative values, NULL handling, duplicates) |
| `test_helper_functions.sql` | SQL functions, fee calculation |
| `validate_performance.py` | Query performance, EXPLAIN ANALYZE, index usage |

## 🔄 Migration Management

### Migration Tracking

All migrations are tracked in `public.schema_migrations`:

```sql
-- View migration history
SELECT version, description, applied_at, execution_time_ms
FROM public.schema_migrations
ORDER BY applied_at DESC;

-- Check if migration was applied
SELECT EXISTS(
    SELECT 1 FROM public.schema_migrations
    WHERE version = '20260825110700_fix_critical_issues'
);
```

### Migration File Naming

Migrations use **timestamp-based naming** to prevent conflicts in team environments:

```
20260825110700_fix_critical_issues.sql
20260825110800_create_migration_tracking.sql
20260825110900_improve_helper_functions.sql
```

Format: `{timestamp}_{description}.sql`

### Safe Migration Execution

The migration runner (`run_migrations_v2.sh`) is **idempotent**:
- ✅ Skips already-applied migrations
- ✅ Records execution time and checksums
- ✅ Detects schema_migrations table creation
- ✅ Sorts by timestamp (not filename alphabetically)

```bash
# Run multiple times safely
./run_migrations_v2.sh  # First run: applies all
./run_migrations_v2.sh  # Second run: skips already applied
```

## 🔙 Rollback and Recovery

### Full Rollback

```bash
cd database/scripts
./rollback_v2.sh
```

**Features:**
- ✅ Pre-rollback backup (automatic)
- ✅ Database status inspection
- ✅ CASCADE warnings
- ✅ Confirmation prompts
- ✅ Backup restoration

### Manual Backup

```bash
# Create backup
pg_dump -h localhost -U postgres -d openwa -F c -f backup_$(date +%Y%m%d).sql

# Restore backup
pg_restore -h localhost -U postgres -d openwa -c backup_20260825.sql
```

### Backup Strategy (Production)

| RTO | RPO | Strategy |
|-----|-----|----------|
| 4 hours | 15 minutes | Continuous WAL archiving + daily base backups |
| 1 hour | 5 minutes | Streaming replication + pg_basebackup |
| 30 minutes | 1 minute | Synchronous replication + automated failover |

**Recommended setup:**

```sql
-- Enable WAL archiving (postgresql.conf)
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backups/wal/%f && cp %p /backups/wal/%f'

-- Schedule pg_cron backups
CREATE EXTENSION pg_cron;
SELECT cron.schedule('daily-backup', '0 3 * * *', 
    'pg_dump -Fc openwa > /backups/daily/openwa_$(date +\%Y\%m\%d).sql'
);
```

## 🐛 Troubleshooting

### pgvector Installation Failed

**macOS (Homebrew):**
```bash
brew install pgvector

# If PostgreSQL installed via Postgres.app, build from source:
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make PG_CONFIG=/Applications/Postgres.app/Contents/Versions/latest/bin/pg_config
make install PG_CONFIG=/Applications/Postgres.app/Contents/Versions/latest/bin/pg_config
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install postgresql-15-pgvector
```

### Permission Denied on Triggers

```
ERROR: permission denied to create trigger
```

**Solution:** Grant trigger privileges:
```sql
GRANT TRIGGER ON ALL TABLES IN SCHEMA knowledge TO your_user;
GRANT TRIGGER ON ALL TABLES IN SCHEMA intake_staging TO your_user;
```

### Vector Index Not Used in Queries

```sql
-- Force index usage
SET enable_seqscan = off;

-- Check if index exists
SELECT * FROM pg_indexes WHERE indexname LIKE '%embedding%';

-- Run ANALYZE to update statistics
ANALYZE knowledge.conversations;
ANALYZE knowledge.faq;
```

### Migration Tracking Table Missing

If you ran old migrations before adding tracking:

```bash
# Run only the tracking migration
psql -h localhost -U postgres -d openwa -f migrations/20260825110800_create_migration_tracking.sql

# Re-run migration script (will skip already-applied migrations)
./run_migrations_v2.sh
```

### Connection Pool Exhaustion

```
FATAL: sorry, too many clients already
```

**Immediate fix:**
```sql
-- Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < NOW() - INTERVAL '10 minutes';
```

**Long-term fix:** Install PgBouncer (see Performance Optimization section)

### Slow JSONB Queries

```sql
-- Check if GIN index is used
EXPLAIN ANALYZE
SELECT * FROM intake_staging.leads
WHERE case_data->>'age' = '65';

-- If sequential scan, rebuild index
REINDEX INDEX intake_staging.idx_leads_case_data_gin;
```

## 📈 Monitoring

### Essential Queries

```sql
-- Table sizes
SELECT schemaname, tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT schemaname, tablename, indexname,
       idx_scan AS index_scans,
       idx_tup_read AS tuples_read,
       idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname IN ('knowledge', 'intake_staging')
ORDER BY idx_scan DESC;

-- Slow queries (requires pg_stat_statements)
SELECT query, calls, total_exec_time, mean_exec_time
FROM pg_stat_statements
WHERE query LIKE '%knowledge%' OR query LIKE '%intake_staging%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Connection count
SELECT COUNT(*), state
FROM pg_stat_activity
GROUP BY state;
```

## 🔐 Security Best Practices

### Principle of Least Privilege

```sql
-- Create read-only user
CREATE USER openwa_readonly WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE openwa TO openwa_readonly;
GRANT USAGE ON SCHEMA knowledge, intake_staging, telegram, bot_config TO openwa_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA knowledge, intake_staging, telegram, bot_config TO openwa_readonly;

-- Create application user (read/write, no DDL)
CREATE USER openwa_app WITH PASSWORD 'secure_password';
GRANT CONNECT ON DATABASE openwa TO openwa_app;
GRANT USAGE ON SCHEMA knowledge, intake_staging, telegram, bot_config TO openwa_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA knowledge, intake_staging, telegram, bot_config TO openwa_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA knowledge, intake_staging, telegram, bot_config TO openwa_app;
```

### Audit Logging

```sql
-- Enable query logging (postgresql.conf)
log_statement = 'mod'  # Log all INSERT/UPDATE/DELETE
log_duration = on
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

-- Install pgAudit for detailed auditing
CREATE EXTENSION pgaudit;
SET pgaudit.log = 'write, ddl';
```

## 📚 Additional Resources

- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Tuning_Your_PostgreSQL_Server)
- [pgvector Documentation](https://github.com/pgvector/pgvector)
- [PgBouncer Setup Guide](https://www.pgbouncer.org/)
- [Database Migration Best Practices](https://www.liquibase.org/get-started/best-practices)

## 📝 Change Log

### V2 (2026-08-25) - Production Hardening

**CRITICAL Fixes:**
- ✅ Added updated_at triggers (automatic timestamp management)
- ✅ Fixed ReDoS-vulnerable email validation
- ✅ Added GIN indexes for JSONB queries
- ✅ Added unique constraint for webhook deduplication

**HIGH Priority:**
- ✅ Migration tracking system (schema_migrations table)
- ✅ Partial indexes for common queries
- ✅ Comprehensive index comments

**LOW Priority:**
- ✅ Configuration-driven fee calculation
- ✅ Embedding model tracking
- ✅ Enhanced rollback script with backups
- ✅ Improved error handling in functions
- ✅ Timestamp-based migration naming
- ✅ Connection pooling documentation

**Test Coverage:**
- ✅ Edge case constraint validation
- ✅ EXPLAIN ANALYZE performance tests
- ✅ Trigger verification
- ✅ Index usage validation

### V1 (2026-08-22) - Initial Schema

- Basic schema structure (4 schemas, 14 tables)
- pgvector integration
- Helper functions (find_similar_faq, calculate_fees)
- Seed data

## 🤝 Contributing

When adding new migrations:

1. Use timestamp prefix: `$(date +%Y%m%d%H%M%S)_description.sql`
2. Wrap in BEGIN/COMMIT transaction
3. Record in schema_migrations table
4. Add comments to new indexes
5. Update this README
6. Run test suite

Example:

```sql
-- migrations/20260825120000_add_feature.sql
BEGIN;

-- Your changes here
CREATE TABLE ...;

-- Record migration
INSERT INTO public.schema_migrations (version, description)
VALUES ('20260825120000_add_feature', 'Add new feature XYZ')
ON CONFLICT (version) DO NOTHING;

COMMIT;
```
