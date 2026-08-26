#!/bin/bash
# database/scripts/test_task8_fixes_v2.sh
# AAA-structured test suite with actual database verification

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0
TEST_RESULTS=()

# Database connection (read from env or use defaults)
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

# ════════════════════════════════════════════════════════════
# LOGGING FUNCTIONS
# ════════════════════════════════════════════════════════════

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
    TEST_RESULTS+=("PASS: $1")
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
    TEST_RESULTS+=("FAIL: $1")
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# ════════════════════════════════════════════════════════════
# DATABASE QUERY HELPER
# ════════════════════════════════════════════════════════════

query_db() {
    local sql="$1"
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$sql" 2>&1
}

# ════════════════════════════════════════════════════════════
# TEST FUNCTIONS (AAA STRUCTURE)
# ════════════════════════════════════════════════════════════

test_database_connectivity() {
    log_test "Database connectivity"

    # ARRANGE: none needed

    # ACT: Query database version
    local result
    result=$(query_db "SELECT version();")

    # ASSERT: Query succeeded and returned PostgreSQL version
    if [[ $result == *"PostgreSQL"* ]]; then
        log_pass "Database connection successful"
        return 0
    else
        log_fail "Cannot connect to database: $result"
        return 1
    fi
}

test_foreign_key_exists() {
    log_test "Foreign key: conversations.client_id"

    # ARRANGE: none needed

    # ACT: Query information_schema for FK constraint
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.table_constraints
        WHERE constraint_schema = 'knowledge'
        AND table_name = 'conversations'
        AND constraint_name = 'conversations_client_id_fkey'
        AND constraint_type = 'FOREIGN KEY';
    ")

    # ASSERT: FK exists (count = 1)
    if [[ "$result" == "1" ]]; then
        log_pass "conversations.client_id foreign key exists"
        return 0
    else
        log_fail "conversations.client_id foreign key not found"
        return 1
    fi
}

test_cpf_validation_constraint() {
    log_test "CPF validation constraint exists"

    # ARRANGE: none needed

    # ACT: Query for CPF check constraint
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.check_constraints
        WHERE constraint_schema = 'knowledge'
        AND constraint_name LIKE '%cpf%'
        AND check_clause LIKE '%mod%';
    ")

    # ASSERT: Constraint exists
    if [[ "$result" -ge "1" ]]; then
        log_pass "CPF mod-11 validation constraint exists"
        return 0
    else
        log_fail "CPF validation constraint not found"
        return 1
    fi
}

test_email_validation_constraint() {
    log_test "Email validation constraint exists"

    # ARRANGE: none needed

    # ACT: Query for email check constraint
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.check_constraints
        WHERE constraint_schema = 'intake_staging'
        AND constraint_name LIKE '%email%';
    ")

    # ASSERT: Constraint exists
    if [[ "$result" -ge "1" ]]; then
        log_pass "Email validation constraint exists"
        return 0
    else
        log_fail "Email validation constraint not found"
        return 1
    fi
}

test_composite_index_exists() {
    log_test "Composite index: idx_conversations_chat_session_time"

    # ARRANGE: none needed

    # ACT: Query pg_indexes
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM pg_indexes
        WHERE schemaname = 'knowledge'
        AND indexname = 'idx_conversations_chat_session_time';
    ")

    # ASSERT: Index exists
    if [[ "$result" == "1" ]]; then
        log_pass "Composite index exists"
        return 0
    else
        log_fail "Composite index not found"
        return 1
    fi
}

test_partial_index_exists() {
    log_test "Partial index: idx_conversations_has_embedding"

    # ARRANGE: none needed

    # ACT: Query pg_indexes
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM pg_indexes
        WHERE schemaname = 'knowledge'
        AND indexname = 'idx_conversations_has_embedding';
    ")

    # ASSERT: Index exists
    if [[ "$result" == "1" ]]; then
        log_pass "Partial index exists"
        return 0
    else
        log_fail "Partial index not found"
        return 1
    fi
}

test_total_messages_trigger_exists() {
    log_test "total_messages trigger exists"

    # ARRANGE: none needed

    # ACT: Query pg_trigger
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'knowledge'
        AND c.relname = 'conversations'
        AND t.tgname LIKE '%total_messages%';
    ")

    # ASSERT: Trigger exists
    if [[ "$result" -ge "1" ]]; then
        log_pass "total_messages trigger exists"
        return 0
    else
        log_fail "total_messages trigger not found"
        return 1
    fi
}

test_business_rules_table() {
    log_test "business_rules table exists"

    # ARRANGE: none needed

    # ACT: Query information_schema
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'business_config'
        AND table_name = 'business_rules';
    ")

    # ASSERT: Table exists
    if [[ "$result" == "1" ]]; then
        log_pass "business_rules table exists"
        return 0
    else
        log_fail "business_rules table not found"
        return 1
    fi
}

test_migration_tracking_table() {
    log_test "schema_migrations table exists"

    # ARRANGE: none needed

    # ACT: Query information_schema
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'schema_migrations';
    ")

    # ASSERT: Table exists
    if [[ "$result" == "1" ]]; then
        log_pass "schema_migrations table exists"
        return 0
    else
        log_fail "schema_migrations table not found"
        return 1
    fi
}

test_audit_columns_exist() {
    log_test "Audit columns exist on config tables"

    # ARRANGE: none needed

    # ACT: Check for created_by column in business_rules
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'business_config'
        AND table_name = 'business_rules'
        AND column_name IN ('created_by', 'updated_by', 'version');
    ")

    # ASSERT: All 3 audit columns exist
    if [[ "$result" == "3" ]]; then
        log_pass "Audit columns exist (created_by, updated_by, version)"
        return 0
    else
        log_fail "Audit columns incomplete (expected 3, found $result)"
        return 1
    fi
}

test_i18n_columns_exist() {
    log_test "i18n columns exist on FAQ table"

    # ARRANGE: none needed

    # ACT: Check for language and is_primary columns
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'business_config'
        AND table_name = 'faq'
        AND column_name IN ('language', 'is_primary');
    ")

    # ASSERT: Both columns exist
    if [[ "$result" == "2" ]]; then
        log_pass "i18n columns exist (language, is_primary)"
        return 0
    else
        log_fail "i18n columns incomplete (expected 2, found $result)"
        return 1
    fi
}

test_rate_limiting_columns() {
    log_test "Rate limiting columns exist on cron_jobs"

    # ARRANGE: none needed

    # ACT: Check for rate limiting columns
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'business_config'
        AND table_name = 'cron_jobs'
        AND column_name IN ('max_concurrent_executions', 'backoff_strategy', 'max_retries');
    ")

    # ASSERT: All 3 columns exist
    if [[ "$result" == "3" ]]; then
        log_pass "Rate limiting columns exist"
        return 0
    else
        log_fail "Rate limiting columns incomplete (expected 3, found $result)"
        return 1
    fi
}

test_seed_data_present() {
    log_test "Seed data present in business_rules"

    # ARRANGE: none needed

    # ACT: Count rows in business_rules
    local result
    result=$(query_db "
        SELECT COUNT(*) FROM business_config.business_rules;
    ")

    # ASSERT: At least 1 row exists
    if [[ "$result" -ge "1" ]]; then
        log_pass "Seed data present ($result business rules)"
        return 0
    else
        log_fail "No seed data found in business_rules"
        return 1
    fi
}

# ════════════════════════════════════════════════════════════
# PYTHON SCRIPT TESTS
# ════════════════════════════════════════════════════════════

test_python_script_exists() {
    log_test "Performance validation script exists"

    # ARRANGE: none needed

    local file="database/scripts/validate_performance_v3.py"

    # ACT: Check file exists and is executable
    if [[ -f "$file" ]]; then
        # ASSERT: File exists
        log_pass "validate_performance_v3.py exists"
        return 0
    else
        log_fail "validate_performance_v3.py not found"
        return 1
    fi
}

test_python_syntax() {
    log_test "Python script has valid syntax"

    # ARRANGE: none needed

    local file="database/scripts/validate_performance_v3.py"

    # ACT: Run Python syntax check
    if python3 -m py_compile "$file" 2>/dev/null; then
        # ASSERT: Syntax is valid
        log_pass "Python syntax valid"
        return 0
    else
        log_fail "Python syntax errors"
        return 1
    fi
}

test_python_no_sql_injection() {
    log_test "Python script uses parameterized queries"

    # ARRANGE: none needed

    local file="database/scripts/validate_performance_v3.py"

    # ACT: Search for bad patterns
    if grep -E "cursor\.execute\(f['\"]" "$file" | grep -v "^#" | grep -q .; then
        log_fail "Found f-string in cursor.execute (SQL injection risk)"
        return 1
    fi

    if grep -E "cursor\.execute\(.*\.format\(" "$file" | grep -v "^#" | grep -q .; then
        log_fail "Found .format() in cursor.execute (SQL injection risk)"
        return 1
    fi

    # ASSERT: Good pattern exists
    if grep -q "cursor.execute.*%s" "$file"; then
        log_pass "Parameterized queries used (no SQL injection risk)"
        return 0
    else
        log_fail "No parameterized queries found"
        return 1
    fi
}

test_python_has_aaa_structure() {
    log_test "Python script has AAA structure markers"

    # ARRANGE: none needed

    local file="database/scripts/validate_performance_v3.py"

    # ACT: Search for AAA comments
    local arrange_count=$(grep -c "# ARRANGE:" "$file" || true)
    local act_count=$(grep -c "# ACT:" "$file" || true)
    local assert_count=$(grep -c "# ASSERT:" "$file" || true)

    # ASSERT: AAA markers exist
    if [[ "$arrange_count" -ge "3" && "$act_count" -ge "3" && "$assert_count" -ge "3" ]]; then
        log_pass "AAA structure markers found (ARRANGE: $arrange_count, ACT: $act_count, ASSERT: $assert_count)"
        return 0
    else
        log_fail "Insufficient AAA markers (ARRANGE: $arrange_count, ACT: $act_count, ASSERT: $assert_count)"
        return 1
    fi
}

# ════════════════════════════════════════════════════════════
# SQL TEST SCRIPT
# ════════════════════════════════════════════════════════════

test_sql_test_script_exists() {
    log_test "SQL test script exists"

    # ARRANGE: none needed

    local file="database/tests/test_comprehensive_fixes_v2.sql"

    # ACT: Check file exists
    if [[ -f "$file" ]]; then
        # ASSERT: File exists
        log_pass "test_comprehensive_fixes_v2.sql exists"
        return 0
    else
        log_fail "test_comprehensive_fixes_v2.sql not found"
        return 1
    fi
}

test_sql_has_test_framework() {
    log_test "SQL test script has test framework"

    # ARRANGE: none needed

    local file="database/tests/test_comprehensive_fixes_v2.sql"

    # ACT: Check for test framework functions
    if grep -q "test_framework.run_test" "$file"; then
        # ASSERT: Framework exists
        log_pass "SQL test framework found"
        return 0
    else
        log_fail "SQL test framework not found"
        return 1
    fi
}

test_sql_has_test_results_table() {
    log_test "SQL test script creates results table"

    # ARRANGE: none needed

    local file="database/tests/test_comprehensive_fixes_v2.sql"

    # ACT: Check for test_results table creation
    if grep -q "CREATE TEMP TABLE test_results" "$file"; then
        # ASSERT: Results table created
        log_pass "test_results table created"
        return 0
    else
        log_fail "test_results table not created"
        return 1
    fi
}

# ════════════════════════════════════════════════════════════
# TEST ORCHESTRATION
# ════════════════════════════════════════════════════════════

run_all_tests() {
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  Task 8 Fixes - Test Suite V2 (AAA-structured)"
    echo "════════════════════════════════════════════════════════════"
    echo ""
    log_info "Database: $DB_NAME@$DB_HOST:$DB_PORT"
    echo ""

    # Database connectivity tests
    test_database_connectivity || true

    # Schema tests (actual database verification)
    test_foreign_key_exists || true
    test_cpf_validation_constraint || true
    test_email_validation_constraint || true
    test_composite_index_exists || true
    test_partial_index_exists || true
    test_total_messages_trigger_exists || true
    test_business_rules_table || true
    test_migration_tracking_table || true
    test_audit_columns_exist || true
    test_i18n_columns_exist || true
    test_rate_limiting_columns || true
    test_seed_data_present || true

    # Python script tests
    test_python_script_exists || true
    test_python_syntax || true
    test_python_no_sql_injection || true
    test_python_has_aaa_structure || true

    # SQL test script tests
    test_sql_test_script_exists || true
    test_sql_has_test_framework || true
    test_sql_has_test_results_table || true

    # Print summary
    echo ""
    echo "════════════════════════════════════════════════════════════"
    echo "  Test Results"
    echo "════════════════════════════════════════════════════════════"
    echo -e "  ${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC} $TESTS_FAILED"
    echo "════════════════════════════════════════════════════════════"
    echo ""

    # Print detailed results
    echo "Detailed Results:"
    for result in "${TEST_RESULTS[@]}"; do
        if [[ $result == PASS:* ]]; then
            echo -e "  ${GREEN}✅${NC} ${result#PASS: }"
        else
            echo -e "  ${RED}❌${NC} ${result#FAIL: }"
        fi
    done
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        exit 0
    else
        echo -e "${RED}❌ $TESTS_FAILED TESTS FAILED${NC}"
        exit 1
    fi
}

# Change to project root
cd "$(dirname "$0")/../.." || exit 1

run_all_tests
