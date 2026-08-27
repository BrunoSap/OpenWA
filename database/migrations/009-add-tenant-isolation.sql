-- Migration 009: Add tenant isolation for multi-tenant SaaS
-- Phase 9 Plan 1: Tenant entity + nullable tenantId columns

-- 1. Create tenants table in main connection (auth/audit schema)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  plan VARCHAR(20) NOT NULL DEFAULT 'free',
  quota_messages INTEGER NOT NULL DEFAULT 100,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 10,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);

-- 2. Add nullable tenantId column to sessions table (data connection)
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessions_tenant_id ON sessions(tenant_id);

-- 3. Add nullable tenantId column to api_keys table (main connection)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);

-- 4. Add nullable tenantId column to messages table (data connection)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_tenant_id ON messages(tenant_id);

-- 5. Add nullable tenantId column to webhooks table (data connection)
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhooks_tenant_id ON webhooks(tenant_id);

-- 6. Add nullable tenantId column to automation_rules table (data connection)
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_automation_rules_tenant_id ON automation_rules(tenant_id);

-- 7. Add nullable tenantId column to analytics_events table (data connection)
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_analytics_events_tenant_id ON analytics_events(tenant_id);

-- 8. Add nullable tenantId column to intake_leads table (data connection - flat cross-dialect table)
-- Note: intake_staging.leads is the Postgres-specific path, but intake_leads is the entity table name
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'intake_leads') THEN
    ALTER TABLE intake_leads ADD COLUMN IF NOT EXISTS tenant_id UUID;
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intake_leads_tenant_id ON intake_leads(tenant_id);
  END IF;
END $$;

-- 9. Add nullable tenantId column to knowledge_base_documents table (data connection)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'knowledge' AND table_name = 'documents') THEN
    ALTER TABLE knowledge.documents ADD COLUMN IF NOT EXISTS tenant_id UUID;
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_documents_tenant_id ON knowledge.documents(tenant_id);
  END IF;
END $$;

-- 10. Add nullable tenantId column to audit_logs table (main connection)
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);

-- 11. Seed default "Legacy Tenant" for backward compatibility
-- This tenant will be used as fallback for all existing data
INSERT INTO tenants (id, name, slug, plan, quota_messages, rate_limit_per_minute, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Legacy Tenant',
  'legacy',
  'free',
  100,
  10,
  true
)
ON CONFLICT (id) DO NOTHING;

-- Note: NOT NULL constraints are intentionally omitted to allow zero-downtime backfill
-- Future migrations will backfill existing rows with LEGACY_TENANT_ID and add NOT NULL constraints
