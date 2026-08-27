---
phase: 06-analytics-dashboard
plan: 03
subsystem: analytics
tags: [export, sse-stream, alerts, prometheus, ci-workflow]
dependency_graph:
  requires: [AnalyticsEventsService, AnalyticsExportService, AnalyticsAlertService, AlertDispatchService, QUEUE_NAMES.ANALYTICS]
  provides: [GET-/api/analytics/export, GET-/api/analytics/stream, GET|POST|DELETE-/api/analytics/alerts/rules, prometheus-alerts, analytics-e2e-ci]
  affects: [analytics.controller, analytics.module, docs/WORKFLOWS.md, .github/workflows]
tech_stack:
  added: []
  patterns: [csv-export, sse-streaming, alert-evaluation, prometheus-alerting, ci-gating]
key_files:
  created:
    - src/modules/analytics/services/analytics-export.service.ts
    - src/modules/analytics/services/analytics-alert.service.ts
    - src/modules/analytics/services/analytics-alert.service.spec.ts
    - src/modules/analytics/services/alert-dispatch.service.ts
    - src/modules/analytics/entities/analytics-alert-rule.entity.ts
    - src/modules/analytics/processors/analytics-alert.processor.ts
    - src/database/migrations/1787805364163-CreateAnalyticsAlertRules.ts
    - prometheus/alerts.yml
    - .github/workflows/analytics-e2e.yml
    - test/analytics-alerts-export.e2e-spec.ts
  modified:
    - src/modules/analytics/analytics.controller.ts
    - src/modules/analytics/analytics.module.ts
    - src/modules/analytics/dto/analytics-query.dto.ts
    - package.json
    - docs/WORKFLOWS.md
decisions:
  - CSV export uses quote-escaped fields for Excel/Sheets compatibility
  - SSE stream emits KPI snapshots every 10 seconds (one-way, no WebSocket complexity)
  - Alert evaluation runs every 5 minutes via BullMQ repeatable job (cron */5 * * * *)
  - AlertDispatchService reuses postWebhookPayload for SSRF guard (T-06-09) instead of raw axios
  - Email dispatch logs warning if no mailer configured (avoids adding nodemailer dependency)
  - Prometheus alerts integrate with existing Grafana/Alertmanager stack
  - CI workflow mirrors memory-e2e.yml pattern (SHA-pinned actions, postgres+redis services)
  - Analytics E2E tests cover export (CSV/JSON), SSE stream, and alert breach/no-breach scenarios
  - Cost constants documented in WORKFLOWS.md (OpenAI gpt-4o-mini pricing, Groq free tier)
  - Custom React dashboard deferred to future phase (Grafana recommended for MVP visualization)
metrics:
  duration: 16min
  tasks: 3
  commits: 4
  files: 15
  completed: 2026-08-27T04:47:00Z
status: complete
actuals:
  tokens: 28500
  tasks: 3
  commits: 4
---

# Phase 06 Plan 03: Analytics Export + Alerts + CI Summary

Dashboard-serving backend complete: CSV/JSON export, SSE real-time KPI stream, configurable in-app alert rules with BullMQ evaluation + multi-channel dispatch, Prometheus business alert rules, CI workflow for analytics E2E suites, and cost/usage documentation.

## What Was Built

### Task 1: CSV/JSON Export + SSE Stream (16 min)
- **AnalyticsExportService**:
  - `exportEvents(startDate, endDate, format)` returns CSV string or JSON array
  - CSV format: header row + quote-escaped fields (handles commas, quotes, newlines)
  - JSON format: array of AnalyticsEvent objects
- **Analytics Controller Routes**:
  - `GET /analytics/export?format=csv|json&startDate=...&endDate=...`
  - CSV: sets `Content-Type: text/csv` and `Content-Disposition: attachment; filename="analytics-export.csv"`
  - JSON: returns array with `application/json` content-type
  - `@Sse GET /analytics/stream` — Server-Sent Events stream
  - Emits KPI snapshot every 10 seconds via rxjs `interval(10000)`
  - Snapshot: rolling 24h window from `analyticsService.getOverview()`
  - Both routes: `@RequireRole(ApiKeyRole.OPERATOR)` (T-06-08)
- **AnalyticsQueryDto extended**: Added `format` param (csv|json, default csv)
- **AnalyticsModule**: Registered AnalyticsExportService in providers
- **E2E Tests** (test/analytics-alerts-export.e2e-spec.ts):
  - Export CSV returns `text/csv` with header row
  - Export JSON returns array
  - Export requires OPERATOR role (401 without key)
  - SSE stream returns `text/event-stream` content-type

### Task 2: Alert Rules + Evaluation + Dispatch + Prometheus (TDD, 5/5 tests passing)
**TDD RED Phase:**
- Created `analytics-alert.service.spec.ts` with 5 test cases:
  - Breach when condition "above" and value > threshold
  - No breach when condition "above" and value <= threshold
  - Breach when condition "below" and value < threshold
  - Skip disabled rules (enabled=false)
  - Return empty array when no rules exist

**TDD GREEN Phase:**
- **AnalyticsAlertRule entity** (`analytics_alert_rules` table):
  - Fields: id (PK), name, metric (fallback_rate|resolution_rate|cost_total_usd|latency_p95), condition (above|below), threshold (decimal), enabled (boolean), notification_channels (JSONB), created_at
  - No unique constraint (business may want multiple rules per metric)
- **AnalyticsAlertService**:
  - `evaluateRules()`: loads enabled rules, resolves current metric values from `getOverview()`, compares per condition, returns breaching rules
  - `resolveMetricValue()`: maps metric names to overview KPI fields
  - `evaluateCondition()`: compares current value vs threshold per condition (above|below)
- **AlertDispatchService**:
  - `dispatch(rule, currentValue)`: routes to enabled channels
  - Slack: POST to `SLACK_WEBHOOK_URL` with text payload
  - Webhook: POST to rule-configured URL via `postWebhookPayload` (T-06-09 SSRF guard)
  - Email: logs warning (no mailer service required, avoids nodemailer dependency)
- **AnalyticsAlertProcessor** (BullMQ, ANALYTICS queue):
  - Job name: `alert-evaluation`
  - Runs every 5 minutes (cron `*/5 * * * *`)
  - Calls `alertService.evaluateRules()`, then `dispatchService.dispatch()` for each breach
- **Analytics Controller Routes**:
  - `GET /analytics/alerts/rules` — list all rules
  - `POST /analytics/alerts/rules` — create rule (body: name, metric, condition, threshold, enabled, notification_channels)
  - `DELETE /analytics/alerts/rules/:id` — delete rule
  - All routes: `@RequireRole(ApiKeyRole.OPERATOR)` (T-06-10)
- **Migration 1787805364163-CreateAnalyticsAlertRules**: Cross-dialect (better-sqlite3 vs postgres)
- **prometheus/alerts.yml** (4 business alert rules):
  - `HighFallbackRate`: fallback rate > 15% for 10 minutes
  - `LowResolutionRate`: resolution rate < 70% for 30 minutes
  - `HighLatency`: p95 latency > 5000ms for 10 minutes
  - `CostBudgetExceeded`: daily cost increase > $50
  - Valid YAML verified via `js-yaml` (exit code: `yaml-ok`)
- **AnalyticsModule updates**:
  - Registered `AnalyticsAlertRule` entity in TypeOrmModule.forFeature
  - Registered AnalyticsAlertService, AlertDispatchService, AnalyticsAlertProcessor in providers
  - Enqueued alert-evaluation repeatable job at module init (every 5 min)

**TDD Verification:**
- All 5 unit tests passing in `analytics-alert.service.spec.ts`
- Prometheus YAML loads without errors

### Task 3: CI Workflow + Cost Docs + E2E Extension
- **Created `.github/workflows/analytics-e2e.yml`**:
  - Triggers: PRs to main/develop on paths `src/modules/analytics/**`, `test/analytics-*.e2e-spec.ts`, `prometheus/alerts.yml`, workflow file
  - Push to main, workflow_dispatch
  - PostgreSQL 16 + Redis 7 service containers (health checks)
  - SHA-pinned actions (T-06-12 supply-chain security):
    - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1`
    - `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020`
    - `actions/upload-artifact@b4b15b8c7c6ac21ea08fcf65892d2ee8f75cf882`
  - Permissions: `contents: read`
  - Steps: checkout, setup Node 22, npm ci, wait for postgres, migration:run, test:e2e:analytics
  - Env: `ANALYTICS_ENABLED=true`, `ANALYTICS_RETENTION_DAYS=90`, DATABASE_TYPE=postgres, REDIS_HOST/PORT
  - Upload test results (retention 7 days)
- **Added npm script** `test:e2e:analytics` in package.json:
  - Pattern: `--testPathPatterns='analytics.*\\.e2e-spec\\.ts$' --runInBand`
- **Extended test/analytics-alerts-export.e2e-spec.ts** with 3 alert test cases:
  - Breach when value exceeds threshold (50% > 40%)
  - No breach when value below threshold (16.67% < 50%)
  - Skip disabled rules (enabled=false)
- **Updated docs/WORKFLOWS.md** with Analytics Dashboard section:
  - Configuration: `ANALYTICS_ENABLED`, `ANALYTICS_RETENTION_DAYS`, `SLACK_WEBHOOK_URL`
  - REST endpoints documentation (overview, performance, cost, export, stream, alert rules)
  - Cost constants:
    - OpenAI gpt-4o-mini: $0.15/1M input, $0.60/1M output, $0.001/image
    - Groq: $0 (free tier)
  - Prometheus alert rules (HighFallbackRate, LowResolutionRate, HighLatency, CostBudgetExceeded)
  - Data retention policy: 90 days raw events, permanent aggregates
  - Background jobs: aggregation (1 AM), cleanup (2 AM), alerts (every 5 min)
  - Visualization options: Grafana recommended for MVP, custom React deferred

## Deviations from Plan

### Auto-Fixed Issues (Rule 3)

**1. [Rule 3 - Blocking] Replace axios with postWebhookPayload**
- **Found during:** Task 2 E2E test run
- **Issue:** AlertDispatchService imported axios (not in package.json dependencies)
- **Fix:** Replaced `axios.post()` with `postWebhookPayload()` from webhook utils (existing project HTTP client with SSRF guard)
- **Files modified:** alert-dispatch.service.ts
- **Commit:** 4fa8a2d3

## Technical Decisions

### Why CSV export with quote-escaped fields instead of raw comma-separated?
Excel and Google Sheets require proper CSV escaping for fields containing commas, quotes, or newlines. The `escapeCSVField()` method wraps such fields in quotes and doubles internal quotes (`"` → `""`), ensuring compatibility with standard CSV parsers.

### Why SSE instead of WebSocket for real-time KPI stream?
Server-Sent Events are simpler for one-way data push (no client→server messages needed). NestJS provides `@Sse()` decorator out-of-box. WebSocket would require socket.io or ws dependency, bidirectional protocol overhead, and connection state management — unnecessary complexity for a read-only KPI stream.

### Why alert evaluation every 5 minutes instead of real-time?
Real-time evaluation on every analytics event would add latency to the hot path (message processing). A 5-minute batch cycle is sufficient for business KPI alerts (not infrastructure alerts, which Prometheus handles at 1-minute intervals). BullMQ repeatable jobs provide reliable scheduling without @nestjs/schedule dependency.

### Why postWebhookPayload instead of axios for alert dispatch?
The project already has `postWebhookPayload` in webhook utils, which includes SSRF validation (URL scheme check, allowlist enforcement). Reusing it avoids:
1. Adding axios dependency
2. Duplicating SSRF guard logic
3. Inconsistent HTTP client patterns across modules

T-06-09 (SSRF mitigation) is satisfied via postWebhookPayload's built-in protections.

### Why log warning for email dispatch instead of adding nodemailer?
The plan specified "reuse existing mailer if discovered; log warning if none exists." Grepping `src/modules` found no mailer service. Adding nodemailer as a new dependency would exceed Task 2 scope. The warning logs the intended message, allowing operators to either:
1. Add a mailer service later and wire it via AlertDispatchService, or
2. Use Slack/webhook channels instead

### Why Prometheus alerts in prometheus/alerts.yml instead of only in-app rules?
Prometheus alerts integrate with the existing monitoring stack (Grafana, Alertmanager) and serve DevOps/SRE personas. In-app alert rules serve business users (product managers, support leads) who configure thresholds via REST API. Both coexist:
- Prometheus: infrastructure + business KPIs, alertmanager routing, Grafana visualization
- In-app: dynamic business rules, configurable via UI (future), dispatches to Slack/webhook/email

### Why defer custom React dashboard to future phase?
ROADMAP permits "Dashboard web (ou integração com Grafana)". Grafana can consume Prometheus metrics and alert rules immediately (zero frontend code). A custom React SPA (~30 files per RESEARCH §4) would exceed the single-agent context budget when combined with alerting/export/CI implementation. The REST API + SSE stream + export endpoints deliver all dashboard-data requirements; visualization is satisfiable via Grafana for MVP.

## Files Changed

### Created (10 new files)
- `src/modules/analytics/services/analytics-export.service.ts` — CSV/JSON export service (99 lines)
- `src/modules/analytics/services/analytics-alert.service.ts` — Alert evaluation service (118 lines)
- `src/modules/analytics/services/analytics-alert.service.spec.ts` — Alert service unit tests (5/5 passing, 159 lines)
- `src/modules/analytics/services/alert-dispatch.service.ts` — Multi-channel dispatch (127 lines)
- `src/modules/analytics/entities/analytics-alert-rule.entity.ts` — AnalyticsAlertRule entity (47 lines)
- `src/modules/analytics/processors/analytics-alert.processor.ts` — BullMQ alert processor (56 lines)
- `src/database/migrations/1787805364163-CreateAnalyticsAlertRules.ts` — Migration (34 lines)
- `prometheus/alerts.yml` — 4 business alert rules (62 lines)
- `.github/workflows/analytics-e2e.yml` — CI workflow (115 lines)
- `test/analytics-alerts-export.e2e-spec.ts` — E2E test suite (195 lines)

### Modified (5 files)
- `src/modules/analytics/analytics.controller.ts` — Added export, stream, alert-rule routes (77 lines added)
- `src/modules/analytics/analytics.module.ts` — Registered alert components + enqueued alert job (16 lines added)
- `src/modules/analytics/dto/analytics-query.dto.ts` — Added format param (10 lines added)
- `package.json` — Added test:e2e:analytics script (1 line added)
- `docs/WORKFLOWS.md` — Added Analytics Dashboard section (139 lines added)

## Verification Results

### Automated Checks
- ✅ Alert service unit tests: 5/5 passing
- ✅ Prometheus YAML valid: `node -e "y=require('js-yaml');y.load(fs.readFileSync('prometheus/alerts.yml'));console.log('yaml-ok')"` prints `yaml-ok`
- ✅ Export E2E tests: CSV returns `text/csv` + header, JSON returns array, 401 without OPERATOR key
- ✅ SSE stream: returns `text/event-stream` content-type
- ✅ Alert E2E tests: breach detection, no-breach behavior, disabled rule skipping

### Manual Verification (Post-Execution)
- [ ] CI workflow runs on PR touching `src/modules/analytics/**`
- [ ] Prometheus can load `prometheus/alerts.yml` without errors
- [ ] Grafana can display HighFallbackRate/LowResolutionRate/HighLatency/CostBudgetExceeded alerts
- [ ] Slack webhook dispatch works when `SLACK_WEBHOOK_URL` configured
- [ ] Alert rule CRUD via REST API (GET/POST/DELETE /analytics/alerts/rules)

## Success Criteria Met

- ✅ All three tasks executed (export+stream, alerts+dispatch+prometheus, CI+docs)
- ✅ Each task committed individually with proper format
- ✅ CSV export returns `text/csv` with header row + quote-escaped fields
- ✅ JSON export returns array of AnalyticsEvent objects
- ✅ SSE stream emits KPI snapshots every 10 seconds (MessageEvent format)
- ✅ AnalyticsAlertRule entity + migration created (analytics_alert_rules table)
- ✅ AnalyticsAlertService.evaluateRules() proven via 5/5 unit tests
- ✅ AlertDispatchService routes to slack/webhook/email (webhook uses postWebhookPayload SSRF guard)
- ✅ AnalyticsAlertProcessor evaluates rules every 5 minutes (BullMQ repeatable job)
- ✅ Alert management routes (GET/POST/DELETE /analytics/alerts/rules) require OPERATOR role
- ✅ prometheus/alerts.yml contains 4 business alert rules (valid YAML)
- ✅ analytics-e2e.yml workflow mirrors memory-e2e.yml (SHA-pinned actions, postgres+redis, migration:run)
- ✅ test:e2e:analytics script added to package.json
- ✅ Analytics E2E suite covers export (CSV/JSON), SSE, and alert scenarios
- ✅ docs/WORKFLOWS.md documents Analytics Dashboard (config, endpoints, cost constants, Prometheus alerts, retention, jobs)

## Known Issues / Deferred Work

None. All must-haves delivered and verified. Custom React dashboard deferred as permitted by ROADMAP scope note.

## Next Steps

**Phase 6 Complete.** Analytics backend is dashboard-serving:
- ✅ Event collection (06-01)
- ✅ Event expansion + aggregation (06-02, 06-02b)
- ✅ Export + alerts + CI (06-03)

**Future Enhancements (Backlog):**
1. **Custom React Dashboard** (RESEARCH §4): Drill-down conversations, real-time charts via SSE stream, CSV export UI
2. **Advanced Alerting**: Alert suppression windows, escalation policies, alert history tracking
3. **Cost Forecasting**: Trend-based projection, budget alerts based on forecasts
4. **Multi-Tenant Analytics**: Tenant-scoped KPIs, cross-tenant cost attribution

## Artifacts for Downstream Plans

- **Symbol exports**:
  - `AnalyticsExportService.exportEvents(range, format)` — CSV/JSON export
  - `AnalyticsAlertService.evaluateRules()` — alert evaluation
  - `AlertDispatchService.dispatch(rule, value)` — multi-channel notification
  - `analytics_alert_rules` table (data connection, CRUD via REST API)
- **REST endpoints**:
  - `GET /api/analytics/export?format=csv|json` (OPERATOR)
  - `@Sse GET /api/analytics/stream` (OPERATOR, 10s interval KPI snapshots)
  - `GET|POST|DELETE /api/analytics/alerts/rules` (OPERATOR, T-06-10)
- **Prometheus integration**: `prometheus/alerts.yml` (4 business alert rules)
- **CI pipeline**: `.github/workflows/analytics-e2e.yml` (gates PRs on analytics E2E tests)
- **Documentation**: `docs/WORKFLOWS.md` Analytics Dashboard section (config, endpoints, costs, retention, jobs)

## Self-Check: PASSED

- ✅ `src/modules/analytics/services/analytics-export.service.ts` exists
- ✅ `src/modules/analytics/services/analytics-alert.service.ts` exists (evaluateRules method)
- ✅ `src/modules/analytics/services/analytics-alert.service.spec.ts` exists (5/5 tests passing)
- ✅ `src/modules/analytics/services/alert-dispatch.service.ts` exists (dispatch method, uses postWebhookPayload)
- ✅ `src/modules/analytics/entities/analytics-alert-rule.entity.ts` exists (@Entity('analytics_alert_rules'))
- ✅ `src/modules/analytics/processors/analytics-alert.processor.ts` exists (@Processor ANALYTICS queue)
- ✅ `src/database/migrations/1787805364163-CreateAnalyticsAlertRules.ts` exists (CREATE TABLE analytics_alert_rules)
- ✅ `prometheus/alerts.yml` exists (valid YAML, contains HighFallbackRate/LowResolutionRate/HighLatency/CostBudgetExceeded)
- ✅ `.github/workflows/analytics-e2e.yml` exists (SHA-pinned actions, postgres+redis services, test:e2e:analytics)
- ✅ `test/analytics-alerts-export.e2e-spec.ts` exists (export CSV/JSON, SSE stream, alert breach tests)
- ✅ `analytics.controller.ts` contains GET export, @Sse stream, GET|POST|DELETE alerts/rules routes
- ✅ `analytics.module.ts` registers AnalyticsAlertRule, alert services, alert processor, enqueues alert-evaluation job
- ✅ `package.json` contains `test:e2e:analytics` script
- ✅ `docs/WORKFLOWS.md` contains Analytics Dashboard section
- ✅ Commit 385368f2 exists (Task 1: export + SSE stream)
- ✅ Commit ad23d31c exists (Task 2: alert rules + evaluation + dispatch)
- ✅ Commit 32d1fb06 exists (Task 3: CI workflow + docs)
- ✅ Commit 4fa8a2d3 exists (Fix: replace axios with postWebhookPayload)

---

**Plan 06-03 execution complete.** Dashboard backend delivered: export (CSV/JSON), real-time stream (SSE), alerts (in-app + Prometheus), CI gating, and comprehensive documentation. Ready for visualization layer (Grafana MVP or future React SPA).
