#!/bin/bash
# database/scripts/run_migrations_tracked.sh
# Run migrations with proper tracking and verification

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

MIGRATIONS_DIR="$(dirname "$0")/../migrations"

echo "🚀 Running database migrations with tracking..."
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# Function to calculate SHA256 checksum
calculate_checksum() {
    local file=$1
    if command -v sha256sum > /dev/null; then
        sha256sum "$file" | awk '{print $1}'
    elif command -v shasum > /dev/null; then
        shasum -a 256 "$file" | awk '{print $1}'
    else
        # Fallback: no checksum
        echo ""
    fi
}

# Function to check if migration was already applied
is_migration_applied() {
    local version=$1
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT EXISTS(SELECT 1 FROM public.schema_migrations WHERE version = '$version');" | xargs
}

# Function to record migration
record_migration() {
    local version=$1
    local name=$2
    local execution_time=$3
    local checksum=$4

    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
        "SELECT public.record_migration('$version', '$name', $execution_time, '$checksum');" > /dev/null
}

# Apply migrations in order
for migration in "$MIGRATIONS_DIR"/*.sql; do
    filename=$(basename "$migration")
    version="${filename%%_*}"
    name="${filename%.sql}"

    # Check if already applied
    if [ "$(is_migration_applied "$version")" = "t" ]; then
        echo "⏭️  Skipping $filename (already applied)"
        continue
    fi

    echo "📄 Applying $filename..."

    # Calculate checksum
    checksum=$(calculate_checksum "$migration")

    # Measure execution time
    start_time=$(date +%s%3N)

    # Apply migration
    PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$migration" \
        -v ON_ERROR_STOP=1

    end_time=$(date +%s%3N)
    execution_time=$((end_time - start_time))

    # Record migration
    record_migration "$version" "$name" "$execution_time" "$checksum"

    echo "✅ $filename applied successfully (${execution_time}ms)"
done

echo ""
echo "🎉 All migrations completed!"
echo ""

# Show migration history
echo "📜 Migration History:"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT version, name, applied_at, execution_time_ms || 'ms' AS duration FROM public.schema_migrations ORDER BY applied_at;"
