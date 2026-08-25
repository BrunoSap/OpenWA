#!/bin/bash
# database/tests/run_comprehensive_tests.sh
# Run all database tests including security, performance, and IVFFlat tests

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

TESTS_DIR="$(dirname "$0")"

echo "🧪 Running comprehensive database tests..."
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# Test files in order
TESTS=(
    "test_schema_creation.sql"
    "test_security_improvements.sql"
    "test_performance_improvements.sql"
    "test_ivfflat_improvements.sql"
    "test_helper_functions.sql"
)

FAILED_TESTS=()

for test_file in "${TESTS[@]}"; do
    test_path="$TESTS_DIR/$test_file"

    if [ ! -f "$test_path" ]; then
        echo "⚠️  SKIP: $test_file (not found)"
        continue
    fi

    echo "▶️  Running $test_file..."

    if PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$test_path" \
        -v ON_ERROR_STOP=1 \
        2>&1 | grep -E '(✅|⚠️|PASS|FAIL|ERROR)'; then
        echo "✅ $test_file completed"
    else
        echo "❌ $test_file FAILED"
        FAILED_TESTS+=("$test_file")
    fi

    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo "🎉 All tests passed!"
    exit 0
else
    echo "❌ ${#FAILED_TESTS[@]} test(s) failed:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    exit 1
fi
