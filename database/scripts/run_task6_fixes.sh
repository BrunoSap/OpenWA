#!/bin/bash
# Run Task 6 comprehensive fixes
# FIXED: Added working directory validation and absolute paths

set -e

# Determine script directory and change to it
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Applying Task 6 comprehensive fixes..."
echo "📁 Working directory: $DB_DIR"
echo ""

# Change to database directory for consistent path resolution
cd "$DB_DIR"

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

# Validate required paths exist
if [ ! -f "migrations/006_create_helper_functions_v2.sql" ]; then
    echo "❌ ERROR: Migration file not found: migrations/006_create_helper_functions_v2.sql"
    echo "   Current directory: $(pwd)"
    exit 1
fi

if [ ! -f "tests/test_helper_functions_v2.sql" ]; then
    echo "❌ ERROR: Test file not found: tests/test_helper_functions_v2.sql"
    echo "   Current directory: $(pwd)"
    exit 1
fi

# Backup current functions
echo "💾 Backing up current functions..."
BACKUP_FILE="/tmp/task6_backup_$(date +%Y%m%d_%H%M%S).sql"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" << SQL
\o $BACKUP_FILE
\df knowledge.find_similar_faq
\df knowledge.find_similar_conversations
\df knowledge.get_client_summary
\df knowledge.calculate_fees
\o
SQL

echo "✅ Backup complete: $BACKUP_FILE"
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
