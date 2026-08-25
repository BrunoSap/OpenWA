#!/bin/bash
# database/scripts/run_migrations_tracked_v2.sh
# Run migrations with tracking, integrity verification, and checksum validation

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

MIGRATIONS_DIR="$(dirname "$0")/../migrations"
CHECKSUMS_FILE="$(dirname "$0")/../.migration_checksums"

echo "════════════════════════════════════════════════════════════════════════════════"
echo "🚀 MIGRATION RUNNER V2 (with integrity verification)"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# ════════════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════════════

# Calculate SHA256 checksum
calculate_checksum() {
    local file=$1
    if command -v sha256sum > /dev/null; then
        sha256sum "$file" | awk '{print $1}'
    elif command -v shasum > /dev/null; then
        shasum -a 256 "$file" | awk '{print $1}'
    else
        echo "ERROR: No checksum utility found (sha256sum or shasum)" >&2
        exit 1
    fi
}

# Check if migration was already applied
is_migration_applied() {
    local version=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT EXISTS(SELECT 1 FROM public.schema_migrations WHERE version = '$version');" | xargs
}

# Get stored checksum for applied migration
get_stored_checksum() {
    local version=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT checksum FROM public.schema_migrations WHERE version = '$version';" | xargs
}

# Record migration execution
record_migration() {
    local version=$1
    local name=$2
    local execution_time=$3
    local checksum=$4

    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT public.record_migration('$version', '$name', $execution_time, '$checksum');" > /dev/null
}

# Verify migration file integrity
verify_migration_integrity() {
    local version=$1
    local file=$2
    local current_checksum=$(calculate_checksum "$file")
    local stored_checksum=$(get_stored_checksum "$version")

    if [ -n "$stored_checksum" ] && [ "$current_checksum" != "$stored_checksum" ]; then
        echo "❌ ERROR: Migration $version checksum mismatch!"
        echo "   Current:  $current_checksum"
        echo "   Expected: $stored_checksum"
        echo ""
        echo "⚠️  WARNING: Migration file has been modified after being applied!"
        echo "   This may indicate:"
        echo "   - Accidental file modification"
        echo "   - Security breach (unauthorized changes)"
        echo "   - File corruption"
        echo ""
        echo "🛑 REFUSING to proceed. Options:"
        echo "   1. Restore original migration file from version control"
        echo "   2. If changes are intentional, create a NEW migration"
        echo "   3. Manual override: update schema_migrations checksum (NOT RECOMMENDED)"
        echo ""
        return 1
    fi

    return 0
}

# ════════════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ════════════════════════════════════════════════════════════════════════════════════

echo "🔍 Pre-flight checks..."

# Check if schema_migrations table exists
if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations');" | grep -q "t"; then
    echo "❌ ERROR: schema_migrations table not found"
    echo "   Run: psql -f database/migrations/20260825110800_create_migration_tracking.sql"
    exit 1
fi

# Check if record_migration function exists
if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'record_migration');" | grep -q "t"; then
    echo "❌ ERROR: record_migration function not found"
    echo "   Run: psql -f database/migrations/20260825110800_create_migration_tracking.sql"
    exit 1
fi

echo "✅ Pre-flight checks passed"
echo ""

# ════════════════════════════════════════════════════════════════════════════════════
# APPLY MIGRATIONS
# ════════════════════════════════════════════════════════════════════════════════════

echo "📦 Scanning for migrations..."
migration_count=0
applied_count=0
skipped_count=0

for migration in "$MIGRATIONS_DIR"/*.sql; do
    [ -f "$migration" ] || continue

    filename=$(basename "$migration")
    version="${filename%%_*}"
    name="${filename%.sql}"

    migration_count=$((migration_count + 1))

    # Check if already applied
    if [ "$(is_migration_applied "$version")" = "t" ]; then
        echo "⏭️  $filename (already applied)"

        # Verify integrity of applied migration
        if ! verify_migration_integrity "$version" "$migration"; then
            exit 1
        fi

        skipped_count=$((skipped_count + 1))
        continue
    fi

    echo ""
    echo "📄 Applying $filename..."

    # Calculate checksum BEFORE applying
    checksum=$(calculate_checksum "$migration")
    echo "   Checksum: $checksum"

    # Measure execution time
    start_time=$(date +%s%3N)

    # Apply migration
    if ! PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$migration" \
        -v ON_ERROR_STOP=1; then

        echo ""
        echo "❌ ERROR: Migration $filename failed!"
        echo "   Database may be in inconsistent state"
        echo "   Rollback: psql -f database/rollbacks/rollback_${version}.sql"
        exit 1
    fi

    end_time=$(date +%s%3N)
    execution_time=$((end_time - start_time))

    # Record migration
    record_migration "$version" "$name" "$execution_time" "$checksum"

    echo "   ✅ Applied successfully (${execution_time}ms)"
    applied_count=$((applied_count + 1))
done

# ════════════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════════════

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo "🎉 Migration run complete!"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Summary:"
echo "   Total migrations: $migration_count"
echo "   Applied: $applied_count"
echo "   Skipped: $skipped_count"
echo ""

if [ $applied_count -eq 0 ]; then
    echo "✅ Database is up to date"
else
    echo "✅ $applied_count new migration(s) applied successfully"
fi

echo ""
echo "📜 Migration History (last 10):"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT version, name, applied_at, execution_time_ms || 'ms' AS duration, LEFT(checksum, 12) || '...' AS checksum_preview
     FROM public.schema_migrations
     ORDER BY applied_at DESC
     LIMIT 10;"

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
