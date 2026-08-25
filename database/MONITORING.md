# Database Monitoring & Alerting

## Overview

This document describes monitoring, alerting, and performance tracking for the OpenWA PostgreSQL database.

## Key Metrics to Monitor

### 1. Connection Health

```sql
-- Active connections
SELECT count(*) AS active_connections
FROM pg_stat_activity
WHERE state = 'active';

-- Idle connections
SELECT count(*) AS idle_connections
FROM pg_stat_activity
WHERE state = 'idle';

-- Max connections limit
SHOW max_connections;
```

**Alert Thresholds:**
- Warning: > 80% of max_connections
- Critical: > 95% of max_connections

### 2. Query Performance

```sql
-- Slow queries (longer than 5 seconds)
SELECT
    pid,
    now() - query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE state = 'active'
AND now() - query_start > interval '5 seconds'
ORDER BY duration DESC;

-- Long-running transactions
SELECT
    pid,
    now() - xact_start AS duration,
    state,
    query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
AND now() - xact_start > interval '1 minute'
ORDER BY duration DESC;
```

**Alert Thresholds:**
- Warning: Query > 30 seconds
- Critical: Query > 2 minutes
- Critical: Transaction > 5 minutes

### 3. Index Usage

```sql
-- Unused indexes (candidates for removal)
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Table scans (missing indexes)
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    seq_tup_read / seq_scan AS avg_seq_tup,
    pg_size_pretty(pg_relation_size(relid)) AS table_size
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 20;
```

**Alert Thresholds:**
- Warning: seq_scan > 10000 AND idx_scan = 0
- Warning: Unused index > 100MB

### 4. Index Bloat

```sql
-- Index bloat detection
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    round((100 * pg_relation_size(indexrelid) / NULLIF(pg_relation_size(relid), 0))::numeric, 2) AS index_ratio
FROM pg_stat_user_indexes
WHERE pg_relation_size(indexrelid) > 0
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;
```

**Alert Thresholds:**
- Warning: Index size > 2x table size
- Critical: Index size > 5x table size

### 5. Table Bloat

```sql
-- Table bloat estimation
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
    n_dead_tup,
    n_live_tup,
    round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;
```

**Alert Thresholds:**
- Warning: dead_ratio > 20%
- Critical: dead_ratio > 50%

### 6. Vacuum & Autovacuum

```sql
-- Last vacuum times
SELECT
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    vacuum_count,
    autovacuum_count,
    n_dead_tup,
    n_live_tup
FROM pg_stat_user_tables
ORDER BY last_autovacuum NULLS FIRST;
```

**Alert Thresholds:**
- Warning: No autovacuum in 7 days
- Critical: No autovacuum in 14 days

### 7. Database Size

```sql
-- Database size growth
SELECT
    pg_database.datname,
    pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname = 'openwa';

-- Schema sizes
SELECT
    schemaname,
    pg_size_pretty(sum(pg_total_relation_size(relid))) AS size
FROM pg_stat_user_tables
GROUP BY schemaname
ORDER BY sum(pg_total_relation_size(relid)) DESC;

-- Largest tables
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
    pg_size_pretty(pg_relation_size(relid)) AS table_size,
    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

**Alert Thresholds:**
- Warning: Database > 80% of disk capacity
- Critical: Database > 95% of disk capacity

### 8. Replication Lag (if using replication)

```sql
-- Replication lag in bytes
SELECT
    client_addr,
    state,
    pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS pending_bytes,
    pg_wal_lsn_diff(sent_lsn, write_lsn) AS write_lag_bytes,
    pg_wal_lsn_diff(write_lsn, flush_lsn) AS flush_lag_bytes,
    pg_wal_lsn_diff(flush_lsn, replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;
```

**Alert Thresholds:**
- Warning: Lag > 100MB
- Critical: Lag > 1GB

### 9. Lock Contention

```sql
-- Active locks
SELECT
    pg_stat_activity.pid,
    pg_stat_activity.usename,
    pg_locks.locktype,
    pg_locks.mode,
    pg_locks.granted,
    pg_stat_activity.query,
    now() - pg_stat_activity.query_start AS duration
FROM pg_locks
JOIN pg_stat_activity ON pg_locks.pid = pg_stat_activity.pid
WHERE NOT pg_locks.granted
ORDER BY duration DESC;

-- Blocking queries
SELECT
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS blocking_statement,
    now() - blocked_activity.query_start AS blocked_duration
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

**Alert Thresholds:**
- Warning: Lock wait > 10 seconds
- Critical: Lock wait > 60 seconds

### 10. pgvector-Specific Metrics

```sql
-- IVFFlat index build progress (if building)
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    idx_scan AS scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE indexrelname LIKE '%embedding%';

-- Vector query performance
SELECT
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%<=>'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Alert Thresholds:**
- Warning: Vector query > 500ms
- Critical: Vector query > 2s

## Monitoring Scripts

### Health Check Script

Create `/usr/local/bin/check_openwa_health.sh`:

```bash
#!/bin/bash
set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

# Check connection
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "CRITICAL: Cannot connect to database"
    exit 2
fi

# Check active connections
ACTIVE_CONN=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';")
MAX_CONN=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SHOW max_connections;")

CONN_PERCENT=$((100 * ACTIVE_CONN / MAX_CONN))
if [ $CONN_PERCENT -gt 95 ]; then
    echo "CRITICAL: Active connections at ${CONN_PERCENT}% (${ACTIVE_CONN}/${MAX_CONN})"
    exit 2
elif [ $CONN_PERCENT -gt 80 ]; then
    echo "WARNING: Active connections at ${CONN_PERCENT}% (${ACTIVE_CONN}/${MAX_CONN})"
    exit 1
fi

echo "OK: Database healthy (connections: ${ACTIVE_CONN}/${MAX_CONN})"
exit 0
```

### Performance Snapshot Script

```bash
#!/bin/bash
# /usr/local/bin/perf_snapshot.sh

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_DIR="/var/log/postgres/snapshots"
mkdir -p "$OUTPUT_DIR"

PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -p 5432 -U postgres -d openwa <<EOF > "$OUTPUT_DIR/perf_${TIMESTAMP}.txt"
\echo '=== Active Connections ==='
SELECT count(*) AS active_connections FROM pg_stat_activity WHERE state = 'active';

\echo '=== Slow Queries ==='
SELECT pid, now() - query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' AND now() - query_start > interval '5 seconds' ORDER BY duration DESC LIMIT 10;

\echo '=== Table Bloat ==='
SELECT schemaname, tablename, n_dead_tup, n_live_tup, round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio FROM pg_stat_user_tables WHERE n_dead_tup > 1000 ORDER BY n_dead_tup DESC LIMIT 10;

\echo '=== Database Size ==='
SELECT pg_size_pretty(pg_database_size('openwa')) AS size;
EOF

echo "Snapshot saved: $OUTPUT_DIR/perf_${TIMESTAMP}.txt"
```

## Integration with Monitoring Tools

### Prometheus Exporter

Install `postgres_exporter`:

```bash
docker run -d \
  --name postgres_exporter \
  -p 9187:9187 \
  -e DATA_SOURCE_NAME="postgresql://postgres:password@localhost:5432/openwa?sslmode=disable" \
  prometheuscommunity/postgres-exporter
```

### Grafana Dashboard

Import dashboard ID: 9628 (PostgreSQL Database)

Custom panels:
- Vector query performance
- IVFFlat index usage
- Lead intake rate
- Document processing queue

### Alerting Rules

```yaml
# alerting_rules.yml
groups:
  - name: openwa_database
    interval: 60s
    rules:
      - alert: HighConnectionCount
        expr: (pg_stat_activity_count{state="active"} / pg_settings_max_connections) > 0.8
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High connection count on OpenWA database"

      - alert: SlowQueries
        expr: pg_stat_activity_max_tx_duration > 300
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow queries detected (> 5 minutes)"

      - alert: HighTableBloat
        expr: pg_stat_user_tables_n_dead_tup > 100000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High table bloat detected"

      - alert: DatabaseSizeCritical
        expr: pg_database_size_bytes{datname="openwa"} > 100000000000  # 100GB
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Database size exceeds 100GB"
```

## Log Analysis

### Enable Query Logging

Edit `postgresql.conf`:

```conf
log_min_duration_statement = 1000  # Log queries > 1s
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
```

### Analyze Logs with pgBadger

```bash
pgbadger /var/log/postgresql/postgresql.log -o /var/www/html/pgbadger_report.html
```

## Scheduled Maintenance

### Daily Tasks (Cron)

```cron
# Backup (2 AM)
0 2 * * * /usr/local/bin/backup_openwa.sh

# Health check (every hour)
0 * * * * /usr/local/bin/check_openwa_health.sh

# Performance snapshot (every 6 hours)
0 */6 * * * /usr/local/bin/perf_snapshot.sh
```

### Weekly Tasks

```cron
# ANALYZE all tables (Sunday 3 AM)
0 3 * * 0 PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -p 5432 -U postgres -d openwa -c "ANALYZE;"

# Check for unused indexes (Sunday 4 AM)
0 4 * * 0 PGPASSWORD="$POSTGRES_PASSWORD" psql -h localhost -p 5432 -U postgres -d openwa -f /usr/local/bin/check_unused_indexes.sql
```

## Contact Information

- **On-Call DBA**: [contact]
- **Monitoring Dashboard**: [URL]
- **PagerDuty**: [integration key]
