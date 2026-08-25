#!/bin/bash
# database/scripts/rollback.sh

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

echo "⚠️  ROLLBACK: Dropping all schemas..."
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"

read -p "Are you sure? This will DELETE ALL DATA. Type 'yes' to confirm: " confirm
if [ "$confirm" != "yes" ]; then
    echo "Rollback cancelled."
    exit 1
fi

PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" <<EOF
DROP SCHEMA IF EXISTS knowledge CASCADE;
DROP SCHEMA IF EXISTS intake_staging CASCADE;
DROP SCHEMA IF EXISTS telegram CASCADE;
DROP SCHEMA IF EXISTS bot_config CASCADE;
DROP EXTENSION IF EXISTS vector CASCADE;
EOF

echo "✅ Rollback completed. All schemas dropped."
