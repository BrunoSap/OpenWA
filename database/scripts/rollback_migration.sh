#!/usr/bin/env bash
# database/scripts/rollback_migration.sh
# Granular migration rollback (per-migration, not nuclear)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DB_NAME="${DB_NAME:-openwa}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOWN_MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations/down" && pwd)"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_applied_migrations() {
    log_info "Applied migrations:"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'EOF'
SELECT version, name, applied_at
FROM public.schema_migrations
WHERE name NOT LIKE '%(rolled back)%'
ORDER BY applied_at DESC;
EOF
}

rollback_migration() {
    local migration_version="$1"

    # Check if migration exists
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "
        SELECT 1 FROM public.schema_migrations WHERE version = '$migration_version'
    " | grep -q 1; then
        log_error "Migration $migration_version not found in schema_migrations table"
        return 1
    fi

    # Check if rollback script exists
    local rollback_file="$DOWN_MIGRATIONS_DIR/${migration_version}_rollback_*.sql"
    if ! ls $rollback_file > /dev/null 2>&1; then
        log_warn "No rollback script found for $migration_version"
        log_warn "Only seed data (007) has a non-destructive rollback"
        return 1
    fi

    log_info "Rolling back migration: $migration_version"

    # Run rollback
    for file in $rollback_file; do
        log_info "Executing: $(basename "$file")"
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file"; then
            log_info "✓ Rollback completed"
        else
            log_error "✗ Rollback failed"
            return 1
        fi
    done

    return 0
}

full_reset() {
    log_warn "=== FULL DATABASE RESET ==="
    log_warn "This will DROP ALL schemas and data"
    read -p "Are you absolutely sure? Type 'yes' to confirm: " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Aborted"
        return 0
    fi

    log_info "Dropping all schemas..."

    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'EOF'
BEGIN;

-- Drop schemas (CASCADE removes all tables, functions, etc.)
DROP SCHEMA IF EXISTS bot_config CASCADE;
DROP SCHEMA IF EXISTS telegram CASCADE;
DROP SCHEMA IF EXISTS intake_staging CASCADE;
DROP SCHEMA IF EXISTS knowledge CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS vector;

-- Clear migration history
TRUNCATE public.schema_migrations;

COMMIT;
EOF

    log_info "✓ Full reset complete"
    log_info "Run setup_database.sh to recreate schema"
}

backup_database() {
    local backup_file="$SCRIPT_DIR/../backups/backup_$(date +%Y%m%d_%H%M%S).sql"
    mkdir -p "$SCRIPT_DIR/../backups"

    log_info "Creating backup: $backup_file"

    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --format=custom --compress=9 --file="$backup_file"

    if [ -f "$backup_file" ]; then
        log_info "✓ Backup created: $backup_file"
    else
        log_error "✗ Backup failed"
        return 1
    fi
}

usage() {
    cat <<EOF
Usage: $0 [COMMAND] [OPTIONS]

Commands:
    list                        List applied migrations
    rollback <version>          Rollback specific migration (e.g., 007_seed_data)
    reset                       Full database reset (drops all schemas)
    backup                      Create backup before rollback

Examples:
    $0 list
    $0 rollback 007_seed_data
    $0 backup
    $0 reset

Environment Variables:
    DB_NAME     Database name (default: openwa)
    DB_USER     Database user (default: postgres)
    DB_HOST     Database host (default: localhost)
    DB_PORT     Database port (default: 5432)
EOF
}

main() {
    local command="${1:-}"

    case "$command" in
        list)
            show_applied_migrations
            ;;
        rollback)
            if [ -z "${2:-}" ]; then
                log_error "Migration version required"
                usage
                exit 1
            fi
            rollback_migration "$2"
            ;;
        reset)
            full_reset
            ;;
        backup)
            backup_database
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

main "$@"
