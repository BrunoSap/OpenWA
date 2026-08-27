---
phase: 06-analytics-dashboard
plan: 02b
type: execute
wave: 2
depends_on: ["06-02"]
files_modified:
  - src/modules/analytics/entities/analytics-aggregate.entity.ts
  - src/modules/analytics/services/analytics-aggregation.service.ts
  - src/modules/analytics/processors/analytics-aggregation.processor.ts
  - src/modules/analytics/processors/analytics-cleanup.processor.ts
  - src/modules/analytics/analytics.controller.ts
  - src/modules/analytics/dto/analytics-query.dto.ts
  - src/modules/analytics/dto/analytics-response.dto.ts
  - src/modules/analytics/analytics.module.ts
  - src/modules/queue/queue-names.ts
  - src/modules/analytics/services/analytics-events.service.ts
  - src/database/migrations/{timestamp}-CreateAnalyticsAggregates.ts
  - test/analytics-kpis.e2e-spec.ts
autonomous: true
requirements: [DASH-01, DASH-02]

estimate:
  tokens: 60000
  raw_tokens: 30000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "GET /api/analytics/overview returns resolutionRate, fallbackRate, costPerConversation, dau and mau computed from stored events over a date range"
    - "GET /api/analytics/performance returns latency p50/p95/p99 for the requested window"
    - "The daily aggregation BullMQ job writes one analytics_aggregates row per session per day with correct KPI math; the cleanup job hard-deletes analytics_events older than the retention window"
  artifacts:
    - src/modules/analytics/entities/analytics-aggregate.entity.ts
    - src/modules/analytics/services/analytics-aggregation.service.ts
    - src/modules/analytics/processors/analytics-aggregation.processor.ts
    - src/modules/analytics/processors/analytics-cleanup.processor.ts
    - test/analytics-kpis.e2e-spec.ts
  key_links:
    - "aggregation processor reads raw analytics_events (from 06-01) -> upserts analytics_aggregates keyed on (time_bucket, granularity, session_id)"
    - "aggregation + endpoints import calculateCost/percentile from 06-02 utils and consume the five events emitted in 06-02"
    - "ANALYTICS queue registered in queue-names.ts + BullModule.registerQueue in analytics.module.ts, repeatable jobs enqueued at module init like memory RETENTION queue"
---

<objective>
Build the storage-rollup and query layer on top of the events + utils from 06-02: the `analytics_aggregates` entity + migration, an aggregation service computing KPIs from raw events, two BullMQ processors (daily aggregation + retention cleanup) on a new ANALYTICS queue, and the four analytics query endpoints (`/overview`, `/performance`, `/cost`, `/conversations`) with a KPI E2E suite.

Purpose: Deliver the aggregation + API half of the ROADMAP "backend: coletor de métricas + API de analytics" and the volume/performance/cost/quality metric set. Split out of 06-02 to stay under the file-count budget; depends on 06-02 for the five emitted events and the cost/percentile utils it imports.

Output: `analytics_aggregates` entity + migration; `AnalyticsAggregationService`; two BullMQ processors on a new ANALYTICS queue; four analytics query endpoints + DTOs; KPI E2E test suite.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/06-analytics-dashboard/06-RESEARCH.md
@.planning/phases/06-analytics-dashboard/06-01-SUMMARY.md
@.planning/phases/06-analytics-dashboard/06-02-SUMMARY.md

# Reference patterns:
@src/modules/memory/memory.module.ts
@src/modules/memory/processors/retention-cleanup.processor.ts
@src/modules/memory/services/memory-cleanup.service.ts
@src/modules/queue/queue-names.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: analytics_aggregates entity/migration + AnalyticsAggregationService + aggregation & cleanup BullMQ processors</name>
  <files>src/modules/analytics/entities/analytics-aggregate.entity.ts, src/modules/analytics/services/analytics-aggregation.service.ts, src/modules/analytics/processors/analytics-aggregation.processor.ts, src/modules/analytics/processors/analytics-cleanup.processor.ts, src/modules/analytics/analytics.module.ts, src/modules/queue/queue-names.ts, src/database/migrations/{timestamp}-CreateAnalyticsAggregates.ts</files>
  <read_first>
    - src/modules/memory/memory.module.ts (replicate BullModule.registerQueue + onModuleInit repeatable-job enqueue with cron pattern and idempotent jobId — the aggregation job runs daily 1 AM `0 1 * * *`, cleanup daily 2 AM `0 2 * * *`)
    - src/modules/memory/processors/retention-cleanup.processor.ts (replicate @Processor(QUEUE_NAMES.X) extends WorkerHost, process(job) try/catch/re-throw, createLogger)
    - src/modules/memory/services/memory-cleanup.service.ts (replicate the createQueryBuilder().delete().where('created_at < :cutoff') hard-delete pattern for the cleanup)
    - src/modules/queue/queue-names.ts (add ANALYTICS: 'analytics-queue')
    - src/modules/analytics/entities/analytics-event.entity.ts (from 06-01 — the raw source the aggregation reads)
    - src/modules/analytics/services/percentile.util.ts and analytics-cost.util.ts (from 06-02 — import for latency percentiles and cost sums)
    - .planning/phases/06-analytics-dashboard/06-RESEARCH.md §6.2 (aggregation logic: group by session, count event types, percentile latencies, sum cost, resolution_rate=resolved/started*100, fallback_rate=fallbacks/messages*100)
  </read_first>
  <behavior>
    - computeAggregates(start,end,'day') over seeded events returns one aggregate per session_id with correct counts, latency p50/p95/p99, tokens_total, cost_total_usd, resolution_rate, fallback_rate
    - resolution_rate is null when conversations_started=0 (no divide-by-zero)
    - the cleanup processor deletes only analytics_events with created_at older than the retention cutoff (default 90 days, env ANALYTICS_RETENTION_DAYS)
    - re-running the aggregation job for the same day upserts (no duplicate rows) keyed on (time_bucket, granularity, session_id)
  </behavior>
  <action>Create `AnalyticsAggregate` entity (table `analytics_aggregates`) per RESEARCH.md §2.2: SERIAL/generated PK, `time_bucket` timestamp, `granularity` varchar, nullable `session_id` varchar, integer count columns (conversations_started/resolved/escalated, messages_processed, fallbacks_triggered) with default 0, `latency_p50_ms`/`p95`/`p99` nullable int, `tokens_total` int default 0, `cost_total_usd` decimal(10,4) default 0, `resolution_rate`/`fallback_rate` decimal(5,2) nullable, created_at/updated_at; add a UNIQUE index on (time_bucket, granularity, session_id) and a (time_bucket, granularity) index. Add ANALYTICS to queue-names.ts. Create `AnalyticsAggregationService` with `computeAggregates(start,end,granularity)` (reads raw events via @InjectRepository(AnalyticsEvent,'data'), groups by session_id, uses percentile.util for latencies, calculateCost sums, guards divide-by-zero returning null rates) and `upsertAggregates(rows)` (repository.upsert on the unique key). Create `AnalyticsAggregationProcessor` (@Processor(QUEUE_NAMES.ANALYTICS), WorkerHost) handling the daily aggregation for yesterday, and `AnalyticsCleanupProcessor` deleting analytics_events older than `ANALYTICS_RETENTION_DAYS` (default 90). In analytics.module.ts register TypeOrmModule.forFeature([AnalyticsEvent, AnalyticsAggregate],'data'), BullModule.registerQueue({name: ANALYTICS}), add both processors + AnalyticsAggregationService to providers, and enqueue two repeatable jobs in onModuleInit (aggregation `0 1 * * *`, cleanup `0 2 * * *`) with idempotent jobIds. Generate the aggregates migration against data-source.ts. Verify the analytics entity glob already registered in 06-01 covers the new entity. Write `analytics-aggregation.service.spec.ts` first (RED) seeding events and asserting the compute behaviors.</action>
  <verify>
    <automated>npx jest src/modules/analytics/services/analytics-aggregation.service.spec.ts -x</automated>
  </verify>
  <reversibility rating="costly">Second analytics table + repeatable jobs; additive but rollback after data lands needs a down migration. Rationale: aggregate shape is the read-path contract for the dashboard endpoints.</reversibility>
  <acceptance_criteria>
    - analytics-aggregate.entity.ts contains `@Entity('analytics_aggregates')` and a UNIQUE index over (time_bucket, granularity, session_id)
    - queue-names.ts contains `ANALYTICS:`
    - analytics-aggregation.service.ts contains `computeAggregates(` and returns null resolution_rate when conversations_started is 0 (asserted in spec)
    - both processors extend WorkerHost and are `@Processor(QUEUE_NAMES.ANALYTICS)`
    - analytics.module.ts onModuleInit enqueues repeatable jobs `0 1 * * *` and `0 2 * * *` with idempotent jobIds
    - a `*CreateAnalyticsAggregates.ts` migration exists whose up() runs CREATE TABLE analytics_aggregates
    - aggregation service spec exits 0
  </acceptance_criteria>
  <done>Daily rollups and retention cleanup run as repeatable BullMQ jobs and the aggregation KPI math is unit-proven.</done>
</task>

<task type="auto">
  <name>Task 2: /overview /performance /cost /conversations endpoints + query DTOs</name>
  <files>src/modules/analytics/analytics.controller.ts, src/modules/analytics/services/analytics-events.service.ts, src/modules/analytics/dto/analytics-query.dto.ts, src/modules/analytics/dto/analytics-response.dto.ts</files>
  <read_first>
    - src/modules/analytics/analytics.controller.ts (from 06-01 — add the four new GET routes beside GET events, keep @RequireRole(ApiKeyRole.OPERATOR))
    - src/modules/memory/dto/get-conversation-history.dto.ts (replicate class-validator DTO with @IsOptional/@IsInt/@Type coercion — grep the memory dto dir for the exact file)
    - src/modules/analytics/services/percentile.util.ts (from 06-02 — in-memory percentile fallback for sqlite in getPerformance)
    - .planning/phases/06-analytics-dashboard/06-RESEARCH.md §3.1-3.5 and §4.4 (KPI formulas + endpoint response shapes: overview kpis+charts, performance latency percentiles, cost total+breakdown, conversations paginated)
  </read_first>
  <action>Extend `AnalyticsQueryDto` with `startDate`/`endDate` (@IsDateString), optional `sessionId` (@IsString), optional `granularity` (@IsEnum hour|day|week), and pagination `page`/`limit` for conversations. Create `AnalyticsResponseDto` types for overview/performance/cost per RESEARCH.md §4.4. Add methods to AnalyticsEventsService (keep it in one service file to fit budget): `getOverview(range)` computing resolutionRate, fallbackRate, costPerConversation, dau (COUNT DISTINCT user_id today), mau (COUNT DISTINCT user_id this month) plus the three time-series charts; `getPerformance(range,granularity)` returning p50/p95/p99 series via SQL PERCENTILE_CONT on postgres with an in-memory percentile.util fallback for sqlite; `getCost(range,groupBy)` returning total + breakdown by provider/session; `getConversations(range,filters,page,limit)` returning paginated distinct conversation_id rows with counts. Add controller routes `GET overview`, `GET performance`, `GET cost`, `GET conversations`, all @RequireRole(OPERATOR).</action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json && grep -q "getOverview" src/modules/analytics/services/analytics-events.service.ts && echo OK</automated>
  </verify>
  <acceptance_criteria>
    - analytics.controller.ts contains GET handlers for `overview`, `performance`, `cost`, `conversations`, each annotated @RequireRole(ApiKeyRole.OPERATOR)
    - analytics-query.dto.ts contains `startDate` with `@IsDateString`
    - analytics-events.service.ts contains `getOverview(`, `getPerformance(`, `getCost(`, `getConversations(`
    - the project type-checks with the new endpoints + DTOs
  </acceptance_criteria>
  <done>All four analytics query endpoints are wired with validated DTOs and OPERATOR auth, ready for the KPI E2E to assert their numbers.</done>
</task>

<task type="auto">
  <name>Task 3: KPI E2E suite asserting exact KPI numbers</name>
  <files>test/analytics-kpis.e2e-spec.ts</files>
  <read_first>
    - test/analytics-tracer.e2e-spec.ts (from 06-01 — reuse its bootstrap + api-key helper)
    - src/modules/analytics/analytics.controller.ts (Task 2 — the four routes under test)
    - .planning/phases/06-analytics-dashboard/06-RESEARCH.md §3.1-3.5 (KPI formulas to assert exact numbers)
  </read_first>
  <action>Write test/analytics-kpis.e2e-spec.ts seeding a known event set and asserting each endpoint's numbers: e.g. 3 conversation.started / 2 conversation.resolved -> resolutionRate 66.67; known latency values -> exact p95; known openai token counts -> exact cost figure. Reuse the tracer bootstrap and OPERATOR api-key helper. Cover overview (kpis object with resolutionRate, fallbackRate, costPerConversation, dau, mau), performance (percentile series), cost (total + breakdown), and conversations (paginated).</action>
  <verify>
    <automated>ANALYTICS_ENABLED=true npx jest --config ./test/jest-e2e.json --testPathPatterns='analytics-kpis\.e2e-spec\.ts$' --runInBand</automated>
  </verify>
  <acceptance_criteria>
    - test/analytics-kpis.e2e-spec.ts exits 0 asserting: resolutionRate math from seeded started/resolved counts, an exact latency percentile value, and an exact openai cost figure
    - GET /api/analytics/overview returns a JSON body with a `kpis` object containing resolutionRate, fallbackRate, costPerConversation, dau, mau
    - a request without a valid OPERATOR key returns 401 for at least one analytics query route
  </acceptance_criteria>
  <done>All four analytics query endpoints return correct KPI numbers over a date range, proven by the KPI E2E suite.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| api-key client -> analytics query endpoints | caller reads aggregated business data (cost, volume, per-conversation drill-down) |
| BullMQ worker -> analytics_events (delete) | cleanup job removes data by time predicate |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-06-06 | Information Disclosure | /overview /cost /conversations | high | mitigate | @RequireRole(ApiKeyRole.OPERATOR) on every analytics route (asserted in KPI E2E via 401-without-key case) |
| T-06-07 | Denial of Service | date-range queries over raw events | medium | mitigate | daily pre-computed aggregates for historical windows; conversations endpoint paginated (page/limit) |
| T-06-08 | Tampering | cleanup job over-deletes | medium | mitigate | delete predicate strictly `created_at < cutoff` with ANALYTICS_RETENTION_DAYS default 90; unit-tested boundary |
</threat_model>

<verification>
- analytics_aggregates migrates on both dialects; aggregation upsert is idempotent
- Repeatable jobs registered at module init (aggregation 1 AM, cleanup 2 AM)
- KPI E2E asserts exact numbers for resolution rate, latency percentile, and cost
</verification>

<success_criteria>
- Volume, performance (p50/p95/p99), cost (by provider/feature), and quality (resolution/fallback rate) metrics are all queryable via REST
- Retention cleanup and daily aggregation run as BullMQ repeatable jobs
- All three tasks' automated verifications pass
</success_criteria>

<artifacts_this_phase_produces>
New symbols introduced by Plan 06-02b:
- class `AnalyticsAggregate` (entity, table `analytics_aggregates`)
- class `AnalyticsAggregationService` methods `computeAggregates`, `upsertAggregates`
- class `AnalyticsAggregationProcessor`, class `AnalyticsCleanupProcessor`
- queue name `ANALYTICS` ('analytics-queue')
- AnalyticsEventsService methods `getOverview`, `getPerformance`, `getCost`, `getConversations`
- routes `GET /api/analytics/overview|performance|cost|conversations`
- DTO fields: startDate, endDate, sessionId, granularity, page, limit; AnalyticsResponseDto types
- env `ANALYTICS_RETENTION_DAYS` (default 90)
- migration `{timestamp}-CreateAnalyticsAggregates`
- new file: test/analytics-kpis.e2e-spec.ts
</artifacts_this_phase_produces>

<output>
Create `.planning/phases/06-analytics-dashboard/06-02b-SUMMARY.md` when done
</output>
