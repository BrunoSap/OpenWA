#!/bin/bash
# database/tests/run_all_tests_v2.sh
# Comprehensive test suite with performance, security, and edge case coverage

set -euo pipefail

DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"
DB_PASSWORD="${POSTGRES_PASSWORD:-}"

TEST_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_DIR="$(cd "$TEST_DIR/../scripts" && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ═══════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%H:%M:%S')] ✅ $1${NC}"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%H:%M:%S')] ⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date +'%H:%M:%S')] ❌ $1${NC}"
}

run_sql_test() {
    local test_file="$1"
    local test_name="$2"

    log "Running: $test_name"

    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$test_file" > /dev/null 2>&1; then
        log_success "$test_name passed"
        return 0
    else
        log_error "$test_name FAILED"
        # Show errors
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$test_file" 2>&1 | tail -20
        return 1
    fi
}

run_python_test() {
    local test_script="$1"
    local test_name="$2"

    log "Running: $test_name"

    if python3 "$test_script"; then
        log_success "$test_name passed"
        return 0
    else
        log_error "$test_name FAILED"
        return 1
    fi
}

# ═══════════════════════════════════════════════════════════
#  MAIN TEST SUITE
# ═══════════════════════════════════════════════════════════

main() {
    echo "═══════════════════════════════════════════════════════════"
    echo "  OpenWA Comprehensive Test Suite v2.0"
    echo "═══════════════════════════════════════════════════════════"
    echo "Database: $DB_NAME@$DB_HOST:$DB_PORT"
    echo ""

    local pass_count=0
    local fail_count=0
    local total_start=$(date +%s)

    # Test 1: Schema Creation
    echo ""
    log "📋 Test Suite 1: Schema Creation & Constraints"
    if run_sql_test "$TEST_DIR/test_schema_creation.sql" "Schema Creation"; then
        ((pass_count++))
    else
        ((fail_count++))
    fi

    # Test 2: Helper Functions
    echo ""
    log "📋 Test Suite 2: Helper Functions"
    if run_sql_test "$TEST_DIR/test_helper_functions.sql" "Helper Functions"; then
        ((pass_count++))
    else
        ((fail_count++))
    fi

    # Test 3: Seed Data
    echo ""
    log "📋 Test Suite 3: Seed Data & Fixtures"
    if run_sql_test "$TEST_DIR/test_fixtures.sql" "Seed Data"; then
        ((pass_count++))
    else
        ((fail_count++))
    fi

    # Test 4: Comprehensive Testing (NEW)
    echo ""
    log "📋 Test Suite 4: Comprehensive Testing"
    log "  (Timezone, Security, Race Conditions, Edge Cases)"
    if run_sql_test "$TEST_DIR/test_comprehensive.sql" "Comprehensive Tests"; then
        ((pass_count++))
    else
        ((fail_count++))
    fi

    # Test 5: Performance Validation (NEW - SECURE)
    echo ""
    log "📋 Test Suite 5: Performance Validation"
    log "  (pgvector, IVFFlat, Query Speed)"

    # Check if Python is available
    if command -v python3 &> /dev/null; then
        if [ -f "$SCRIPT_DIR/validate_performance_v2.py" ]; then
            if run_python_test "$SCRIPT_DIR/validate_performance_v2.py" "Performance Validation"; then
                ((pass_count++))
            else
                ((fail_count++))
            fi
        else
            log_warn "Performance script not found (skipping)"
        fi
    else
        log_warn "Python3 not available (skipping performance tests)"
    fi

    # Calculate results
    local total_end=$(date +%s)
    local total_time=$((total_end - total_start))
    local total_tests=$((pass_count + fail_count))

    # Summary
    echo ""
    echo "═══════════════════════════════════════════════════════════"
    echo "  TEST SUMMARY"
    echo "═══════════════════════════════════════════════════════════"
    echo ""
    echo "Total Tests:  $total_tests"
    echo -e "Passed:       ${GREEN}$pass_count${NC}"
    echo -e "Failed:       ${RED}$fail_count${NC}"
    echo "Duration:     ${total_time}s"
    echo ""

    if [ $fail_count -eq 0 ]; then
        log_success "🎉 All tests passed!"
        echo ""
        echo "Next steps:"
        echo "  - Review test results in database (test_results.test_runs)"
        echo "  - Check migration history (public.schema_migrations)"
        echo "  - Monitor performance metrics"
        echo ""
        return 0
    else
        log_error "❌ $fail_count test(s) failed"
        echo ""
        echo "Troubleshooting:"
        echo "  - Check database logs for errors"
        echo "  - Verify all migrations ran successfully"
        echo "  - Review test output above"
        echo ""
        return 1
    fi
}

# Run main
main
exit_code=$?

exit $exit_code
