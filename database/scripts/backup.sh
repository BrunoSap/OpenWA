#!/usr/bin/env bash
# database/scripts/backup.sh
# Production backup script with compression, retention policy, and validation

set -euo pipefail

# ════════════════════════════════════════════════════════════
# CONFIGURATION
# ════════════════════════════════════════════════════════════

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
COMPRESS="${COMPRESS:-true}"
VALIDATE="${VALIDATE:-true}"

# Database connection (override via env vars)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-bot_db}"
DB_USER="${DB_USER:-bot_user}"

# Backup timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ════════════════════════════════════════════════════════════
# FUNCTIONS
# ════════════════════════════════════════════════════════════

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check pg_dump is available
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump not found. Install PostgreSQL client tools."
        exit 1
    fi

    # Check database connection
    if ! PGPASSWORD="${PGPASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c '\q' &> /dev/null; then
        log_error "Cannot connect to database at ${DB_HOST}:${DB_PORT}/${DB_NAME}"
        exit 1
    fi

    # Create backup directory
    mkdir -p "${BACKUP_DIR}"

    log_info "Prerequisites OK"
}

perform_backup() {
    log_info "Starting backup: ${BACKUP_FILE}"

    # Perform backup with pg_dump
    PGPASSWORD="${PGPASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-acl \
        --clean \
        --if-exists \
        --verbose \
        --file="${BACKUP_FILE}" 2>&1 | grep -v "^pg_dump:"

    if [[ ! -f "${BACKUP_FILE}" ]]; then
        log_error "Backup failed: ${BACKUP_FILE} not created"
        exit 1
    fi

    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log_info "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"
}

compress_backup() {
    if [[ "${COMPRESS}" == "true" ]]; then
        log_info "Compressing backup..."

        gzip -9 "${BACKUP_FILE}"
        BACKUP_FILE="${BACKUP_FILE}.gz"

        COMPRESSED_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
        log_info "Backup compressed: ${BACKUP_FILE} (${COMPRESSED_SIZE})"
    fi
}

validate_backup() {
    if [[ "${VALIDATE}" == "true" ]]; then
        log_info "Validating backup..."

        # Decompress if needed
        if [[ "${BACKUP_FILE}" == *.gz ]]; then
            gunzip -c "${BACKUP_FILE}" > "${BACKUP_FILE%.gz}.tmp"
            VALIDATE_FILE="${BACKUP_FILE%.gz}.tmp"
        else
            VALIDATE_FILE="${BACKUP_FILE}"
        fi

        # Check if SQL file is valid (contains CREATE TABLE statements)
        if grep -q "CREATE TABLE" "${VALIDATE_FILE}"; then
            log_info "Backup validation passed"
        else
            log_error "Backup validation failed: no CREATE TABLE statements found"
            exit 1
        fi

        # Cleanup temp file
        if [[ "${VALIDATE_FILE}" == *.tmp ]]; then
            rm -f "${VALIDATE_FILE}"
        fi
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."

    find "${BACKUP_DIR}" -name "backup_*.sql*" -type f -mtime +${RETENTION_DAYS} -delete

    OLD_COUNT=$(find "${BACKUP_DIR}" -name "backup_*.sql*" -type f | wc -l)
    log_info "Retained ${OLD_COUNT} backup(s)"
}

generate_backup_report() {
    log_info "Generating backup report..."

    REPORT_FILE="${BACKUP_DIR}/backup_report_${TIMESTAMP}.txt"

    cat > "${REPORT_FILE}" <<EOF
Backup Report
=============
Timestamp: ${TIMESTAMP}
Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}
Backup File: ${BACKUP_FILE}
Compressed: ${COMPRESS}
Validated: ${VALIDATE}

Schema Version:
$(PGPASSWORD="${PGPASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT version, applied_at FROM public.schema_migrations ORDER BY applied_at DESC LIMIT 1" 2>/dev/null || echo "N/A")

Table Counts:
$(PGPASSWORD="${PGPASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "
SELECT
    schemaname || '.' || tablename AS table_name,
    n_live_tup AS row_count
FROM pg_stat_user_tables
WHERE schemaname IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
ORDER BY schemaname, tablename
" 2>/dev/null || echo "N/A")
EOF

    log_info "Report saved: ${REPORT_FILE}"
}

# ════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ════════════════════════════════════════════════════════════

main() {
    log_info "==================================="
    log_info "PostgreSQL Backup Script"
    log_info "==================================="

    check_prerequisites
    perform_backup
    compress_backup
    validate_backup
    cleanup_old_backups
    generate_backup_report

    log_info "==================================="
    log_info "Backup completed successfully"
    log_info "==================================="
}

main
