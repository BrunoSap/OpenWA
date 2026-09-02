#!/bin/bash

# OpenWA E2E Test Suite Runner
# Executes all E2E tests and generates comprehensive report

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPORT_FILE="e2e-test-report.txt"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# Counters
TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_SKIPPED=0

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   OpenWA E2E Test Suite Runner        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Started at: $TIMESTAMP"
echo ""

# Initialize report
cat > "$REPORT_FILE" << EOF
OpenWA E2E Test Report
======================
Generated: $TIMESTAMP

EOF

# Function to run test category
run_test_category() {
  local category_name="$1"
  shift
  local tests=("$@")

  local passed=0
  local failed=0
  local skipped=0

  echo -e "${BLUE}━━━ $category_name ━━━${NC}"
  echo "" >> "$REPORT_FILE"
  echo "## $category_name" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  for test in "${tests[@]}"; do
    if [ -f "test/$test" ]; then
      echo -n "  🧪 $test... "

      if npm run test:e2e -- "$test" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        echo "  ✅ $test - PASSED" >> "$REPORT_FILE"
        ((passed++))
        ((TOTAL_PASSED++))
      else
        echo -e "${RED}✗ FAILED${NC}"
        echo "  ❌ $test - FAILED" >> "$REPORT_FILE"
        ((failed++))
        ((TOTAL_FAILED++))

        # Capture error details
        npm run test:e2e -- "$test" >> "$REPORT_FILE" 2>&1 || true
      fi
    else
      echo -e "  ${YELLOW}⊘ SKIPPED${NC} (not implemented): $test"
      echo "  ⊘ $test - SKIPPED (not implemented)" >> "$REPORT_FILE"
      ((skipped++))
      ((TOTAL_SKIPPED++))
    fi
  done

  echo ""
  echo "  Summary: ✅ $passed | ❌ $failed | ⊘ $skipped"
  echo ""
  echo "  Category Summary: ✅ $passed | ❌ $failed | ⊘ $skipped" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
}

# 🔴 Priority ALTA (Critical)
CRITICAL_TESTS=(
  "dashboard-login.e2e-spec.ts"
  "session-qr-flow.e2e-spec.ts"
  "billing-stripe.e2e-spec.ts"
  "message-media.e2e-spec.ts"
  "postgres-boot.e2e-spec.ts"
  "tenant-billing-tracking.e2e-spec.ts"
)

run_test_category "🔴 CRITICAL (Priority ALTA)" "${CRITICAL_TESTS[@]}"

# 🟡 Priority MÉDIA
MEDIUM_TESTS=(
  "prometheus-scraping.e2e-spec.ts"
  "rag-prompt-caching.e2e-spec.ts"
  "send-pacing.e2e-spec.ts"
  "llm-automation.e2e-spec.ts"
  "memory-retention.e2e-spec.ts"
  "docker-stack.e2e-spec.ts"
  "webhook-payload.e2e-spec.ts"
  "grafana-dashboard.e2e-spec.ts"
)

run_test_category "🟡 MEDIUM (Priority MÉDIA)" "${MEDIUM_TESTS[@]}"

# ✅ Existing Tests (Already Implemented)
EXISTING_TESTS=(
  "app.e2e-spec.ts"
  "analytics-kpis.e2e-spec.ts"
  "analytics-ml.e2e-spec.ts"
  "session-scope.e2e-spec.ts"
  "tenant-isolation.e2e-spec.ts"
  "webhooks.e2e-spec.ts"
  "message-send.e2e-spec.ts"
  "intake-e2e-cycle.e2e-spec.ts"
  "memory-e2e-cycle.e2e-spec.ts"
  "rag-e2e-cycle.e2e-spec.ts"
)

run_test_category "✅ EXISTING (Already Implemented)" "${EXISTING_TESTS[@]}"

# Generate final report
echo "" >> "$REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" >> "$REPORT_FILE"
echo "## FINAL SUMMARY" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "  Total Tests: $((TOTAL_PASSED + TOTAL_FAILED + TOTAL_SKIPPED))" >> "$REPORT_FILE"
echo "  ✅ Passed: $TOTAL_PASSED" >> "$REPORT_FILE"
echo "  ❌ Failed: $TOTAL_FAILED" >> "$REPORT_FILE"
echo "  ⊘ Skipped: $TOTAL_SKIPPED" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Calculate pass rate
TOTAL_RAN=$((TOTAL_PASSED + TOTAL_FAILED))
if [ $TOTAL_RAN -gt 0 ]; then
  PASS_RATE=$((TOTAL_PASSED * 100 / TOTAL_RAN))
  echo "  Pass Rate: ${PASS_RATE}%" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "Generated at: $(date +"%Y-%m-%d %H:%M:%S")" >> "$REPORT_FILE"

# Print final summary
echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         FINAL TEST SUMMARY             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""
echo "  Total Tests: $((TOTAL_PASSED + TOTAL_FAILED + TOTAL_SKIPPED))"
echo -e "  ${GREEN}✅ Passed: $TOTAL_PASSED${NC}"
echo -e "  ${RED}❌ Failed: $TOTAL_FAILED${NC}"
echo -e "  ${YELLOW}⊘ Skipped: $TOTAL_SKIPPED${NC}"
echo ""

if [ $TOTAL_RAN -gt 0 ]; then
  echo "  Pass Rate: ${PASS_RATE}%"
  echo ""
fi

echo "  📄 Full report saved to: $REPORT_FILE"
echo ""

# Exit with appropriate code
if [ $TOTAL_FAILED -eq 0 ]; then
  if [ $TOTAL_SKIPPED -gt 0 ]; then
    echo -e "${YELLOW}⚠️  All implemented tests passed, but $TOTAL_SKIPPED tests are not yet implemented.${NC}"
    echo ""
    echo "  👉 Next steps:"
    echo "     1. Implement missing tests (see E2E_TEST_ROADMAP.md)"
    echo "     2. Run this script again"
    echo ""
  else
    echo -e "${GREEN}🎉 All tests passed! OpenWA is production-ready.${NC}"
    echo ""
  fi
  exit 0
else
  echo -e "${RED}⚠️  $TOTAL_FAILED test(s) failed. Check $REPORT_FILE for details.${NC}"
  echo ""
  echo "  👉 To debug a specific test:"
  echo "     npm run test:e2e -- [test-name].e2e-spec.ts --verbose"
  echo ""
  exit 1
fi
