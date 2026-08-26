#!/bin/bash
# database/tests/run_all_tests.sh
# Run complete test suite for Phase 1

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-$USER}"

echo "🧪 Running Phase 1 Test Suite..."
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# Test 1: Schema creation
echo "📋 Test 1: Schema Creation"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f test_schema_creation.sql
echo ""

# Test 2: Helper functions
echo "📋 Test 2: Helper Functions"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f test_helper_functions.sql
echo ""

# Test 3: Seed data
echo "📋 Test 3: Seed Data"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f test_fixtures.sql
echo ""

# Test 4: Performance validation
echo "📋 Test 4: Performance Validation"
cd ..
python3 scripts/validate_performance.py
cd tests
echo ""

echo "✅ All tests passed!"
echo ""
echo "📊 Summary:"
echo "  - Schema creation: ✅"
echo "  - Helper functions: ✅"
echo "  - Seed data: ✅"
echo "  - Performance: ✅"
