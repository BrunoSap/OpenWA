#!/bin/bash
# database/tests/run_all_tests_v2.sh
# Comprehensive test runner with AAA-compliant tests and proper setup/teardown

set -e

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

TESTS_DIR="$(dirname "$0")"
FIXTURES_DIR="$TESTS_DIR/fixtures"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results tracking
total_tests=0
passed_tests=0
failed_tests=0
skipped_tests=0

echo "════════════════════════════════════════════════════════════════════════════════"
echo -e "${BLUE}🧪 COMPREHENSIVE TEST SUITE V2${NC}"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# ════════════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ════════════════════════════════════════════════════════════════════════════════════

run_test_file() {
    local test_file=$1
    local test_name=$2

    echo ""
    echo "────────────────────────────────────────────────────────────────────────────────"
    echo -e "${BLUE}Running: $test_name${NC}"
    echo "────────────────────────────────────────────────────────────────────────────────"
    echo ""

    total_tests=$((total_tests + 1))

    if ! [ -f "$test_file" ]; then
        echo -e "${YELLOW}⚠️  SKIP: Test file not found: $test_file${NC}"
        skipped_tests=$((skipped_tests + 1))
        return
    fi

    # Run test and capture output
    if PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$test_file" \
        -v ON_ERROR_STOP=1 \
        2>&1 | tee /tmp/test_output_$$.txt; then

        # Check for FAIL in output
        if grep -q "FAIL:" /tmp/test_output_$$.txt; then
            echo ""
            echo -e "${RED}❌ FAILED: $test_name${NC}"
            failed_tests=$((failed_tests + 1))
        else
            echo ""
            echo -e "${GREEN}✅ PASSED: $test_name${NC}"
            passed_tests=$((passed_tests + 1))
        fi
    else
        echo ""
        echo -e "${RED}❌ FAILED: $test_name (execution error)${NC}"
        failed_tests=$((failed_tests + 1))
    fi

    rm -f /tmp/test_output_$$.txt
}

check_prerequisites() {
    echo "🔍 Checking prerequisites..."

    # Check if database exists
    if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
        echo -e "${RED}❌ ERROR: Database '$DB_NAME' does not exist${NC}"
        exit 1
    fi

    # Check if schema_migrations table exists
    if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations');" | grep -q "t"; then
        echo -e "${YELLOW}⚠️  WARNING: schema_migrations table not found${NC}"
        echo "   Some tests may fail. Run: psql -f database/migrations/20260825110800_create_migration_tracking.sql"
    fi

    # Check if required schemas exist
    for schema in knowledge intake_staging telegram bot_config; do
        if ! PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c \
            "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = '$schema');" | grep -q "t"; then
            echo -e "${RED}❌ ERROR: Required schema '$schema' not found${NC}"
            echo "   Run database migrations first"
            exit 1
        fi
    done

    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
    echo ""
}

# ════════════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ════════════════════════════════════════════════════════════════════════════════════

check_prerequisites

# ════════════════════════════════════════════════════════════════════════════════════
# SETUP: Create test fixtures environment
# ════════════════════════════════════════════════════════════════════════════════════

echo "🔧 Setting up test fixtures environment..."

if [ -f "$FIXTURES_DIR/setup_test_env.sql" ]; then
    if PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$FIXTURES_DIR/setup_test_env.sql" \
        -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Test fixtures environment ready${NC}"
    else
        echo -e "${YELLOW}⚠️  WARNING: Failed to setup test fixtures${NC}"
        echo "   Tests will run without fixture support"
    fi
else
    echo -e "${YELLOW}⚠️  WARNING: Test fixtures setup file not found${NC}"
    echo "   Expected: $FIXTURES_DIR/setup_test_env.sql"
fi

echo ""

# ════════════════════════════════════════════════════════════════════════════════════
# RUN TESTS
# ════════════════════════════════════════════════════════════════════════════════════

echo "🚀 Running test suites..."

# Test 1: Security Improvements
run_test_file "$TESTS_DIR/test_security_improvements_v2.sql" "Security Improvements (AAA compliant)"

# Test 2: IVFFlat Improvements
run_test_file "$TESTS_DIR/test_ivfflat_improvements_v2.sql" "IVFFlat Index Improvements (AAA compliant)"

# Test 3: RLS Integration
run_test_file "$TESTS_DIR/test_rls_integration.sql" "RLS Integration with User Roles"

# Test 4: Rollback Verification
echo ""
echo "────────────────────────────────────────────────────────────────────────────────"
echo -e "${BLUE}Rollback Verification (Documentation Only)${NC}"
echo "────────────────────────────────────────────────────────────────────────────────"
echo ""
echo -e "${YELLOW}⚠️  INFO: Rollback tests require manual execution (destructive)${NC}"
echo "   Run: psql -f $TESTS_DIR/test_rollback_verification.sql"
echo ""
skipped_tests=$((skipped_tests + 1))

# ════════════════════════════════════════════════════════════════════════════════════
# TEARDOWN: Clean test data
# ════════════════════════════════════════════════════════════════════════════════════

echo ""
echo "🧹 Cleaning up test environment..."

if [ -f "$FIXTURES_DIR/teardown_test_env.sql" ]; then
    if PGPASSWORD="$POSTGRES_PASSWORD" psql \
        -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -f "$FIXTURES_DIR/teardown_test_env.sql" \
        -v ON_ERROR_STOP=1 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Test environment cleaned${NC}"
    else
        echo -e "${YELLOW}⚠️  WARNING: Failed to clean test environment${NC}"
        echo "   You may need to manually remove test data (chat_id LIKE 'test_%')"
    fi
fi

# ════════════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════════════════════════

echo ""
echo "════════════════════════════════════════════════════════════════════════════════"
echo -e "${BLUE}📊 TEST SUITE SUMMARY${NC}"
echo "════════════════════════════════════════════════════════════════════════════════"
echo ""
echo "Total test suites: $total_tests"
echo -e "${GREEN}Passed: $passed_tests${NC}"
echo -e "${RED}Failed: $failed_tests${NC}"
echo -e "${YELLOW}Skipped: $skipped_tests${NC}"
echo ""

if [ $failed_tests -eq 0 ]; then
    pass_rate=100
else
    pass_rate=$(( (passed_tests * 100) / (passed_tests + failed_tests) ))
fi

echo "Pass rate: ${pass_rate}%"
echo ""

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
    echo "════════════════════════════════════════════════════════════════════════════════"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Review failed tests above and:"
    echo "  1. Check database state matches test expectations"
    echo "  2. Verify all required migrations are applied"
    echo "  3. Check for data conflicts or permission issues"
    echo "════════════════════════════════════════════════════════════════════════════════"
    exit 1
fi
