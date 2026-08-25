#!/usr/bin/env bash
# database/scripts/setup_database.sh
# Complete database setup with validation
# This script ACTUALLY creates and tests the database

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="${DB_NAME:-openwa}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(cd "$SCRIPT_DIR/../migrations" && pwd)"
TESTS_DIR="$(cd "$SCRIPT_DIR/../tests" && pwd)"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_postgres() {
    log_info "Checking PostgreSQL connection..."
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
        log_error "Cannot connect to PostgreSQL at $DB_HOST:$DB_PORT as user $DB_USER"
        log_error "Make sure PostgreSQL is running and credentials are correct"
        log_error "Export DB_USER, DB_HOST, DB_PORT if needed"
        exit 1
    fi
    log_info "PostgreSQL connection OK"
}

check_pgvector() {
    log_info "Checking pgvector extension availability..."
    if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT * FROM pg_available_extensions WHERE name = 'vector'" | grep -q vector; then
        log_error "pgvector extension is not available"
        log_error "Install it with: sudo apt install postgresql-15-pgvector"
        log_error "Or on macOS: brew install pgvector"
        exit 1
    fi
    log_info "pgvector extension is available"
}

create_database() {
    log_info "Creating database '$DB_NAME'..."
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        log_warn "Database '$DB_NAME' already exists"
        read -p "Drop and recreate? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Dropping database '$DB_NAME'..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE $DB_NAME" || true
            log_info "Creating database '$DB_NAME'..."
            psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
        else
            log_info "Keeping existing database"
        fi
    else
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME"
        log_info "Database '$DB_NAME' created"
    fi
}

run_migrations() {
    log_info "Running migrations..."

    local migration_files=(
        "000_schema_migrations.sql"
        "001_install_pgvector.sql"
        "002_create_schema_knowledge.sql"
        "003_create_schema_intake_staging.sql"
        "004_create_schema_telegram.sql"
        "005_create_schema_bot_config.sql"
        "006_create_helper_functions.sql"
        "007_seed_data.sql"
    )

    for migration_file in "${migration_files[@]}"; do
        local migration_path="$MIGRATIONS_DIR/$migration_file"
        if [ ! -f "$migration_path" ]; then
            log_error "Migration file not found: $migration_file"
            exit 1
        fi

        log_info "Running migration: $migration_file"
        local start_time=$(date +%s%3N)

        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration_path"; then
            local end_time=$(date +%s%3N)
            local execution_time=$((end_time - start_time))
            log_info "✓ $migration_file completed in ${execution_time}ms"
        else
            log_error "✗ Migration failed: $migration_file"
            exit 1
        fi
    done

    log_info "All migrations completed successfully"
}

verify_schema() {
    log_info "Verifying schema creation..."

    local expected_schemas=("knowledge" "intake_staging" "telegram" "bot_config")
    for schema in "${expected_schemas[@]}"; do
        if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name = '$schema'" | grep -q "$schema"; then
            log_info "✓ Schema '$schema' exists"
        else
            log_error "✗ Schema '$schema' not found"
            exit 1
        fi
    done

    log_info "Schema verification completed"
}

run_tests() {
    log_info "Running test suite..."

    # Test schema creation
    log_info "Testing schema creation..."
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$TESTS_DIR/test_schema_creation.sql" > /dev/null; then
        log_info "✓ Schema creation tests passed"
    else
        log_error "✗ Schema creation tests failed"
        exit 1
    fi

    # Test helper functions
    log_info "Testing helper functions..."
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$TESTS_DIR/test_helper_functions.sql" > /dev/null; then
        log_info "✓ Helper function tests passed"
    else
        log_error "✗ Helper function tests failed"
        exit 1
    fi

    # Test fixtures
    log_info "Testing fixtures..."
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$TESTS_DIR/test_fixtures.sql" > /dev/null; then
        log_info "✓ Fixture tests passed"
    else
        log_error "✗ Fixture tests failed"
        exit 1
    fi

    log_info "All tests passed"
}

generate_schema_dump() {
    log_info "Generating schema dump..."
    local schema_file="$SCRIPT_DIR/../SCHEMA.sql"

    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" --schema-only --no-owner --no-acl > "$schema_file"

    if [ -f "$schema_file" ]; then
        local line_count=$(wc -l < "$schema_file")
        log_info "✓ Schema dump generated: $schema_file ($line_count lines)"
    else
        log_error "✗ Failed to generate schema dump"
        exit 1
    fi
}

generate_statistics() {
    log_info "Generating database statistics..."

    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<'EOF'
\echo '=== Database Statistics ==='
\echo ''

\echo 'Schemas:'
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
ORDER BY schema_name;

\echo ''
\echo 'Tables by schema:'
SELECT
    schemaname AS schema,
    COUNT(*) AS table_count
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname
ORDER BY schemaname;

\echo ''
\echo 'Indexes:'
SELECT
    schemaname AS schema,
    COUNT(*) AS index_count
FROM pg_indexes
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
GROUP BY schemaname
ORDER BY schemaname;

\echo ''
\echo 'Functions:'
SELECT
    n.nspname AS schema,
    COUNT(*) AS function_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY n.nspname
ORDER BY n.nspname;

\echo ''
\echo 'Extensions:'
SELECT extname, extversion FROM pg_extension ORDER BY extname;
EOF
}

main() {
    log_info "=== OpenWA Database Setup ==="
    log_info "Database: $DB_NAME"
    log_info "Host: $DB_HOST:$DB_PORT"
    log_info "User: $DB_USER"
    echo ""

    check_postgres
    check_pgvector
    create_database
    run_migrations
    verify_schema
    run_tests
    generate_schema_dump
    generate_statistics

    echo ""
    log_info "=== Setup Complete ==="
    log_info "Database is ready for use"
    log_info "Connection string: postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
}

main "$@"
