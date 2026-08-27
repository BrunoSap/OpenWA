#!/bin/bash
set -euo pipefail

# ════════════════════════════════════════════════════════════════════════════════
# 🐳 DOCKER MIGRATION RUNNER
# ════════════════════════════════════════════════════════════════════════════════
# Runs migrations via docker exec (for containerized PostgreSQL without exposed ports)
# Usage: ./run_migrations_docker.sh [container_name] [db_user] [db_name]
# ════════════════════════════════════════════════════════════════════════════════

CONTAINER_NAME="${1:-openwa-postgres}"
DB_USER="${2:-openwa}"
DB_NAME="${3:-openwa}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$(dirname "$SCRIPT_DIR")/migrations"

echo "════════════════════════════════════════════════════════════════════════════════"
echo "🐳 DOCKER MIGRATION RUNNER"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "Container: $CONTAINER_NAME"
echo "Database: $DB_USER@$DB_NAME"
echo ""

# ────────────────────────────────────────────────────────────────────────────────
# Pre-flight checks
# ────────────────────────────────────────────────────────────────────────────────

echo "🔍 Pre-flight checks..."

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "❌ ERROR: Container '$CONTAINER_NAME' is not running"
    echo "   Start it with: docker start $CONTAINER_NAME"
    exit 1
fi

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo "❌ ERROR: Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
fi

# Check if schema_migrations table exists
if ! docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1 FROM schema_migrations LIMIT 1" 2>/dev/null; then
    echo "❌ ERROR: schema_migrations table not found"
    echo "   Run: docker exec $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME -f /path/to/create_migration_tracking.sql"
    exit 1
fi

echo "✅ All pre-flight checks passed"
echo ""

# ────────────────────────────────────────────────────────────────────────────────
# Migration execution
# ────────────────────────────────────────────────────────────────────────────────

APPLIED=0
SKIPPED=0
FAILED=0

for migration_file in "$MIGRATIONS_DIR"/*.sql; do
    [ -e "$migration_file" ] || continue

    filename=$(basename "$migration_file")
    version="${filename%.sql}"

    # Skip non-migration files
    if [[ ! "$filename" =~ ^[0-9] ]]; then
        continue
    fi

    # Check if already applied
    already_applied=$(docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
        "SELECT COUNT(*) FROM schema_migrations WHERE version = '$version'")

    if [ "$already_applied" -gt 0 ]; then
        echo "⏭️  SKIP: $filename (already applied)"
        ((SKIPPED++))
        continue
    fi

    echo "🔄 Applying: $filename"

    # Calculate checksum
    checksum=$(shasum -a 256 "$migration_file" | cut -d' ' -f1)

    # Execute migration
    start_time=$(date +%s)

    if docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -f - < "$migration_file" 2>&1; then
        end_time=$(date +%s)
        execution_time=$((end_time - start_time))

        # Record migration
        docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c \
            "INSERT INTO schema_migrations (version, name, checksum, execution_time_ms)
             VALUES ('$version', '$filename', '$checksum', $execution_time)" > /dev/null

        echo "✅ SUCCESS: $filename (${execution_time}ms)"
        ((APPLIED++))
    else
        echo "❌ FAILED: $filename"
        ((FAILED++))

        # Record failure (note: schema_migrations has no 'success' column, so we skip recording failures)
        # Just log to stderr and continue
        echo "Migration failed but not recorded in schema_migrations (no failure tracking column)" >&2

        if [ "${STOP_ON_ERROR:-1}" = "1" ]; then
            echo ""
            echo "🛑 Stopping due to migration failure"
            exit 1
        fi
    fi

    echo ""
done

# ────────────────────────────────────────────────────────────────────────────────
# Summary
# ────────────────────────────────────────────────────────────────────────────────

echo "════════════════════════════════════════════════════════════════════════════════"
echo "📊 MIGRATION SUMMARY"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "✅ Applied: $APPLIED"
echo "⏭️  Skipped: $SKIPPED"
echo "❌ Failed: $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
    echo "⚠️  Some migrations failed. Check logs above."
    exit 1
else
    echo "🎉 All migrations completed successfully!"
fi
