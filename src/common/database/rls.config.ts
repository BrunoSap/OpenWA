/**
 * RLS (Row-Level Security) Configuration
 *
 * RLS is defense-in-depth tenant isolation at the PostgreSQL level.
 * Application-level scoping (TenantScopedRepository) is the primary mechanism.
 * RLS prevents leaks if application code has bugs (forgot WHERE tenantId filter).
 *
 * Enable in production after validating app-level scoping in staging.
 */

/**
 * Controls RLS activation based on environment.
 * - Production: RLS enabled (defense-in-depth)
 * - Dev/Staging: RLS disabled (easier debugging, application-level scoping tested in isolation)
 */
export const enableRLS = process.env.RLS_ENABLED === 'true';

/**
 * Database roles that can bypass RLS policies.
 * These roles can execute queries with `SET LOCAL row_security = OFF` to see all tenants' data.
 *
 * Usage: Admin operations (cross-tenant reports, support queries, billing aggregations)
 * Security: All bypasses must be logged via audit-cross-tenant.service
 */
export const rlsBypassRoles = ['tenant_admin'];

/**
 * RLS Policy Enforcement Summary:
 *
 * Tables with RLS enabled (9):
 * - sessions
 * - api_keys
 * - messages
 * - webhooks
 * - automation_rules
 * - analytics_events
 * - intake_leads
 * - knowledge_base_documents
 * - audit_logs
 *
 * Policy behavior:
 * 1. Regular users: USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
 *    - Returns only rows where tenant_id matches session variable
 *    - If app.tenant_id not set: returns empty result (safe failure mode)
 *
 * 2. Admin users (tenant_admin role):
 *    - Can execute: SET LOCAL row_security = OFF
 *    - Sees all tenants' data
 *    - All cross-tenant queries logged in audit_logs
 *
 * Defense-in-depth layers:
 * - Layer 1: Application-level scoping (TenantScopedRepository) — primary, fast, flexible
 * - Layer 2: PostgreSQL RLS (this config) — safety net, database-enforced, production-only
 * - Layer 3: Audit trail (audit-cross-tenant.service) — forensic logging, operator review
 */
