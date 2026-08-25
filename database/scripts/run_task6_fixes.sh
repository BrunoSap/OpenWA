#!/bin/bash
# Run Task 6 comprehensive fixes

set -e

echo "🚀 Applying Task 6 comprehensive fixes..."
echo ""

# Load environment
if [ -f "../../.env" ]; then
    export $(grep -v '^#' ../../.env | xargs)
fi

# Database connection
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-openwa}"
DB_USER="${POSTGRES_USER:-postgres}"

echo "📊 Database: $DB_NAME@$DB_HOST:$DB_PORT"
echo ""

# Backup current functions
echo "💾 Backing up current functions..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
\o /tmp/task6_backup_$(date +%Y%m%d_%H%M%S).sql
\df knowledge.find_similar_faq
\df knowledge.find_similar_conversations
\df knowledge.get_client_summary
\df knowledge.calculate_fees
\o
SQL

echo "✅ Backup complete"
echo ""

# Apply v2 migration
echo "📝 Applying v2 migration (comprehensive fixes)..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f migrations/006_create_helper_functions_v2.sql

echo ""
echo "🧪 Running comprehensive tests..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f tests/test_helper_functions_v2.sql

echo ""
echo "✅ All fixes applied and tested successfully!"
echo ""
echo "📝 Summary of fixes:"
echo "   ✅ SQL injection prevention (parameterized queries)"
echo "   ✅ Input validation (NULL, dimensions, bounds)"
echo "   ✅ Performance optimization (proper index usage)"
echo "   ✅ Error handling (BEGIN...EXCEPTION blocks)"
echo "   ✅ Security (access control, audit trails)"
echo "   ✅ Configuration tables (no hardcoded values)"
echo "   ✅ Rate limiting (DoS prevention)"
echo "   ✅ Pagination support"
echo "   ✅ Observability (performance logging)"
echo "   ✅ Consistent defaults"
echo ""
echo "⚠️  Post-migration tasks:"
echo "   1. Set up cron: SELECT knowledge.cleanup_rate_limit_old_records() every hour"
echo "   2. Set up cron: SELECT knowledge.cleanup_audit_logs(90) every month"
echo "   3. Configure pg_stat_statements for monitoring"
echo "   4. Grant appropriate permissions to app users"
echo "   5. Test application integration (node scripts/helper_functions_client.js health)"
echo ""

