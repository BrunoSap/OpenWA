-- Migration 012: Enable PostgreSQL Row-Level Security (RLS) for tenant isolation
-- This migration runs ONLY if RLS_ENABLED=true environment variable is set
-- RLS is defense-in-depth: application-level scoping (TenantScopedRepository) is primary mechanism
-- RLS prevents leaks if application code has bugs (forgot WHERE tenantId filter)

-- Pre-check: This migration should only run in production environments
-- Development and staging use application-level scoping without RLS for debugging

-- Create tenant_admin role for admin bypass
CREATE ROLE tenant_admin;

-- Grant permissions to tenant_admin role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tenant_admin;
GRANT USAGE ON SCHEMA public TO tenant_admin;

-- Enable RLS on tenant-scoped tables
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies for each table
-- Policy uses current_setting('app.tenant_id', true) with missing_ok=true
-- If session variable not set, returns null → policy rejects all rows (safe failure mode)

CREATE POLICY tenant_isolation_sessions ON sessions
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_api_keys ON api_keys
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_messages ON messages
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_webhooks ON webhooks
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_automation_rules ON automation_rules
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_analytics_events ON analytics_events
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_intake_leads ON intake_leads
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_knowledge_base_documents ON knowledge_base_documents
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Create admin bypass policies for tenant_admin role
-- Admin can see all tenants' data when row_security is OFF
-- These policies allow tenant_admin to bypass RLS when needed

CREATE POLICY admin_bypass_sessions ON sessions
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_api_keys ON api_keys
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_messages ON messages
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_webhooks ON webhooks
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_automation_rules ON automation_rules
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_analytics_events ON analytics_events
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_intake_leads ON intake_leads
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_knowledge_base_documents ON knowledge_base_documents
  TO tenant_admin
  USING (true);

CREATE POLICY admin_bypass_audit_logs ON audit_logs
  TO tenant_admin
  USING (true);

-- Rollback SQL (for migration down):
-- DROP POLICY tenant_isolation_sessions ON sessions;
-- DROP POLICY tenant_isolation_api_keys ON api_keys;
-- DROP POLICY tenant_isolation_messages ON messages;
-- DROP POLICY tenant_isolation_webhooks ON webhooks;
-- DROP POLICY tenant_isolation_automation_rules ON automation_rules;
-- DROP POLICY tenant_isolation_analytics_events ON analytics_events;
-- DROP POLICY tenant_isolation_intake_leads ON intake_leads;
-- DROP POLICY tenant_isolation_knowledge_base_documents ON knowledge_base_documents;
-- DROP POLICY tenant_isolation_audit_logs ON audit_logs;
-- DROP POLICY admin_bypass_sessions ON sessions;
-- DROP POLICY admin_bypass_api_keys ON api_keys;
-- DROP POLICY admin_bypass_messages ON messages;
-- DROP POLICY admin_bypass_webhooks ON webhooks;
-- DROP POLICY admin_bypass_automation_rules ON automation_rules;
-- DROP POLICY admin_bypass_analytics_events ON analytics_events;
-- DROP POLICY admin_bypass_intake_leads ON intake_leads;
-- DROP POLICY admin_bypass_knowledge_base_documents ON knowledge_base_documents;
-- DROP POLICY admin_bypass_audit_logs ON audit_logs;
-- ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE api_keys DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE automation_rules DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE analytics_events DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE intake_leads DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_base_documents DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
-- DROP ROLE IF EXISTS tenant_admin;
