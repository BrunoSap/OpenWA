#!/bin/bash
# database/scripts/run_migrations.sh

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

MIGRATIONS_DIR="$(dirname "$0")/../migrations"

echo "🚀 Running database migrations..."
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"

for migration in "$MIGRATIONS_DIR"/*.sql; do
    filename=$(basename "$migration")
    echo "📄 Applying $filename..."
    PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration"
    echo "✅ $filename applied successfully"
done

echo "🎉 All migrations completed!"
