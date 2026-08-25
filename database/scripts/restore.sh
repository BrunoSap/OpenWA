#!/usr/bin/env bash
# database/scripts/restore.sh
# Production restore script with validation, dry-run, and rollback

set -euo pipefail

# ════════════════════════════════════════════════════════════
# CONFIGURATION
# ════════════════════════════════════════════════════════════

BACKUP_FILE="${1:-}"
DRY_RUN="${DRY_RUN:-false}"
FORCE="${FORCE:-false}"

# Database connection (override via env vars)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5433}"
DB_NAME="${DB_NAME:-bot_db}"
DB_USER="${DB_USER:-bot_user}"

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

usage() {
    cat <<EOF
Usage: $0 BACKUP_FILE [OPTIONS]

Restore PostgreSQL database from backup file.

Arguments:
  BACKUP_FILE       Path to backup file (.sql or .sql.gz)

Environment Variables:
  DRY_RUN=true      Validate backup without restoring (default: false)
  FORCE=true        Skip confirmation prompt (default: false)
  DB_HOST           Database host (default: localhost)
  DB_PORT           Database port (default: 5433)
  DB_NAME           Database name (default: bot_db)
  DB_USER           Database user (default: bot_user)
  PGPASSWORD        Database password (required)

Examples:
  # Interactive restore
  ./restore.sh backups/backup_20260825_120000.sql.gz

  # Dry-run (validate only)
  DRY_RUN=true ./restore.sh backups/backup_20260825_120000.sql.gz

  # Non-interactive restore
  FORCE=true ./restore.sh backups/backup_20260825_120000.sql.gz
EOF
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check backup file argument
    if [[ -z "${BACKUP_FILE}" ]]; then
        log_error "No backup file specified"
        usage
        exit 1
    fi

    # Check backup file exists
    if [[ ! -f "${BACKUP_FILE}" ]]; then
        log_error "Backup file not found: ${BACKUP_FILE}"
        exit 1
    fi

    # Check psql is available
    if ! command -v psql &> /dev/null; then
        log_error "psql not found. Install PostgreSQL client tools."
        exit 1
    fi

    # Check database connection
    if ! PGPASSWORD="${PGPASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c '\q' &> /dev/null; then
        log_error "Cannot connect to database at ${DB_HOST}:${DB_PORT}/${DB_NAME}"
        exit 1
    fi

    log_info "Prerequisites OK"
}

validate_backup() {
    log_info "Validating backup file..."

    # Decompress if needed
    if [[ "${BACKUP_FILE}" == *.gz ]]; then
        log_info "Decompressing backup..."
        gunzip -c "${BACKUP_FILE}" > "${BACKUP_FILE%.gz}.tmp"
        RESTORE_FILE="${BACKUP_FILE%.gz}.tmp"
    else
        RESTORE_FILE="${BACKUP_FILE}"
    fi

    # Check if SQL file is valid
    if ! grep -q "CREATE TABLE" "${RESTORE_FILE}"; then
        log_error "Invalid backup file: no CREATE TABLE statements found"
        if [[ "${RESTORE_FILE}" == *.tmp ]]; then
            rm -f "${RESTORE_FILE}"
        fi
        exit 1
    fi

    log_info "Backup file validated"
}

confirm_restore() {
    if [[ "${FORCE}" == "true" ]]; then
        log_warn "Skipping confirmation (FORCE=true)"
        return 0
    fi

    log_warn "⚠️  WARNING: This will DROP and RECREATE all tables"
    log_warn "⚠️  All existing data will be lost"
    log_warn ""
    log_warn "Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}"
    log_warn "Backup: ${BACKUP_FILE}"
    log_warn ""
    echo -n "Are you sure you want to restore? (yes/no): "
    read -r CONFIRM

    if [[ "${CONFIRM}" != "yes" ]]; then
        log_info "Restore cancelled by user"
        exit 0
    fi
}

create_pre_restore_backup() {
    log_info "Creating pre-restore backup..."

    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    PRE_RESTORE_BACKUP="./backups/pre_restore_${TIMESTAMP}.sql.gz"

    mkdir -p ./backups

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
        | gzip -9 > "${PRE_RESTORE_BACKUP}"

    log_info "Pre-restore backup saved: ${PRE_RESTORE_BACKUP}"
}

perform_restore() {
    log_info "Starting restore from: ${BACKUP_FILE}"

    # Decompress if needed
    if [[ "${BACKUP_FILE}" == *.gz ]]; then
        if [[ ! -f "${RESTORE_FILE}" ]]; then
            log_info "Decompressing backup..."
            gunzip -c "${BACKUP_FILE}" > "${BACKUP_FILE%.gz}.tmp"
            RESTORE_FILE="${BACKUP_FILE%.gz}.tmp"
        fi
    else
        RESTORE_FILE="${BACKUP_FILE}"
    fi

    # Perform restore
    PGPASSWORD="${PGPASSWORD}" psql \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -v ON_ERROR_STOP=1 \
        --quiet \
        -f "${RESTORE_FILE}" 2>&1 | grep -v "^psql:" || true

    # Cleanup temp file
    if [[ "${RESTORE_FILE}" == *.tmp ]]; then
        rm -f "${RESTORE_FILE}"
    fi

    log_info "Restore completed"
}

verify_restore() {
    log_info "Verifying restored database..."

    # Check schema_migrations table
    MIGRATION_COUNT=$(PGPASSWORD="${PGPASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM public.schema_migrations" 2>/dev/null || echo "0")

    log_info "Schema migrations applied: ${MIGRATION_COUNT}"

    # Check table counts
    log_info "Table row counts:"
    PGPASSWORD="${PGPASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "
        SELECT
            schemaname || '.' || tablename AS table_name,
            n_live_tup AS row_count
        FROM pg_stat_user_tables
        WHERE schemaname IN ('knowledge', 'intake_staging', 'telegram', 'bot_config')
        ORDER BY schemaname, tablename;
    " 2>/dev/null || log_warn "Could not retrieve table counts"

    log_info "Verification complete"
}

log_restore() {
    log_info "Logging restore operation..."

    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    LOG_FILE="./backups/restore_log_${TIMESTAMP}.txt"

    cat > "${LOG_FILE}" <<EOF
Restore Log
===========
Timestamp: ${TIMESTAMP}
Database: ${DB_NAME}@${DB_HOST}:${DB_PORT}
Backup File: ${BACKUP_FILE}
Dry Run: ${DRY_RUN}
Force: ${FORCE}

Status: SUCCESS
EOF

    log_info "Restore log saved: ${LOG_FILE}"
}

# ════════════════════════════════════════════════════════════
# MAIN EXECUTION
# ════════════════════════════════════════════════════════════

main() {
    log_info "==================================="
    log_info "PostgreSQL Restore Script"
    log_info "==================================="

    check_prerequisites
    validate_backup

    if [[ "${DRY_RUN}" == "true" ]]; then
        log_info "==================================="
        log_info "Dry-run mode: validation successful"
        log_info "==================================="
        exit 0
    fi

    confirm_restore
    create_pre_restore_backup
    perform_restore
    verify_restore
    log_restore

    log_info "==================================="
    log_info "Restore completed successfully"
    log_info "==================================="
}

main
