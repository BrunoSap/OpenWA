# Codebase Concerns

**Analysis Date:** 2026-08-26

## Tech Debt

**Database Migration Management:**
- Issue: Multiple migration systems coexist - TypeORM migrations (`src/database/migrations/*.ts`) AND raw SQL migrations (`database/migrations/*.sql`)
- Files: `src/database/data-source.ts`, `database/migrations/000_migration_system.sql`
- Impact: Migration drift risk - SQL migrations in `database/` directory not tracked by TypeORM; double-application risk; unclear migration order
- Fix approach: Consolidate to single migration system (prefer TypeORM for application code, document SQL migrations as manual admin operations); create migration audit script to detect drift

**Hardcoded Business Logic in Database Functions:**
- Issue: UAD value (159.21) and fee percentages (30%) hardcoded in SQL function `calculate_fees_v2`
- Files: `database/migrations/20260825120000_security_performance_fixes.sql:274`
- Impact: Requires database migration to change business rules; no runtime configurability
- Fix approach: Already identified - migrate to `bot_config.fee_config` table (documented as TODO in migration comment)

**Legacy Plugin Directory Compatibility:**
- Issue: Dual plugin directory support with deprecation warnings but no removal timeline
- Files: `src/core/plugins/plugin-package-scanner.ts:72-109`
- Impact: Increased maintenance surface; confusing deployment (two directories to manage)
- Fix approach: Set deprecation sunset date; provide migration script; remove compatibility code in next major version

**Webhook Handler Standalone Script:**
- Issue: `webhook-llm-handler.js` is standalone Express app with hardcoded config, duplicates Redis/LLM logic from main app
- Files: `webhook-llm-handler.js:1-426`
- Impact: Configuration drift (separate env vars from main app); no shared type safety; manual deployment coordination
- Fix approach: Migrate to NestJS module in main app (`src/modules/llm-webhook/`) or extract to separate microservice with shared config library

**TypeScript Type Safety Gaps:**
- Issue: 3,552 occurrences of `any`, `unknown`, or type assertions (`as any`) in source code
- Files: 20+ files including `src/engine/engine.factory.spec.ts`, `src/modules/session/session.service.spec.ts`, `src/modules/plugins/plugins.service.ts`
- Impact: Runtime type errors not caught at compile time; reduced IDE autocomplete effectiveness
- Fix approach: Incremental strict typing - enable `noImplicitAny` in `tsconfig.json` with per-file exceptions; prioritize domain model files first

**Test Coverage Ratio:**
- Issue: 412 test files for 996 TypeScript files (~41% file coverage ratio)
- Files: Project-wide
- Impact: Insufficient regression protection; high-risk refactoring
- Fix approach: Target 60% coverage minimum; focus on critical paths (session management, message routing, authentication); add integration tests for multi-adapter scenarios

## Known Bugs

**n8n Workflow Text-as-Audio Misclassification:**
- Symptoms: Text message "Oi?" triggers audio transcription response ("Ouvi seu áudio!")
- Files: Referenced in `docs/archive/BUGS_CORRIGIDOS.md:1-42`
- Trigger: Empty transcription event (`text.trim() === ''`) not properly skipped; event type detection relies on `body.event` which may be undefined
- Workaround: Fixed in `Whatsapp-Unified-Bot.json` via strict empty validation and detailed logging; requires workflow re-import

**LLM Response `<think>` Tags Not Stripped:**
- Symptoms: WhatsApp API rejects messages with 400 Bad Request due to >4096 char limit and malformed JSON
- Files: Referenced in `docs/archive/BUGS_CORRIGIDOS.md:73-143`
- Trigger: n8n node referencing previous node output via `$item("0").$node["..."]` returns undefined; regex removal fails
- Workaround: Changed to `$('Node Name').first().json` syntax; added fallback message if text empty after cleaning

## Security Considerations

**SQL Injection in Vector Search Functions (FIXED):**
- Risk: String interpolation in `find_similar_conversations` and `find_similar_faq` (pre-v2) allowed embedding poisoning
- Files: `database/migrations/20260825120000_security_performance_fixes.sql:1-40`
- Current mitigation: Fixed in `_v2` functions with parameterized queries; v1 functions deprecated but still callable
- Recommendations: Force migration to `_v2` functions; add database-level policy to block `_v1` function calls; remove `_v1` functions in next schema version

**Missing Row-Level Security (RLS) Policies (PARTIALLY FIXED):**
- Risk: Cross-tenant data leaks - any database connection can read all client data
- Files: `database/migrations/20260825120000_security_performance_fixes.sql:43-57`
- Current mitigation: RLS enabled on `clients`, `conversations`, `documents`, `leads` tables; application must set `app.current_tenant_id` session variable
- Recommendations: Audit all application connection points to ensure session variable is set; add connection hook to reject queries without tenant_id; test with non-superuser role (superusers bypass RLS)

**Hardcoded API Keys in Webhook Script:**
- Risk: Default OpenWA API key committed in code (`owa_k1_038fe7...`)
- Files: `webhook-llm-handler.js:22`
- Current mitigation: Environment variable fallback available (`process.env.OPENWA_API_KEY`)
- Recommendations: Remove hardcoded default; fail fast if env var not set; add secrets scanning to pre-commit hook

**Docker Socket Proxy Limitations:**
- Risk: Compromised API container can create containers with host bind-mounts (POST permission enables container-create with any payload)
- Files: `docker-compose.yml:13-48`, documented in `SECURITY.md`
- Current mitigation: Proxy version pinned to v0.4.2; DELETE disabled; proxy on isolated network; documented opt-out via `profiles: ['disabled']`
- Recommendations: Evaluate upgrading to docker-socket-proxy v0.5+ with payload inspection; consider alternative orchestration (Kubernetes RBAC, systemd socket activation)

**Insufficient Audit Trail (PARTIALLY FIXED):**
- Risk: Cannot track data changes for GDPR Article 30 compliance
- Files: `database/migrations/20260825120000_security_performance_fixes.sql:60-70`
- Current mitigation: Added `created_by`/`updated_by` columns; trigger auto-populates `updated_by`; existing `audit_log` table captures changes
- Recommendations: Backfill `created_by` for existing rows (set to 'SYSTEM'); add audit retention policy (7 years GDPR); implement audit log encryption

## Performance Bottlenecks

**N+1 Query Pattern in `get_client_summary` (FIXED):**
- Problem: 4 separate subqueries instead of single JOIN
- Files: `database/migrations/20260825120000_security_performance_fixes.sql:77-95`
- Cause: Original implementation used correlated subqueries for recent messages, docs, and lead data
- Improvement path: Rewritten with CTEs in `get_client_summary_v2` - 4x performance improvement on 100+ clients (200ms → 50ms)

**IVFFlat Index Built on Empty Table:**
- Problem: Index created with `lists=10` parameter when table has 0 rows
- Files: `database/migrations/002_create_schema_knowledge.sql`, `database/PERFORMANCE.md:97-111`
- Cause: Migration runs on empty database; pgvector optimal `lists = sqrt(row_count)` but row_count=0 at migration time
- Improvement path: Use `rebuild_vector_index()` function after bulk data load; documented in `PERFORMANCE.md`; consider index creation as post-deployment step

**Missing Compound Index for Filtered Vector Search:**
- Problem: `WHERE chat_id != X` forces sequential scan before vector search
- Files: `database/migrations/20260825120000_security_performance_fixes.sql:108-115`
- Cause: Only single-column index on `embedding` existed; filter predicates not index-covered
- Improvement path: Fixed via `idx_conversations_chat_embedding` compound index; eliminates N+1 lookup pattern

**Python Performance Test Memory Leak (FIXED):**
- Problem: 1536-dimensional arrays accumulated in memory during 10k+ iteration tests causing OOM
- Files: `database/tests/validate_performance_v2.py`, referenced in `database/TASK7_SECURITY_FIXES.md:163-170`
- Cause: Tight loop generating embeddings with no batching or GC pressure
- Improvement path: Implemented `generate_embedding_batched()` with on-demand generation; passes 1000+ iterations without memory issues

## Fragile Areas

**WhatsApp Adapter Version Pinning:**
- Files: `package.json:18-38` - `@whiskeysockets/baileys: "7.0.0-rc14"`, `whatsapp-web.js: "1.34.7"`
- Why fragile: Both adapters track upstream WhatsApp Web protocol changes; breaking changes common in RCs; version pins prevent security updates
- Safe modification: Test adapter upgrades in isolated environment with full E2E test suite; maintain adapter-specific test fixtures; document known incompatibilities
- Test coverage: `src/engine/adapters/baileys.adapter.spec.ts` (5,362 lines), `src/engine/adapters/whatsapp-web-js.adapter.spec.ts` (7,439 lines)

**Database Schema Evolution:**
- Files: `database/migrations/003_create_schema_intake_staging.sql`, `database/migrations/003_fix_intake_staging_critical_issues.sql`
- Why fragile: Duplicate migration numbering (003 appears twice); 10 critical gaps identified post-deployment (foreign key violations, missing indexes, no version column)
- Safe modification: Apply `003_fix_intake_staging_critical_issues.sql` AFTER base `003`; use `database/migrations/rollback/003_rollback_intake_staging_fixes.sql` for safe revert; verify with `database/tests/test_intake_staging_comprehensive.sql`
- Test coverage: 9 test suites, 28 tests documented in `database/TASK_3_COMPLETION_REPORT.md:160-172`

**Plugin Loader Sandbox Routing:**
- Files: `src/core/plugins/plugin-loader-sandbox-routing.spec.ts`, `src/core/plugins/plugin-package-scanner.ts`
- Why fragile: Dynamic module loading with user-provided code; security boundary relies on Node.js VM contexts which have known escape vectors
- Safe modification: Never disable sandbox in production; audit plugin manifests before installation; implement CSP for plugin-served assets; monitor syscalls via seccomp
- Test coverage: Spec file focuses on routing logic but not sandbox escape scenarios

**Session Lifecycle Management:**
- Files: `src/modules/session/session-engine-lifecycle.service.ts`, `src/modules/session/session.service.spec.ts` (6,250 lines)
- Why fragile: Multiple engine types (Baileys, whatsapp-web.js) with different initialization/teardown semantics; Chromium process orphaning risk if graceful shutdown fails
- Safe modification: Never reduce `stop_grace_period` below 45s in `docker-compose.yml:59`; always await engine teardown; test multi-session concurrent shutdown
- Test coverage: Extensive spec coverage but lacks chaos engineering (forced process kills, OOM scenarios)

## Scaling Limits

**Vector Search at 100k+ Rows:**
- Current capacity: IVFFlat index performs well up to ~50k rows (~45ms avg query time)
- Limit: Query time degrades to >80ms P95 beyond 100k rows; index rebuild time scales linearly
- Scaling path: Migrate to HNSW index at 100k rows (Year 3 projection per `database/PERFORMANCE.md:370-390`); HNSW trade-offs: better recall (95-99% vs 90-94%), slower builds (minutes vs seconds), higher memory usage

**Redis Memory with Long-Term Conversations:**
- Current capacity: 24h TTL on conversation context (`webhook-llm-handler.js:94`)
- Limit: Redis OOM if many concurrent conversations with 20-message history each (~10KB/conversation * 10,000 users = 100MB minimum)
- Scaling path: Implement conversation archival to PostgreSQL after 24h; use Redis only for active sessions; add LRU eviction policy; monitor with `INFO memory` metrics

**BullMQ Queue Depth:**
- Current capacity: No explicit queue size limits
- Limit: Memory exhaustion if webhook events arrive faster than worker processing (e.g., message storm, viral group message)
- Scaling path: Set `maxQueueSize` in BullMQ options; implement backpressure (return 503 when queue >1000); add priority lanes for premium users; scale workers horizontally

**Docker Container Orchestration:**
- Current capacity: Single `docker-proxy` container handles all Docker API requests from `openwa-api`
- Limit: No high availability; proxy restart causes orchestration downtime; no rate limiting on container creates
- Scaling path: Move to Kubernetes with native RBAC (eliminates proxy); implement PodSecurityPolicy for workload isolation; use Horizontal Pod Autoscaler for worker scaling

## Dependencies at Risk

**@whiskeysockets/baileys RC Version:**
- Risk: Release Candidate (7.0.0-rc14) not production-stable; breaking changes between RCs; limited LTS support
- Impact: Potential message delivery failures, protocol incompatibilities, security vulnerabilities
- Migration plan: Monitor upstream for 7.0.0 stable release; maintain test fixtures for protocol regression testing; consider contributing to upstream stability

**TypeORM 1.1.0 (Recently Upgraded):**
- Risk: Major version bump (0.3.x → 1.1.0) - migration system refactored, breaking changes in entity decorators
- Impact: Existing migration scripts may need adjustment; query builder syntax changed
- Migration plan: Already migrated (evidence: `package.json:36` shows 1.1.0); maintain rollback to TypeORM 0.3.x in `package-lock.json` history; document breaking changes

**Node.js 22.13 Engine Requirement:**
- Risk: Cutting-edge version (22.x still in Current release, not LTS until Oct 2025)
- Impact: Hosting provider compatibility issues; fewer Docker base images; potential Node.js bugs
- Migration plan: Target Node.js 20.x LTS (Active until 2026-10-22); test compatibility; update Dockerfile `FROM node:20-alpine`

**Sharp 0.35.3 (Image Processing):**
- Risk: Native dependency with libvips binding; platform-specific compilation; breaking changes in minor versions
- Impact: Docker build failures on ARM64; memory leaks in long-running processes; HEIF/AVIF format incompatibilities
- Migration plan: Pin to 0.35.x series; test on target deployment architecture; consider pure-JS alternative (jimp) for simpler deployments

## Missing Critical Features

**Multi-Tenant Session Isolation:**
- Problem: Current RLS policies require application to set `app.current_tenant_id`, but no enforcement mechanism if app forgets
- Blocks: GDPR-compliant multi-tenant deployments; cannot safely expose API to multiple customers
- Priority: High

**API Rate Limiting Per Session:**
- Problem: Global rate limiting exists (`@nestjs/throttler:14`) but no per-session quotas
- Blocks: Fair usage enforcement; preventing resource exhaustion by single bad actor
- Priority: Medium

**Message Delivery Confirmation:**
- Problem: Webhook sends messages but no ack tracking; no retry mechanism for failed sends
- Blocks: Reliable notification systems; audit trail for message delivery
- Priority: Medium

**Vector Search Result Caching:**
- Problem: Every similarity query hits database; no caching layer for repeated searches
- Blocks: Sub-10ms query latency; horizontal scaling without database load spike
- Priority: Low (not bottleneck yet at current scale)

## Test Coverage Gaps

**WhatsApp Adapter Protocol Changes:**
- What's not tested: Upstream WhatsApp Web protocol version changes (e.g., multi-device protocol v2.3xxx.x updates)
- Files: Adapters have extensive unit tests but no protocol version regression suite
- Risk: Silent message delivery failures after WhatsApp backend updates; broken QR login
- Priority: High

**Concurrent Session Shutdown:**
- What's not tested: Multiple sessions tearing down simultaneously under load
- Files: `src/modules/session/session-engine-lifecycle.service.ts` - no chaos tests
- Risk: Chromium process orphaning; Docker volume deadlocks; database connection pool exhaustion
- Priority: High

**Database Migration Rollback:**
- What's not tested: Rollback scripts in `database/migrations/rollback/*.sql` are documented but not CI-tested
- Files: `database/migrations/rollback/003_rollback_intake_staging_fixes.sql`
- Risk: Failed rollback leaves database in inconsistent state; production downtime during incident recovery
- Priority: Medium

**Plugin Sandbox Escape:**
- What's not tested: Adversarial plugin code attempting to break sandbox (access filesystem, network, process spawn)
- Files: `src/core/plugins/plugin-loader-sandbox-routing.spec.ts` tests routing, not security boundary
- Risk: RCE vulnerability if malicious plugin installed; complete server compromise
- Priority: High

**Redis Failure Scenarios:**
- What's not tested: Webhook handler behavior when Redis is down or slow (>1s response time)
- Files: `webhook-llm-handler.js:59-67` - Redis errors logged but no degraded mode tests
- Risk: Webhook queue stalls; context loss causes incoherent bot responses; 500 errors to users
- Priority: Medium

**Vector Search Recall Degradation:**
- What's not tested: Long-term recall monitoring as data volume grows (tracked only at specific snapshots: 1k, 10k, 50k)
- Files: `database/PERFORMANCE.md:110-125` - no continuous monitoring
- Risk: Slow recall degradation unnoticed; users report "search doesn't find obvious results"
- Priority: Low

---

*Concerns audit: 2026-08-26*
