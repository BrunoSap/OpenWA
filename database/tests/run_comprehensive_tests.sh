#!/bin/bash
# database/tests/run_comprehensive_tests.sh
# Run all Task 7 tests including security, performance, and edge cases

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================================"
echo "🧪 COMPREHENSIVE TEST SUITE FOR TASK 7"
echo "======================================================================"
echo ""

# Load environment variables
if [ -f ../../.env ]; then
    export $(grep -v '^#' ../../.env | xargs)
fi

# Database connection params
DB_HOST=${POSTGRES_HOST:-localhost}
DB_PORT=${POSTGRES_PORT:-5432}
DB_NAME=${POSTGRES_DB:-openwa}
DB_USER=${POSTGRES_USER:-postgres}
DB_PASSWORD=${POSTGRES_PASSWORD:-}

export PGPASSWORD="$DB_PASSWORD"

TEST_RESULTS=()
FAILED_TESTS=()

run_sql_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .sql)

    echo ""
    echo "----------------------------------------------------------------------"
    echo "📋 Running: $test_name"
    echo "----------------------------------------------------------------------"

    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$test_file" 2>&1 | tee /tmp/test_output.log; then
        if grep -q "❌" /tmp/test_output.log; then
            echo "❌ TEST FAILED: $test_name"
            TEST_RESULTS+=("❌ $test_name")
            FAILED_TESTS+=("$test_name")
            return 1
        else
            echo "✅ TEST PASSED: $test_name"
            TEST_RESULTS+=("✅ $test_name")
            return 0
        fi
    else
        echo "❌ TEST FAILED: $test_name (execution error)"
        TEST_RESULTS+=("❌ $test_name")
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

run_python_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .py)

    echo ""
    echo "----------------------------------------------------------------------"
    echo "🐍 Running: $test_name"
    echo "----------------------------------------------------------------------"

    if python3 "$test_file"; then
        echo "✅ TEST PASSED: $test_name"
        TEST_RESULTS+=("✅ $test_name")
        return 0
    else
        echo "❌ TEST FAILED: $test_name"
        TEST_RESULTS+=("❌ $test_name")
        FAILED_TESTS+=("$test_name")
        return 1
    fi
}

# Test 1: Schema Creation
run_sql_test test_schema_creation.sql || true

# Test 2: Constraint Validation
run_sql_test test_constraint_validation.sql || true

# Test 3: Security Improvements
run_sql_test test_security_fixes.sql || true

# Test 4: Integration Tests
run_sql_test test_integration.sql || true

# Test 5: Performance Tests (Python)
echo ""
echo "----------------------------------------------------------------------"
echo "🐍 Checking Python dependencies..."
echo "----------------------------------------------------------------------"

if ! python3 -c "import psycopg2" 2>/dev/null; then
    echo "⚠️  psycopg2 not found, installing..."
    pip3 install psycopg2-binary numpy
fi

run_python_test validate_performance_v2.py || true

# Summary
echo ""
echo "======================================================================"
echo "📊 TEST SUMMARY"
echo "======================================================================"
echo ""

for result in "${TEST_RESULTS[@]}"; do
    echo "$result"
done

echo ""
echo "----------------------------------------------------------------------"

PASSED_COUNT=$(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c "✅" || true)
FAILED_COUNT=$(printf '%s\n' "${TEST_RESULTS[@]}" | grep -c "❌" || true)
TOTAL_COUNT=${#TEST_RESULTS[@]}

echo "Total: $TOTAL_COUNT tests"
echo "Passed: $PASSED_COUNT"
echo "Failed: $FAILED_COUNT"
echo ""

if [ "$FAILED_COUNT" -gt 0 ]; then
    echo "❌ FAILED TESTS:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "   - $test"
    done
    echo ""
    echo "======================================================================"
    echo "❌ TEST SUITE FAILED"
    echo "======================================================================"
    exit 1
else
    echo "======================================================================"
    echo "✅ ALL TESTS PASSED"
    echo "======================================================================"
    exit 0
fi
