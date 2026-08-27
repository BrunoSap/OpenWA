# Next Phases - OpenWA Platform

**Created:** 2026-08-27
**Status:** Awaiting gap analysis + council decision
**Context:** E2E roadmap 100% complete (Phases 1-6). Planning next evolution.

---

## Phase 7: Dashboard UI Visualization

**Goal:** Interface visual para consumir analytics backend (Phase 6 deliverables)

**Approach Options:**
- **Option A (MVP):** Grafana dashboards consuming REST/SSE endpoints (~2h)
- **Option B (Custom):** React SPA with design system (~3-5 days)

**Prerequisites:** Phase 6 analytics backend complete ✅

**Deliverables:**
- Dashboard consuming 10 REST endpoints
- Real-time updates via SSE stream (10s refresh)
- Alert visualization (active rules + history)
- Export functionality (CSV/JSON download)
- Responsive design (mobile + desktop)

**Success Criteria:**
- Dashboard loads in <2s
- Real-time metrics update every 10s
- Alert notifications displayed prominently
- Drill-down from overview to details working
- Export downloads complete data

**Estimated Effort:** 
- Grafana MVP: ~2h (configuration only)
- React SPA: ~3-5 days (design + implementation + tests)

---

## Phase 8: Horizontal Scaling & Production Hardening

**Goal:** Preparar plataforma para alto volume e alta disponibilidade

**Why This Matters:**
- Single-instance deployment é SPOF
- No session affinity = broken multi-replica
- No distributed state = race conditions
- No health checks = blind deployments

**Deliverables:**

### 8.1. Multi-Replica Support
- Session affinity via sticky cookies
- Shared session state (Redis Cluster ou PostgreSQL)
- Load balancer configuration (Nginx/HAProxy/AWS ALB)

### 8.2. Health & Readiness Probes
- `/health` endpoint (liveness probe)
- `/ready` endpoint (readiness probe checking DB/Redis/Engine)
- Graceful shutdown (drain connections before SIGTERM)

### 8.3. Distributed State
- Redis Cluster for cache + session storage
- PostgreSQL replication (primary + read replicas)
- BullMQ queue shared across replicas

### 8.4. Monitoring & Observability
- Distributed tracing (OpenTelemetry?)
- Centralized logging (already has Loki per ARCHITECTURE.md)
- SLO/SLI definitions (uptime, latency, error rate)

**Success Criteria:**
- 3+ replicas running simultaneously without conflicts
- Session persistence across replica failures
- Zero downtime deployments (rolling updates)
- Health checks prevent traffic to unhealthy replicas
- Load distributed evenly across replicas

**Estimated Effort:** ~5-7 days

---

## Phase 9: Multi-Tenant Support

**Goal:** Transformar OpenWA em plataforma SaaS multi-cliente

**Why This Matters:**
- Revenue model: charge per tenant
- Operational efficiency: single deployment, many customers
- Data isolation: regulatory compliance (LGPD/GDPR)

**Deliverables:**

### 9.1. Tenant Isolation
- `tenantId` column in all user data tables
- Row-level security policies (PostgreSQL RLS)
- Tenant-scoped queries via TypeORM global filter
- Audit trail per tenant

### 9.2. API Key Management
- API keys scoped to tenant (not global)
- Rate limiting per tenant (not global)
- Usage tracking per tenant for billing
- Tenant admin API (CRUD tenants, manage keys)

### 9.3. Billing & Usage Tracking
- Usage metrics per tenant (messages, tokens, storage)
- Billing integration (Stripe/PagSeguro)
- Usage quotas with soft/hard limits
- Overage alerts and billing

### 9.4. Tenant Onboarding
- Self-service signup flow
- Tenant provisioning automation
- Onboarding wizard (WhatsApp setup, KB upload, workflows)
- Sandbox/trial mode

**Success Criteria:**
- 100+ tenants on single deployment without cross-contamination
- Tenant data fully isolated (verified via audit)
- Per-tenant rate limiting working
- Billing metrics accurate to <1% error
- Onboarding completes in <10 min

**Estimated Effort:** ~7-10 days

---

## Phase 10: Advanced Analytics Features

**Goal:** Completar analytics com features "Nice-to-Have" deferidas em Phase 6

**Deliverables:**

### 10.1. Intent Classification (DASH-03)
- LLM-powered intent extraction from messages
- Intent taxonomy configurable per tenant
- Top intents dashboard (volume + trends)
- Intent-based routing rules

### 10.2. Intake Funnel Analytics (DASH-04)
- Funnel stages: initiated → qualified → exported → converted
- Drop-off rates per stage
- Conversion optimization recommendations
- A/B test support for intake flow variants

### 10.3. Satisfaction Tracking
- Post-conversation NPS/CSAT surveys via WhatsApp
- Sentiment analysis on messages
- Satisfaction correlation with resolution rate
- Agent performance benchmarking

### 10.4. Predictive Analytics
- Conversation outcome prediction (will escalate?)
- Peak volume forecasting
- Anomaly detection (unusual patterns)
- Churn risk scoring (for tenants in Phase 9)

**Success Criteria:**
- Intent classification accuracy >80%
- Funnel conversion rates tracked accurately
- CSAT survey response rate >30%
- Predictive models accuracy >70%

**Estimated Effort:** ~7-10 days (incremental across features)

---

## Decision Matrix

| Phase | Business Value | Technical Complexity | Dependencies | Risk Level |
|-------|---------------|---------------------|--------------|------------|
| 7 (Dashboard UI) | High (visibility) | Low (Grafana) / Medium (React) | Phase 6 ✅ | Low |
| 8 (Scaling) | Critical (production) | High | None (can start now) | Medium |
| 9 (Multi-Tenant) | Very High (revenue) | High | Phase 8 recommended | High |
| 10 (Advanced Analytics) | Medium (nice-to-have) | Medium | Phase 6 ✅, Phase 7 helpful | Low |

**Recommended Order:**
1. Phase 7 (Grafana MVP) — 2h quick win for visibility
2. Phase 8 (Scaling) — production hardening before multi-tenant
3. Phase 9 (Multi-Tenant) — SaaS transformation
4. Phase 10 (Advanced Analytics) — feature expansion

**Alternative Order (Revenue-First):**
1. Phase 7 (Grafana MVP) — visibility
2. Phase 9 (Multi-Tenant) — SaaS readiness
3. Phase 8 (Scaling) — scale as tenants grow
4. Phase 10 (Advanced Analytics) — differentiation

---

## Autonomous Execution Plan

**Mode:** Continuous factory execution (no checkpoints unless blocker)

**Process:**
1. Await gap analysis completion
2. Incorporate gap findings into phase plans
3. Create detailed PLAN.md files for each phase
4. Execute phases sequentially via `/gsd-plan-phase N` → `/gsd-execute-phase N`
5. Update ROADMAP.md and PROGRESS.md after each phase
6. Only interrupt for:
   - Architectural decisions with multiple valid approaches
   - Blocking external dependencies (API keys, infrastructure)
   - User preference on UI approach (Grafana vs React)

**Checkpoint Policy:**
- **No checkpoints** for implementation (TDD + auto-fix)
- **No checkpoints** for package installs (auto-verify npm legitimacy)
- **Checkpoint only** for one-way-door decisions (DB migration strategy, multi-tenant isolation approach)

---

## Next Steps

Awaiting:
1. Gap analysis completion (`.planning/GAP-ANALYSIS.md`)
2. User review of phase priorities (or auto-proceed with recommended order)
3. Begin Phase 7 planning

**ETA:** Gap analysis running now (~10-15 min expected)
