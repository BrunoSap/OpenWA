# Backup & Restore Procedures

## Overview

This document describes backup, restore, and disaster recovery procedures for the OpenWA PostgreSQL database.

## Backup Strategy

### Full Database Backup

```bash
# Backup entire database
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    -F c \
    -b \
    -v \
    -f "openwa_backup_$(date +%Y%m%d_%H%M%S).dump"
```

**Options:**
- `-F c`: Custom format (compressed, supports selective restore)
- `-b`: Include large objects
- `-v`: Verbose output

### Schema-Only Backup

```bash
# Backup only schema (no data)
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    --schema-only \
    -f "openwa_schema_$(date +%Y%m%d_%H%M%S).sql"
```

### Data-Only Backup

```bash
# Backup only data (no schema)
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    --data-only \
    -F c \
    -f "openwa_data_$(date +%Y%m%d_%H%M%S).dump"
```

### Per-Schema Backup

```bash
# Backup specific schema
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    -n knowledge \
    -F c \
    -f "openwa_knowledge_$(date +%Y%m%d_%H%M%S).dump"
```

## Restore Procedures

### Full Database Restore

```bash
# Drop existing database (⚠️ DESTRUCTIVE)
PGPASSWORD="$POSTGRES_PASSWORD" dropdb -h localhost -p 5432 -U postgres openwa

# Create fresh database
PGPASSWORD="$POSTGRES_PASSWORD" createdb -h localhost -p 5432 -U postgres openwa

# Restore from backup
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    -v \
    openwa_backup_20260825_120000.dump
```

### Selective Table Restore

```bash
# Restore specific table
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    -t knowledge.conversations \
    -v \
    openwa_backup_20260825_120000.dump
```

### Schema-Only Restore

```bash
# Restore only schema definitions
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    --schema-only \
    -v \
    openwa_backup_20260825_120000.dump
```

## Automated Backup Script

### Setup Daily Backups

Create `/usr/local/bin/backup_openwa.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/postgres/openwa"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/openwa_backup_$TIMESTAMP.dump"

# Full backup
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h localhost -p 5432 -U postgres \
    -d openwa \
    -F c -b -v \
    -f "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Delete backups older than retention period
find "$BACKUP_DIR" -name "openwa_backup_*.dump.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: ${BACKUP_FILE}.gz"
```

### Setup Cron Job

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /usr/local/bin/backup_openwa.sh >> /var/log/openwa_backup.log 2>&1
```

## Point-in-Time Recovery (PITR)

### Enable WAL Archiving

Edit `postgresql.conf`:

```conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /var/lib/postgresql/wal_archive/%f && cp %p /var/lib/postgresql/wal_archive/%f'
max_wal_senders = 3
wal_keep_size = 1GB
```

### Create Base Backup

```bash
PGPASSWORD="$POSTGRES_PASSWORD" pg_basebackup \
    -h localhost -p 5432 -U postgres \
    -D /var/backups/postgres/base \
    -F tar -z -P
```

### Restore to Point in Time

1. Stop PostgreSQL
2. Replace data directory with base backup
3. Create `recovery.conf`:

```conf
restore_command = 'cp /var/lib/postgresql/wal_archive/%f %p'
recovery_target_time = '2026-08-25 12:00:00'
```

4. Start PostgreSQL

## Disaster Recovery Checklist

### In Case of Data Loss

1. **Stop Application**: Prevent further writes
2. **Identify Issue**: Corruption, accidental deletion, etc.
3. **Restore from Backup**:
   - Use most recent backup before incident
   - Apply WAL logs if PITR is enabled
4. **Verify Data Integrity**:
   ```bash
   psql -d openwa -f database/tests/test_schema_creation.sql
   ```
5. **Resume Application**: Start services

### In Case of Corruption

1. **Identify Corrupt Objects**:
   ```sql
   SELECT * FROM pg_stat_database WHERE datname = 'openwa';
   ```
2. **Attempt Reindex**:
   ```sql
   REINDEX DATABASE openwa;
   ```
3. **If Reindex Fails**: Restore from backup

### In Case of Hardware Failure

1. **Deploy Standby Server**: Use streaming replication
2. **Promote Standby**:
   ```bash
   pg_ctl promote -D /var/lib/postgresql/data
   ```
3. **Update Application Configuration**: Point to new primary

## Cloud Backup (Recommended for Production)

### AWS S3 Backup

```bash
# Backup and upload to S3
BACKUP_FILE="openwa_backup_$(date +%Y%m%d_%H%M%S).dump"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
    -h localhost -p 5432 -U postgres \
    -d openwa -F c \
    | gzip \
    | aws s3 cp - "s3://my-backups/openwa/$BACKUP_FILE.gz"
```

### Restore from S3

```bash
aws s3 cp "s3://my-backups/openwa/openwa_backup_20260825_120000.dump.gz" - \
    | gunzip \
    | PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
        -h localhost -p 5432 -U postgres \
        -d openwa
```

## Monitoring Backup Health

### Check Backup Age

```bash
# Alert if last backup is older than 24 hours
LAST_BACKUP=$(ls -t /var/backups/postgres/openwa/*.dump.gz | head -1)
BACKUP_AGE_HOURS=$(( ($(date +%s) - $(stat -f %m "$LAST_BACKUP")) / 3600 ))

if [ $BACKUP_AGE_HOURS -gt 24 ]; then
    echo "⚠️  WARNING: Last backup is $BACKUP_AGE_HOURS hours old"
fi
```

### Verify Backup Integrity

```bash
# Test restore to temporary database
PGPASSWORD="$POSTGRES_PASSWORD" createdb -h localhost -p 5432 -U postgres test_restore
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore \
    -h localhost -p 5432 -U postgres \
    -d test_restore \
    --exit-on-error \
    openwa_backup_20260825_120000.dump

PGPASSWORD="$POSTGRES_PASSWORD" dropdb -h localhost -p 5432 -U postgres test_restore
```

## Retention Policy

- **Daily Backups**: Keep for 30 days
- **Weekly Backups**: Keep for 3 months
- **Monthly Backups**: Keep for 1 year
- **Annual Backups**: Keep indefinitely

## Recovery Time Objective (RTO) & Recovery Point Objective (RPO)

- **RTO**: < 1 hour (time to restore service)
- **RPO**: < 24 hours (maximum data loss acceptable)
- **Production RTO**: < 15 minutes (with hot standby)
- **Production RPO**: < 5 minutes (with WAL archiving)

## Contact Information

- **Database Admin**: [contact info]
- **On-Call Engineer**: [pager number]
- **Backup Storage**: [location/URL]
