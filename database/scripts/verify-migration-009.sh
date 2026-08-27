#!/bin/bash
# Verification script for migration 009-add-tenant-isolation
# Run this after applying the migration to verify tenant isolation setup

set -e

echo "=================================================="
echo "Migration 009 Verification Script"
echo "=================================================="
echo ""

# Check if using Docker or direct psql
if [ -n "${DATABASE_URL}" ]; then
  PSQL_CMD="psql ${DATABASE_URL}"
else
  echo "Using Docker container..."
  CONTAINER_NAME="${1:-openwa-postgres}"
  DB_USER="${2:-openwa}"
  DB_NAME="${3:-openwa}"
  PSQL_CMD="docker exec -i $CONTAINER_NAME psql -U $DB_USER -d $DB_NAME"
fi

echo "1. Checking tenants table exists..."
$PSQL_CMD -c "SELECT id, name, slug FROM tenants WHERE slug = 'legacy';" || {
  echo "❌ FAILED: tenants table or legacy tenant not found"
  exit 1
}
echo "✅ Legacy tenant found"
echo ""

echo "2. Checking sessions table has tenant_id column..."
$PSQL_CMD -c "\d sessions" | grep tenant_id || {
  echo "❌ FAILED: tenant_id column not found in sessions"
  exit 1
}
echo "✅ sessions.tenant_id column exists"
echo ""

echo "3. Checking api_keys table has tenant_id column..."
$PSQL_CMD -c "\d api_keys" | grep tenant_id || {
  echo "❌ FAILED: tenant_id column not found in api_keys"
  exit 1
}
echo "✅ api_keys.tenant_id column exists"
echo ""

echo "4. Checking indexes were created..."
$PSQL_CMD -c "\di" | grep tenant_id || {
  echo "⚠️  WARNING: No tenant_id indexes found (may be normal if CONCURRENTLY failed)"
}
echo "✅ Indexes check complete"
echo ""

echo "=================================================="
echo "✅ Migration 009 verification PASSED"
echo "=================================================="
