#!/bin/bash
# database/scripts/run_migrations_v2.sh
# Enhanced migration runner with version tracking and idempotency

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

MIGRATIONS_DIR="$(dirname "$0")/../migrations"
SCRIPT_DIR="$(dirname "$0")"

echo "🚀 Running database migrations with version tracking..."
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# Function to check if a migration was already applied
migration_applied() {
    local version="$1"
    local result=$(PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
        "SELECT COUNT(*) FROM public.schema_migrations WHERE version = '$version'" 2>/dev/null || echo "0")
    [ "$result" = "1" ]
}

# Function to record migration
record_migration() {
    local version="$1"
    local description="$2"
    local execution_time="$3"
    local checksum="$4"

    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
        "INSERT INTO public.schema_migrations (version, description, execution_time_ms, checksum)
         VALUES ('$version', '$description', $execution_time, '$checksum')
         ON CONFLICT (version) DO NOTHING" > /dev/null
}

# Check if schema_migrations table exists
TRACKING_ENABLED=false
if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c \
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations')" \
    2>/dev/null | grep -q "t"; then
    TRACKING_ENABLED=true
    echo "✓ Migration tracking enabled (schema_migrations table exists)"
else
    echo "⚠️  Migration tracking disabled (schema_migrations table not found)"
    echo "   Tracking will be enabled after migration 20260825110800 runs"
fi
echo ""

# Process migrations in sorted order (timestamp-based)
for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    filename=$(basename "$migration")
    version="${filename%.sql}"

    # Skip if already applied
    if [ "$TRACKING_ENABLED" = true ] && migration_applied "$version"; then
        echo "⏭️  Skipping $filename (already applied)"
        continue
    fi

    echo "📄 Applying $filename..."

    # Calculate checksum
    if command -v sha256sum > /dev/null; then
        checksum=$(sha256sum "$migration" | awk '{print $1}')
    elif command -v shasum > /dev/null; then
        checksum=$(shasum -a 256 "$migration" | awk '{print $1}')
    else
        checksum="unknown"
    fi

    # Measure execution time
    start_time=$(date +%s%3N)

    # Apply migration
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration"

    end_time=$(date +%s%3N)
    execution_time=$((end_time - start_time))

    echo "✅ $filename applied successfully (${execution_time}ms)"

    # Record migration if tracking is enabled
    if [ "$TRACKING_ENABLED" = true ]; then
        # Extract description from comment (first line starting with --)
        description=$(head -5 "$migration" | grep "^--" | head -1 | sed 's/^-- //' || echo "")
        record_migration "$version" "$description" "$execution_time" "$checksum"
    fi

    # Enable tracking after migration 20260825110800
    if [ "$version" = "20260825110800_create_migration_tracking" ]; then
        TRACKING_ENABLED=true
        echo "✓ Migration tracking now enabled"
    fi

    echo ""
done

echo "🎉 All migrations completed!"
echo ""

# Show migration history if tracking is enabled
if [ "$TRACKING_ENABLED" = true ]; then
    echo "📊 Migration History:"
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT version, description, applied_at, execution_time_ms
         FROM public.schema_migrations
         ORDER BY applied_at DESC
         LIMIT 10"
fi
