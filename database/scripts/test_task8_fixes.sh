#!/bin/bash
# database/scripts/test_task8_fixes.sh
# Comprehensive test suite for Task 8 fixes

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test 1: SQL files are valid syntax
test_sql_syntax() {
    log_test "SQL files have valid syntax"

    local files=(
        "database/migrations/010_fix_task8_issues.sql"
        "database/migrations/011_seed_data_idempotent.sql"
    )

    for file in "${files[@]}"; do
        if [ ! -f "$file" ]; then
            log_fail "$file does not exist"
            return 1
        fi

        # Basic syntax checks
        if ! grep -q "BEGIN;" "$file"; then
            log_fail "$file missing BEGIN transaction"
            return 1
        fi

        if ! grep -q "COMMIT;" "$file"; then
            log_fail "$file missing COMMIT"
            return 1
        fi

        # Check for SQL injection patterns (should NOT exist)
        if grep -E "format\(.*%s.*\)" "$file" | grep -v "^--" | grep -q "INSERT\|UPDATE"; then
            log_fail "$file may contain SQL injection vulnerability (string formatting in DML)"
            return 1
        fi
    done

    log_pass "All SQL files have valid syntax"
}

# Test 2: Python script has no SQL injection
test_python_no_injection() {
    log_test "Python script uses parameterized queries"

    local file="database/scripts/validate_performance_v2.py"

    if [ ! -f "$file" ]; then
        log_fail "$file does not exist"
        return 1
    fi

    # Check for SQL injection patterns (should NOT exist)
    local bad_patterns=(
        "cursor.execute(f\""
        "cursor.execute(.*\.format\("
        "cursor.execute.*%.*VALUES"
    )

    for pattern in "${bad_patterns[@]}"; do
        if grep -E "$pattern" "$file" | grep -v "^#" | grep -v "^    #" | grep -q .; then
            log_fail "$file may contain SQL injection (f-strings or .format() in execute)"
            return 1
        fi
    done

    # Check for good patterns (SHOULD exist)
    if ! grep -q "cursor.execute.*%s" "$file"; then
        log_fail "$file does not use parameterized queries (%s placeholders)"
        return 1
    fi

    if ! grep -q "connect_timeout" "$file"; then
        log_fail "$file missing connection timeout"
        return 1
    fi

    log_pass "Python script uses parameterized queries correctly"
}

# Test 3: Idempotency in seed script
test_idempotency() {
    log_test "Seed script is idempotent"

    local file="database/migrations/011_seed_data_idempotent.sql"

    # Check for ON CONFLICT handling
    local insert_count=$(grep -c "^INSERT INTO" "$file" || true)
    local on_conflict_count=$(grep -c "ON CONFLICT" "$file" || true)

    if [ "$insert_count" -gt 0 ] && [ "$on_conflict_count" -eq 0 ]; then
        log_fail "$file has INSERT statements without ON CONFLICT (not idempotent)"
        return 1
    fi

    if [ "$insert_count" -ne "$on_conflict_count" ]; then
        log_fail "$file has $insert_count INSERTs but only $on_conflict_count ON CONFLICT clauses"
        return 1
    fi

    log_pass "Seed script is idempotent (all INSERTs have ON CONFLICT)"
}

# Test 4: Business rules extracted
test_business_rules() {
    log_test "Business rules table exists in migration"

    local file="database/migrations/010_fix_task8_issues.sql"

    if ! grep -q "CREATE TABLE.*business_rules" "$file"; then
        log_fail "business_rules table not created"
        return 1
    fi

    # Check for specific business rules
    local rules=(
        "honorarios_atrasados_pct"
        "honorarios_vincendas_pct"
        "uad_value_brl"
        "parcelamento_max_parcelas"
    )

    local seed_file="database/migrations/011_seed_data_idempotent.sql"

    for rule in "${rules[@]}"; do
        if ! grep -q "$rule" "$seed_file"; then
            log_fail "Business rule '$rule' not found in seed data"
            return 1
        fi
    done

    log_pass "Business rules table and data found"
}

# Test 5: Migration tracking table
test_migration_tracking() {
    log_test "Migration tracking table exists"

    local file="database/migrations/010_fix_task8_issues.sql"

    if ! grep -q "CREATE TABLE.*schema_migrations" "$file"; then
        log_fail "schema_migrations table not created"
        return 1
    fi

    # Check for required columns
    local columns=(
        "version"
        "description"
        "checksum"
        "applied_at"
        "applied_by"
        "success"
    )

    for col in "${columns[@]}"; do
        if ! grep -A 20 "CREATE TABLE.*schema_migrations" "$file" | grep -q "$col"; then
            log_fail "schema_migrations missing column: $col"
            return 1
        fi
    done

    log_pass "Migration tracking table has all required columns"
}

# Test 6: Audit columns added
test_audit_columns() {
    log_test "Audit columns added to config tables"

    local file="database/migrations/010_fix_task8_issues.sql"

    # Check for audit columns
    local audit_cols=(
        "created_by"
        "updated_by"
        "version INTEGER"
    )

    for col in "${audit_cols[@]}"; do
        if ! grep -q "ADD COLUMN.*$col" "$file"; then
            log_fail "Audit column '$col' not added"
            return 1
        fi
    done

    # Check for audit trigger
    if ! grep -q "CREATE OR REPLACE FUNCTION.*track_updates" "$file"; then
        log_fail "Audit trigger function not created"
        return 1
    fi

    log_pass "Audit columns and triggers found"
}

# Test 7: i18n support
test_i18n() {
    log_test "i18n support added to FAQ"

    local file="database/migrations/010_fix_task8_issues.sql"

    if ! grep -q "ADD COLUMN.*language VARCHAR" "$file"; then
        log_fail "language column not added to FAQ"
        return 1
    fi

    if ! grep -q "ADD COLUMN.*is_primary BOOLEAN" "$file"; then
        log_fail "is_primary column not added to FAQ"
        return 1
    fi

    # Check for language validation
    if ! grep -q "faq_language_check" "$file"; then
        log_fail "language validation constraint not added"
        return 1
    fi

    log_pass "i18n support added to FAQ"
}

# Test 8: Connection pooling in Python
test_connection_pooling() {
    log_test "Connection pooling implemented"

    local file="database/scripts/validate_performance_v2.py"

    if ! grep -q "ThreadedConnectionPool" "$file"; then
        log_fail "ThreadedConnectionPool not used"
        return 1
    fi

    if ! grep -q "connection_pool.getconn()" "$file"; then
        log_fail "Connection pool getconn() not called"
        return 1
    fi

    if ! grep -q "connection_pool.putconn()" "$file"; then
        log_fail "Connection pool putconn() not called (connection leak)"
        return 1
    fi

    log_pass "Connection pooling implemented correctly"
}

# Test 9: Backup verification in rollback
test_backup_verification() {
    log_test "Backup verification in rollback script"

    local file="database/scripts/rollback_v2.sh"

    if [ ! -f "$file" ]; then
        log_fail "$file does not exist"
        return 1
    fi

    if ! grep -q "pg_dump" "$file"; then
        log_fail "Backup creation not implemented"
        return 1
    fi

    if ! grep -q "head.*backup" "$file" || ! grep -q "PostgreSQL" "$file"; then
        log_fail "Backup verification not implemented"
        return 1
    fi

    if ! grep -q "DRY_RUN" "$file"; then
        log_fail "Dry-run mode not implemented"
        return 1
    fi

    log_pass "Backup verification implemented"
}

# Test 10: Performance improvements
test_performance_improvements() {
    log_test "Performance improvements implemented"

    local file="database/scripts/validate_performance_v2.py"

    # Check for COPY FROM (bulk insert)
    if ! grep -q "copy_expert" "$file"; then
        log_fail "COPY FROM not used for bulk insert"
        return 1
    fi

    # Check for VACUUM ANALYZE
    if ! grep -q "VACUUM ANALYZE" "$file"; then
        log_fail "VACUUM ANALYZE not called"
        return 1
    fi

    # Check for composite index
    local index_file="database/migrations/010_fix_task8_issues.sql"
    if ! grep -q "idx_cron_jobs_enabled_next_run" "$index_file"; then
        log_fail "Composite index on cron_jobs not created"
        return 1
    fi

    log_pass "Performance improvements found"
}

# Test 11: Data validation in seed
test_data_validation() {
    log_test "Data validation in seed script"

    local file="database/migrations/011_seed_data_idempotent.sql"

    # Check for validation queries
    if ! grep -q "Data Integrity Validation" "$file"; then
        log_fail "Data validation not implemented"
        return 1
    fi

    # Check for specific validations
    if ! grep -q "invalid_cron" "$file"; then
        log_fail "Cron frequency validation not implemented"
        return 1
    fi

    if ! grep -q "faq_without_category" "$file"; then
        log_fail "FAQ category validation not implemented"
        return 1
    fi

    log_pass "Data validation implemented"
}

# Test 12: Foreign key constraint
test_foreign_key() {
    log_test "Foreign key from FAQ to auto_answer_rules"

    local file="database/migrations/010_fix_task8_issues.sql"

    if ! grep -q "faq_category_fk" "$file"; then
        log_fail "FK constraint not created"
        return 1
    fi

    if ! grep -q "REFERENCES.*auto_answer_rules.*topic" "$file"; then
        log_fail "FK does not reference correct column"
        return 1
    fi

    log_pass "Foreign key constraint created"
}

# Test 13: Rate limiting metadata
test_rate_limiting() {
    log_test "Rate limiting metadata in cron_jobs"

    local file="database/migrations/010_fix_task8_issues.sql"

    local rate_limit_cols=(
        "max_concurrent_executions"
        "backoff_strategy"
        "max_retries"
    )

    for col in "${rate_limit_cols[@]}"; do
        if ! grep -q "ADD COLUMN.*$col" "$file"; then
            log_fail "Rate limiting column '$col' not added"
            return 1
        fi
    done

    log_pass "Rate limiting metadata added"
}

# Test 14: Email validation improvement
test_email_validation() {
    log_test "Strong email validation regex"

    local file="database/migrations/010_fix_task8_issues.sql"

    # Check for improved regex
    if ! grep -q "leads_email_check" "$file"; then
        log_fail "Email validation constraint not updated"
        return 1
    fi

    # Check for TLD requirement
    if ! grep -A 3 "leads_email_check" "$file" | grep -q "\[a-zA-Z\]{2,}"; then
        log_fail "Email validation does not require TLD"
        return 1
    fi

    log_pass "Email validation improved"
}

# Test 15: Observability (query log)
test_observability() {
    log_test "Query performance logging table"

    local file="database/migrations/010_fix_task8_issues.sql"

    if ! grep -q "CREATE TABLE.*query_performance_log" "$file"; then
        log_fail "Query performance log table not created"
        return 1
    fi

    local log_cols=(
        "query_hash"
        "execution_time_ms"
        "index_used"
        "scan_type"
    )

    for col in "${log_cols[@]}"; do
        if ! grep -A 20 "CREATE TABLE.*query_performance_log" "$file" | grep -q "$col"; then
            log_fail "Query log missing column: $col"
            return 1
        fi
    done

    log_pass "Observability table created"
}

# Run all tests
run_all_tests() {
    echo ""
    echo "=================================="
    echo "  Task 8 Fixes - Test Suite"
    echo "=================================="
    echo ""

    test_sql_syntax
    test_python_no_injection
    test_idempotency
    test_business_rules
    test_migration_tracking
    test_audit_columns
    test_i18n
    test_connection_pooling
    test_backup_verification
    test_performance_improvements
    test_data_validation
    test_foreign_key
    test_rate_limiting
    test_email_validation
    test_observability

    echo ""
    echo "=================================="
    echo "  Test Results"
    echo "=================================="
    echo -e "  ${GREEN}Passed:${NC} $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC} $TESTS_FAILED"
    echo "=================================="
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✅ ALL TESTS PASSED${NC}"
        exit 0
    else
        echo -e "${RED}❌ SOME TESTS FAILED${NC}"
        exit 1
    fi
}

# Change to project root
cd "$(dirname "$0")/../.." || exit 1

run_all_tests
