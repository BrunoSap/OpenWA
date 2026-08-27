# Phase 6 Research: Analytics Dashboard

**Goal:** Dashboard de métricas de uso, performance de agentes e taxa de resolução para OpenWA

**Research Date:** 2026-08-27  
**Researcher:** Direct inline research (autonomous mode)

---

## Executive Summary

OpenWA já possui **infraestrutura Prometheus completa** (`src/modules/metrics/`) com métricas básicas (uptime, memory, sessions, messages, webhooks). A Fase 6 adiciona:

1. **Event-driven metrics collection** para KPIs de negócio (taxa de resolução, custo por conversa, fallback rate)
2. **Time-series storage** usando PostgreSQL com agregações (não TimescaleDB — simplificar stack)
3. **Analytics API** REST para dashboard frontend
4. **Dashboard web** customizado (React) com drill-down e exportação
5. **Alerting** via Prometheus Alertmanager (já disponível na stack)

**Recommendation:** Extend existing Prometheus infrastructure + add PostgreSQL analytics tables + build lightweight React dashboard.

---

## 1. Metrics Collection Strategy

### 1.1 Current State (Existing Infrastructure)

**File:** `src/modules/metrics/metrics.service.ts` (175 lines)

**Existing Metrics (Prometheus format):**
- `openwa_up` — process health
- `openwa_process_uptime_seconds` — uptime
- `openwa_process_resident_memory_bytes` — memory usage
- `openwa_process_heap_used_bytes` — heap usage
- `openwa_sessions_total` — total sessions
- `openwa_sessions_active` — active sessions
- `openwa_sessions{status="..."}` — sessions by status
- `openwa_messages_total{direction="..."}` — messages by direction
- `openwa_messages_failed_total` — failed messages
- `openwa_webhook_delivery_failures_total` — webhook failures
- `openwa_session_reconnect_attempts_total` — reconnect attempts
- `openwa_sessions_restricted` — restricted sessions
- `openwa_send_pacing_refusals_total{reason="..."}` — rate limit refusals

**Pattern:** Prometheus text exposition format (v0.0.4), no `prom-client` dependency (hand-rolled for minimal overhead).

**Caching:** 5-second TTL on metrics render to avoid DB query spam from Prometheus scrapes.

**Security:** `METRICS_TOKEN` bearer auth with constant-time compare (timing-safe).

### 1.2 Gap: Business KPIs Missing

Current metrics are **infrastructure-focused** (sessions, messages, webhooks). Missing **business KPIs:**

1. **Taxa de Resolução** — % de conversas resolvidas sem fallback humano
2. **Fallback Rate** — % de mensagens que caíram em fallback (STT timeout, Vision erro, RAG sem match)
3. **Custo por Conversa** — tokens consumidos × pricing (Groq free, OpenAI paid)
4. **Latência End-to-End** — tempo desde mensagem WhatsApp até resposta enviada
5. **Satisfaction Score** — feedback explícito ou implícito (thumbs up/down, abandono)
6. **Usuários Ativos** — DAU/MAU/sessões únicas por período
7. **Top Intents** — categorização de perguntas (FAQ, suporte, vendas)

### 1.3 Proposed Collection Pattern: Event-Driven

**Approach:** Emit domain events from business logic → listener records analytics.

**Implementation:**
1. **EventEmitter2** (NestJS built-in via `@nestjs/event-emitter`) para domain events
2. **Analytics Listener Service** consome eventos e grava em tabelas `analytics_events` e `analytics_aggregates`
3. **Prometheus metrics** remain for infrastructure monitoring (Grafana)
4. **PostgreSQL analytics tables** for business KPIs (custom dashboard)

**Example Events:**
- `conversation.started` — novo chat iniciado
- `conversation.resolved` — conversa finalizada sem fallback
- `conversation.escalated` — fallback para humano
- `message.processed` — mensagem processada (body: latência, custo, tipo)
- `llm.called` — chamada LLM (body: provider, model, tokens, custo)
- `fallback.triggered` — fallback acionado (body: reason, stage)

**Why Event-Driven vs Polling?**
- ✅ Real-time: métricas atualizadas instantaneamente
- ✅ Accurate: captura exata do momento do evento
- ✅ Low overhead: no polling queries on hot tables
- ✅ Decoupled: business logic não sabe de analytics
- ❌ Complexity: mais código (event emitters + listeners)

**Verdict:** Event-driven é o padrão moderno para analytics em sistemas de alta carga. OpenWA já usa eventos para webhooks — estender o padrão.

---

## 2. Storage Strategy

### 2.1 Options Evaluated

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **TimescaleDB** | Purpose-built for time-series, continuous aggregates, compression | Adiciona dependência, mais complexo deploy, learning curve | ❌ **Rejected** — overkill para escala atual |
| **InfluxDB** | Time-series native, retention policies, Flux query language | Outra dependência, menos queries relacionais (joins difíceis) | ❌ **Rejected** — PostgreSQL já existe |
| **PostgreSQL + Partitioning** | Stack existente, queries SQL normais, agregações materialized views | Partitioning manual, menos otimizado para time-series | ✅ **Recommended** — simplicidade vence |
| **Prometheus only** | Já existe, Grafana integration out-of-box | Métricas agregadas (não drill-down por conversa individual), retention curto (default 15d) | ⚠️ **Complement** — infraestrutura sim, negócio não |

**Decision:** PostgreSQL com tabelas dedicadas de analytics + Prometheus para infraestrutura.

### 2.2 Proposed Schema

**Table 1: `analytics_events` (raw events)**

```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,  -- 'conversation.started', 'llm.called', etc
  session_id VARCHAR(255),
  chat_id VARCHAR(255),
  user_id VARCHAR(255),  -- from messages.userId (Phase 5)
  conversation_id VARCHAR(100),  -- chatId:YYYY-MM-DD (Phase 5)
  
  -- Event payload (JSON)
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- Metrics extracted for fast querying
  latency_ms INTEGER,  -- end-to-end latency
  tokens_used INTEGER,  -- LLM tokens consumed
  cost_usd DECIMAL(10, 6),  -- calculated cost
  
  -- Timestamp
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_analytics_events_type_time (event_type, created_at),
  INDEX idx_analytics_events_session_time (session_id, created_at),
  INDEX idx_analytics_events_user_time (user_id, created_at),
  INDEX idx_analytics_events_created (created_at)  -- for time-range scans
);
```

**Table 2: `analytics_aggregates` (pre-computed rollups)**

```sql
CREATE TABLE analytics_aggregates (
  id SERIAL PRIMARY KEY,
  
  -- Aggregation dimensions
  time_bucket TIMESTAMP NOT NULL,  -- hour/day/week bucket
  granularity VARCHAR(20) NOT NULL,  -- 'hour', 'day', 'week'
  session_id VARCHAR(255),  -- null = all sessions
  
  -- Aggregated metrics
  conversations_started INTEGER DEFAULT 0,
  conversations_resolved INTEGER DEFAULT 0,
  conversations_escalated INTEGER DEFAULT 0,
  messages_processed INTEGER DEFAULT 0,
  fallbacks_triggered INTEGER DEFAULT 0,
  
  -- Performance metrics
  latency_p50_ms INTEGER,
  latency_p95_ms INTEGER,
  latency_p99_ms INTEGER,
  
  -- Cost metrics
  tokens_total INTEGER DEFAULT 0,
  cost_total_usd DECIMAL(10, 4) DEFAULT 0,
  
  -- Quality metrics
  resolution_rate DECIMAL(5, 2),  -- % resolved (0-100)
  fallback_rate DECIMAL(5, 2),  -- % fallback (0-100)
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Unique constraint per bucket + dimensions
  UNIQUE (time_bucket, granularity, session_id),
  
  -- Indexes
  INDEX idx_analytics_aggregates_time (time_bucket, granularity),
  INDEX idx_analytics_aggregates_session (session_id, time_bucket)
);
```

**Retention Policy:**
- Raw events (`analytics_events`): 90 dias (após isso, hard delete via BullMQ job)
- Aggregates (`analytics_aggregates`): permanente (ou 2 anos se compliance exigir)

**Aggregation Strategy:**
- **Hourly aggregates:** computed on-demand via `GROUP BY date_trunc('hour', created_at)`
- **Daily/Weekly aggregates:** pre-computed via BullMQ scheduled job (daily at 1 AM)
- **Materialized views:** opcional (PostgreSQL 9.3+), mas adiciona complexidade de refresh

**Why not Materialized Views?**
- BullMQ job dá mais controle (error handling, retry, monitoring)
- Explicit table = simple INSERT/UPDATE (no REFRESH MATERIALIZED VIEW)
- Easier to debug (query the table, inspect rows)

---

## 3. KPI Calculation Formulas

### 3.1 Taxa de Resolução

**Definition:** % de conversas que terminaram **sem** fallback para humano.

**Formula:**
```
resolution_rate = (conversations_resolved / conversations_started) * 100
```

**Data Source:**
- `conversations_started` — count of `conversation.started` events
- `conversations_resolved` — count of `conversation.resolved` events (sem `conversation.escalated`)

**Implementation:**
```typescript
// Event listener
@OnEvent('conversation.resolved')
async handleConversationResolved(payload: ConversationResolvedEvent) {
  await this.analyticsService.recordEvent({
    event_type: 'conversation.resolved',
    session_id: payload.sessionId,
    chat_id: payload.chatId,
    user_id: payload.userId,
    conversation_id: payload.conversationId,
    payload: { ...payload },
  });
}
```

### 3.2 Fallback Rate

**Definition:** % de mensagens que acionaram fallback (timeout, erro, no-match).

**Formula:**
```
fallback_rate = (fallbacks_triggered / messages_processed) * 100
```

**Data Source:**
- `fallbacks_triggered` — count of `fallback.triggered` events
- `messages_processed` — count of `message.processed` events

**Fallback Reasons (tracked in payload):**
- `stt_timeout` — Groq Whisper timeout (Phase 3)
- `stt_api_error` — Groq API error
- `vision_timeout` — GPT-4 Vision timeout (Phase 4)
- `vision_api_error` — Vision API error
- `rag_no_match` — pgvector search returned no results (Phase 2)
- `llm_error` — LLM API error (Groq/OpenAI)

### 3.3 Custo por Conversa

**Definition:** Custo médio de tokens LLM por conversa.

**Formula:**
```
cost_per_conversation = total_cost_usd / conversations_started
```

**Token Cost Tracking:**
```typescript
// Event: llm.called
{
  event_type: 'llm.called',
  payload: {
    provider: 'groq' | 'openai',
    model: 'llama-3.3-70b-versatile' | 'gpt-4o-mini',
    tokens_input: 1500,
    tokens_output: 300,
    cost_usd: 0.0  // Groq = free, OpenAI = calculado
  }
}
```

**Pricing (hardcoded constants, atualizar se mudar):**
- Groq: $0 (free tier)
- OpenAI GPT-4o-mini: $0.150/1M input, $0.600/1M output
- OpenAI GPT-4 Vision (gpt-4o-mini com image): same + $0.001/image

**Implementation:**
```typescript
function calculateCost(event: LLMCalledEvent): number {
  if (event.provider === 'groq') return 0;
  
  if (event.provider === 'openai') {
    const inputCost = (event.tokens_input / 1_000_000) * 0.15;
    const outputCost = (event.tokens_output / 1_000_000) * 0.60;
    const imageCost = event.images_count ? event.images_count * 0.001 : 0;
    return inputCost + outputCost + imageCost;
  }
  
  return 0;  // unknown provider
}
```

### 3.4 Latência End-to-End

**Definition:** Tempo desde mensagem WhatsApp recebida até resposta enviada.

**Measurement:**
```typescript
// Start: when webhook receives WhatsApp message
const startTime = Date.now();

// End: when message is sent back to WhatsApp
const endTime = Date.now();
const latencyMs = endTime - startTime;

await this.analyticsService.recordEvent({
  event_type: 'message.processed',
  latency_ms: latencyMs,
  payload: { ... },
});
```

**Percentiles:** Calculate p50/p95/p99 during aggregation.

**SQL (PostgreSQL):**
```sql
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99
FROM analytics_events
WHERE event_type = 'message.processed'
  AND created_at >= NOW() - INTERVAL '1 day';
```

### 3.5 Usuários Ativos (DAU/MAU)

**Definition:** Usuários únicos que enviaram pelo menos 1 mensagem no período.

**Formula:**
```sql
-- DAU (Daily Active Users)
SELECT COUNT(DISTINCT user_id)
FROM analytics_events
WHERE event_type = 'message.processed'
  AND created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day';

-- MAU (Monthly Active Users)
SELECT COUNT(DISTINCT user_id)
FROM analytics_events
WHERE event_type = 'message.processed'
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND created_at < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month';
```

**Data Source:** `messages.userId` (Phase 5) → propagated to analytics events.

---

## 4. Dashboard Architecture

### 4.1 Options Evaluated

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Custom React Dashboard** | Full control, drill-down, export, embed anywhere | Build from scratch, maintenance | ✅ **Recommended** — business KPIs need custom views |
| **Grafana Integration** | Already exists, Prometheus native, alerting built-in | Limited drill-down (no per-conversation view), less flexible | ⚠️ **Complement** — infraestrutura sim, negócio não |
| **Metabase / Superset** | Low-code BI, SQL queries, self-service | Another service to deploy/maintain | ❌ **Rejected** — overkill |
| **Admin Panel (React Admin / Refine)** | Pre-built CRUD, tables, charts | Generic, não otimizado para time-series | ❌ **Rejected** — não fit bem |

**Decision:** Build custom React dashboard + keep Grafana for infrastructure monitoring.

**Why Custom Dashboard?**
- Business users need **drill-down** (click metric → see individual conversations)
- Need **export to CSV** for executive reports
- Need **real-time updates** (WebSocket or SSE)
- Need **custom visualizations** (funnel charts, heatmaps)
- Grafana é para DevOps, não para business stakeholders

### 4.2 Technology Stack (Frontend)

**Framework:** React 18 (matches existing `personalJoule` project experience)

**UI Library:** 
- **Ant Design** (comprehensive charts, tables, date pickers) OR
- **Chakra UI + Recharts** (lighter, more modern)

**Recommendation:** **Ant Design** — has built-in ProTable + ProChart components for analytics.

**Charting:**
- Ant Design Charts (based on G2Plot)
- Recharts (fallback if Ant Charts não suficiente)

**State Management:**
- React Query (TanStack Query) — perfect for server state (polling analytics API)
- Zustand — client state (filters, date range)

**Real-Time:**
- Server-Sent Events (SSE) — simpler than WebSocket for one-way updates
- Fallback to polling (30s interval)

### 4.3 Dashboard Views (Pages)

**1. Overview Dashboard**
- KPI Cards: Taxa de Resolução, Fallback Rate, Custo/Conversa, DAU/MAU
- Line Charts: Messages/hour, Latency p95, Cost over time
- Bar Chart: Top sessions by volume

**2. Performance Dashboard**
- Latency heatmap (hourly)
- Percentile chart (p50/p95/p99 over time)
- Slowest conversations table (drill-down)

**3. Cost Dashboard**
- Total cost by provider (Groq vs OpenAI)
- Cost breakdown: tokens input/output, images
- Cost per session (bar chart)
- Cost forecast (trend projection)

**4. Quality Dashboard**
- Resolution rate trend
- Fallback rate breakdown (by reason: STT timeout, Vision error, RAG no-match)
- Satisfaction scores (if implemented)

**5. Conversations Drill-Down**
- Table: recent conversations with filters (date, session, status)
- Click → conversation detail (messages, events, timeline)

**6. Alerts & Settings**
- Configure alert thresholds
- Email/Slack notification settings
- Export history

### 4.4 API Design (Backend)

**Module:** `src/modules/analytics/`

**Structure:**
```
src/modules/analytics/
├── analytics.module.ts
├── analytics.controller.ts       // REST API
├── analytics.service.ts          // business logic
├── analytics-events.service.ts   // record events
├── analytics-aggregation.service.ts  // compute aggregates
├── entities/
│   ├── analytics-event.entity.ts
│   └── analytics-aggregate.entity.ts
├── dto/
│   ├── analytics-query.dto.ts    // query params (date range, filters)
│   └── analytics-response.dto.ts
├── processors/
│   └── analytics-aggregation.processor.ts  // BullMQ daily job
└── listeners/
    └── analytics-event.listener.ts  // EventEmitter2 handlers
```

**REST Endpoints:**

```typescript
// GET /api/analytics/overview
// Query params: startDate, endDate, sessionId (optional)
// Response: { kpis: {...}, charts: {...} }

// GET /api/analytics/performance
// Query params: startDate, endDate, granularity (hour/day)
// Response: { latency: { p50: [], p95: [], p99: [] }, ... }

// GET /api/analytics/cost
// Query params: startDate, endDate, groupBy (provider/session)
// Response: { total: 123.45, breakdown: [...] }

// GET /api/analytics/conversations
// Query params: startDate, endDate, sessionId, status, page, limit
// Response: { data: [...], total: 500, page: 1 }

// GET /api/analytics/conversations/:id
// Params: id (conversation_id)
// Response: { messages: [...], events: [...], timeline: [...] }

// GET /api/analytics/export
// Query params: startDate, endDate, format (csv/json)
// Response: CSV download or JSON

// GET /api/analytics/stream (SSE)
// Real-time KPI updates (emit every 10s)
```

**Query DTO:**
```typescript
export class AnalyticsQueryDto {
  @IsDateString()
  startDate: string;  // ISO 8601

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsEnum(['hour', 'day', 'week'])
  granularity?: 'hour' | 'day' | 'week';
}
```

**Response DTO (Overview):**
```typescript
export class AnalyticsOverviewDto {
  kpis: {
    resolutionRate: number;  // 0-100
    fallbackRate: number;
    costPerConversation: number;
    dau: number;
    mau: number;
  };
  
  charts: {
    messagesOverTime: { timestamp: string; count: number }[];
    latencyP95: { timestamp: string; latency: number }[];
    costOverTime: { timestamp: string; cost: number }[];
  };
}
```

---

## 5. Alerting Implementation

### 5.1 Approach: Prometheus Alertmanager

OpenWA já expõe métricas Prometheus (`/api/metrics`). Grafana dashboard já existe. **Reutilizar Alertmanager** (já na stack Docker Compose).

**Alerting Flow:**
1. Prometheus scrapes `/api/metrics` (existing)
2. Prometheus evaluates alert rules (`prometheus/alerts.yml`)
3. Alertmanager dispatches notifications (email, Slack, webhook)

**New Alert Rules (add to `prometheus/alerts.yml`):**

```yaml
groups:
  - name: openwa_business
    interval: 60s
    rules:
      # Alert: High Fallback Rate
      - alert: HighFallbackRate
        expr: |
          (
            rate(openwa_fallbacks_total[5m]) /
            rate(openwa_messages_processed_total[5m])
          ) > 0.15
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High fallback rate detected"
          description: "Fallback rate is {{ $value | humanizePercentage }} (threshold 15%)"
      
      # Alert: Low Resolution Rate
      - alert: LowResolutionRate
        expr: |
          (
            rate(openwa_conversations_resolved_total[1h]) /
            rate(openwa_conversations_started_total[1h])
          ) < 0.70
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "Low resolution rate detected"
          description: "Resolution rate is {{ $value | humanizePercentage }} (threshold 70%)"
      
      # Alert: High Latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95,
            rate(openwa_message_latency_bucket[5m])
          ) > 5000
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High message latency detected"
          description: "p95 latency is {{ $value }}ms (threshold 5000ms)"
      
      # Alert: Cost Budget Exceeded
      - alert: CostBudgetExceeded
        expr: |
          increase(openwa_cost_total_usd[1d]) > 50
        labels:
          severity: critical
        annotations:
          summary: "Daily cost budget exceeded"
          description: "Daily cost is ${{ $value }} (budget $50)"
```

**Alertmanager Configuration (`alertmanager/config.yml`):**

```yaml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  
  routes:
    - match:
        severity: critical
      receiver: 'slack-critical'
    
    - match:
        severity: warning
      receiver: 'email-ops'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://openwa:3000/api/webhooks/alerts'
  
  - name: 'slack-critical'
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#openwa-alerts'
        title: '🚨 OpenWA Critical Alert'
        text: '{{ .CommonAnnotations.summary }}'
  
  - name: 'email-ops'
    email_configs:
      - to: 'ops@example.com'
        from: 'alertmanager@example.com'
        smarthost: 'smtp.example.com:587'
        auth_username: '${SMTP_USER}'
        auth_password: '${SMTP_PASS}'
```

### 5.2 In-App Alerts (Custom Dashboard)

Beyond Prometheus alerts (for DevOps), **business users** need in-app alerts.

**Implementation:**
1. **Alert Rules Table** (`analytics_alert_rules`):
   ```sql
   CREATE TABLE analytics_alert_rules (
     id SERIAL PRIMARY KEY,
     name VARCHAR(255) NOT NULL,
     metric VARCHAR(100) NOT NULL,  -- 'resolution_rate', 'fallback_rate', etc
     condition VARCHAR(20) NOT NULL,  -- 'above', 'below'
     threshold DECIMAL(10, 2) NOT NULL,
     enabled BOOLEAN DEFAULT TRUE,
     notification_channels JSONB,  -- ['email', 'slack', 'webhook']
     created_at TIMESTAMP DEFAULT NOW()
   );
   ```

2. **Alert Evaluation Job** (BullMQ, every 5 minutes):
   - Query current metric values
   - Compare against alert rules
   - If threshold breached → dispatch notification

3. **Notification Channels:**
   - **Email:** NodeMailer (SMTP)
   - **Slack:** Webhook (same as Prometheus)
   - **Webhook:** HTTP POST to custom URL (for integrations like n8n)

**Example Alert Rule (in-app):**
```json
{
  "name": "Daily Cost Limit",
  "metric": "cost_total_usd",
  "condition": "above",
  "threshold": 50.0,
  "notification_channels": ["email", "slack"]
}
```

**Alert Dispatch Service:**
```typescript
@Injectable()
export class AlertDispatchService {
  async dispatch(alert: Alert, value: number): Promise<void> {
    const channels = alert.notification_channels;
    
    if (channels.includes('email')) {
      await this.sendEmail(alert, value);
    }
    
    if (channels.includes('slack')) {
      await this.sendSlack(alert, value);
    }
    
    if (channels.includes('webhook')) {
      await this.sendWebhook(alert, value);
    }
  }
  
  private async sendSlack(alert: Alert, value: number): Promise<void> {
    const text = `⚠️ Alert: ${alert.name}\nCurrent value: ${value}\nThreshold: ${alert.threshold}`;
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text });
  }
}
```

---

## 6. Aggregation Strategy

### 6.1 Pre-compute vs Query-Time

**Pre-compute (Materialized Aggregates):**
- ✅ Fast queries (no aggregation at read time)
- ✅ Consistent performance regardless of data volume
- ❌ Delayed updates (hourly/daily jobs)
- ❌ Storage overhead (duplicate data)

**Query-Time (On-Demand Aggregation):**
- ✅ Real-time data (no staleness)
- ✅ No storage overhead
- ❌ Slow queries (aggregation on every request)
- ❌ Performance degrades with data volume

**Hybrid Approach (Recommended):**
- **Hourly aggregates:** query-time (`GROUP BY date_trunc('hour', created_at)`)
  - Fast enough for last 24 hours (dashboard default view)
- **Daily/Weekly aggregates:** pre-computed (BullMQ job daily at 1 AM)
  - Needed for historical trends (30d, 90d)
  - Insert into `analytics_aggregates` table

### 6.2 Aggregation Job (BullMQ)

**File:** `src/modules/analytics/processors/analytics-aggregation.processor.ts`

**Schedule:** Daily at 1 AM (cron: `0 1 * * *`)

**Logic:**
```typescript
@Processor('analytics')
export class AnalyticsAggregationProcessor {
  @Process('daily-aggregation')
  async aggregateDaily(job: Job): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(yesterday);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Aggregate yesterday's data
    const aggregates = await this.computeAggregates(yesterday, tomorrow, 'day');
    
    // Upsert into analytics_aggregates
    for (const agg of aggregates) {
      await this.analyticsRepo.upsert(agg, ['time_bucket', 'granularity', 'session_id']);
    }
  }
  
  private async computeAggregates(
    startDate: Date,
    endDate: Date,
    granularity: 'hour' | 'day' | 'week',
  ): Promise<AnalyticsAggregate[]> {
    // Query raw events and compute aggregates
    const events = await this.analyticsEventsRepo
      .createQueryBuilder('e')
      .where('e.created_at >= :start', { start: startDate })
      .andWhere('e.created_at < :end', { end: endDate })
      .getMany();
    
    // Group by session_id
    const bySession = groupBy(events, e => e.session_id);
    
    const aggregates: AnalyticsAggregate[] = [];
    
    for (const [sessionId, sessionEvents] of Object.entries(bySession)) {
      const agg = new AnalyticsAggregate();
      agg.time_bucket = startDate;
      agg.granularity = granularity;
      agg.session_id = sessionId;
      
      agg.conversations_started = sessionEvents.filter(e => e.event_type === 'conversation.started').length;
      agg.conversations_resolved = sessionEvents.filter(e => e.event_type === 'conversation.resolved').length;
      agg.conversations_escalated = sessionEvents.filter(e => e.event_type === 'conversation.escalated').length;
      agg.messages_processed = sessionEvents.filter(e => e.event_type === 'message.processed').length;
      agg.fallbacks_triggered = sessionEvents.filter(e => e.event_type === 'fallback.triggered').length;
      
      // Latency percentiles
      const latencies = sessionEvents
        .filter(e => e.latency_ms !== null)
        .map(e => e.latency_ms)
        .sort((a, b) => a - b);
      
      if (latencies.length > 0) {
        agg.latency_p50_ms = percentile(latencies, 0.5);
        agg.latency_p95_ms = percentile(latencies, 0.95);
        agg.latency_p99_ms = percentile(latencies, 0.99);
      }
      
      // Cost total
      agg.tokens_total = sumBy(sessionEvents, e => e.tokens_used || 0);
      agg.cost_total_usd = sumBy(sessionEvents, e => e.cost_usd || 0);
      
      // Rates
      agg.resolution_rate = agg.conversations_started > 0
        ? (agg.conversations_resolved / agg.conversations_started) * 100
        : null;
      
      agg.fallback_rate = agg.messages_processed > 0
        ? (agg.fallbacks_triggered / agg.messages_processed) * 100
        : null;
      
      aggregates.push(agg);
    }
    
    return aggregates;
  }
}
```

### 6.3 Retention & Cleanup

**Raw Events Retention:** 90 days

**Cleanup Job (BullMQ):**
```typescript
@Processor('analytics')
export class AnalyticsCleanupProcessor {
  @Process('cleanup-old-events')
  async cleanupOldEvents(job: Job): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const result = await this.analyticsEventsRepo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff: cutoffDate })
      .execute();
    
    this.logger.log(`Deleted ${result.affected} old analytics events`);
  }
}
```

**Schedule:** Daily at 2 AM (cron: `0 2 * * *`)

---

## 7. Migration Path (Existing Codebase Integration)

### 7.1 Integration Points

**1. Message Processing (Phase 1-5 já implementado)**

**File:** `src/modules/message/message.service.ts`

**Change:** Emit analytics events após processar mensagem.

```typescript
// BEFORE (existing)
async processIncomingMessage(message: IncomingMessage): Promise<void> {
  // ... existing logic ...
  await this.messageRepo.save(message);
}

// AFTER (with analytics)
async processIncomingMessage(message: IncomingMessage): Promise<void> {
  const startTime = Date.now();
  
  // ... existing logic ...
  await this.messageRepo.save(message);
  
  const latencyMs = Date.now() - startTime;
  
  // Emit analytics event
  this.eventEmitter.emit('message.processed', {
    sessionId: message.sessionId,
    chatId: message.chatId,
    userId: message.userId,  // from Phase 5
    conversationId: message.conversationId,  // from Phase 5
    latencyMs,
    messageType: message.type,
  });
}
```

**2. LLM Integration (Groq/OpenAI)**

**File:** `src/modules/llm/llm.service.ts` (ou similar)

**Change:** Track tokens e custo em cada chamada LLM.

```typescript
async callLLM(prompt: string, model: string): Promise<LLMResponse> {
  const startTime = Date.now();
  
  const response = await this.llmClient.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const latencyMs = Date.now() - startTime;
  const tokensInput = response.usage.prompt_tokens;
  const tokensOutput = response.usage.completion_tokens;
  const costUsd = this.calculateCost(model, tokensInput, tokensOutput);
  
  // Emit analytics event
  this.eventEmitter.emit('llm.called', {
    provider: this.getProvider(model),
    model,
    tokens_input: tokensInput,
    tokens_output: tokensOutput,
    cost_usd: costUsd,
    latency_ms: latencyMs,
  });
  
  return response;
}
```

**3. Fallback Handlers (STT, Vision, RAG)**

**Files:**
- `test/support/stt-transcribe.ts` (Phase 3)
- `test/support/vision-analyze.ts` (Phase 4)
- RAG service (Phase 2)

**Change:** Emit `fallback.triggered` quando fallback acontece.

```typescript
// In transcribeWithFallback (STT)
if (!result.ok) {
  this.eventEmitter.emit('fallback.triggered', {
    stage: 'stt',
    reason: result.fallbackReason,  // 'timeout' | 'api_error'
  });
}

// In analyzeWithFallback (Vision)
if (!result.ok) {
  this.eventEmitter.emit('fallback.triggered', {
    stage: 'vision',
    reason: result.fallbackReason,
  });
}

// In RAG service
if (retrievedDocs.length === 0) {
  this.eventEmitter.emit('fallback.triggered', {
    stage: 'rag',
    reason: 'no_match',
  });
}
```

### 7.2 Backward Compatibility

**Requirement:** Phase 6 não pode quebrar fases anteriores (1-5 já completas).

**Strategy:**
- ✅ Analytics é **opt-in** via feature flag: `ANALYTICS_ENABLED` (default `false`)
- ✅ Event emitters são **no-op** se analytics desabilitado
- ✅ Prometheus metrics continuam funcionando (independente de analytics)
- ✅ Existing tests não precisam mudar (events são side-effects)

**Implementation:**
```typescript
@Injectable()
export class AnalyticsEventListener {
  constructor(
    private readonly config: ConfigService,
    private readonly analyticsService: AnalyticsService,
  ) {}
  
  private get enabled(): boolean {
    return this.config.get<boolean>('ANALYTICS_ENABLED', false);
  }
  
  @OnEvent('message.processed')
  async handleMessageProcessed(payload: any): Promise<void> {
    if (!this.enabled) return;  // no-op if disabled
    await this.analyticsService.recordEvent({ ...payload });
  }
}
```

---

## 8. Technology Choices & Rationale

| Decision | Choice | Alternative Considered | Rationale |
|----------|--------|----------------------|-----------|
| **Storage** | PostgreSQL | TimescaleDB, InfluxDB | Reuse existing stack, simplicity over time-series optimization |
| **Collection** | Event-driven | Polling | Real-time, accurate, low overhead, decoupled |
| **Aggregation** | Hybrid (query-time + pre-compute) | Only query-time, only pre-compute | Balance real-time vs performance |
| **Dashboard** | Custom React | Grafana only, Metabase | Business KPIs need drill-down, export, custom views |
| **Alerting** | Prometheus Alertmanager + In-App | Only in-app | Reuse existing infra for DevOps, add in-app for business users |
| **UI Library** | Ant Design | Chakra UI + Recharts | Comprehensive analytics components (ProTable, ProChart) |
| **State** | React Query + Zustand | Redux | Simpler, server-state focused |
| **Real-Time** | SSE (fallback polling) | WebSocket | Simpler for one-way updates, lower complexity |
| **Jobs** | BullMQ | Cron, node-schedule | Already used in Phase 5, Redis-backed, retry/monitoring |

---

## 9. Effort Estimation

### Wave 1: Tracer (Backend)
**Goal:** Prove event collection → storage → basic query.

**Tasks:**
1. Create analytics module scaffolding
2. Create `analytics_events` entity + migration
3. Create `AnalyticsEventListener` with 1 event (`message.processed`)
4. Emit event from `message.service.ts`
5. Basic API endpoint: `GET /api/analytics/events` (list last 100 events)
6. E2E test: emit event → query API → verify stored

**Estimated Time:** ~3-4 hours  
**Files Changed:** ~8 files (entity, service, controller, listener, migration, test)

### Wave 2: Expansion (Aggregation + KPIs)
**Goal:** Complete event collection, aggregation logic, all KPIs.

**Tasks:**
1. Emit all events (`conversation.started`, `llm.called`, `fallback.triggered`, etc) — 5 events
2. Create `analytics_aggregates` entity + migration
3. Implement aggregation service (compute KPIs from raw events)
4. BullMQ aggregation job (daily at 1 AM)
5. BullMQ cleanup job (delete events >90d)
6. API endpoints: `/overview`, `/performance`, `/cost`, `/conversations`
7. Unit tests for aggregation logic
8. E2E tests for all KPI calculations

**Estimated Time:** ~2-3 days  
**Files Changed:** ~20 files (5 event emitters, entities, services, jobs, DTOs, tests)

### Wave 3: Dashboard + Alerting
**Goal:** React dashboard, charts, alerting.

**Tasks:**
1. Create React app scaffolding (`dashboard/` subdirectory)
2. Setup Ant Design + React Query
3. Implement 4 dashboard pages (Overview, Performance, Cost, Quality)
4. Drill-down conversations table + detail view
5. Export to CSV
6. SSE endpoint for real-time updates
7. Alert rules table + evaluation job
8. Notification channels (email, Slack, webhook)
9. Prometheus alert rules (`prometheus/alerts.yml`)
10. E2E tests for dashboard (Playwright)

**Estimated Time:** ~3-4 days  
**Files Changed:** ~30 files (React components, API endpoints, alert services, tests)

**Total Effort:** ~5-7 days (matching ROADMAP estimate)

---

## 10. Success Criteria

### Must-Haves (Deliverables from ROADMAP)
- ✅ Schema de métricas (`analytics_events`, `analytics_aggregates`)
- ✅ Backend: coletor de métricas + API de analytics
- ✅ Dashboard web com métricas principais
- ✅ Métricas rastreadas: volume, performance, custo, qualidade
- ✅ Alertas configuráveis (Prometheus + in-app)
- ✅ Exportação de relatórios (CSV, API)

### Verification (ROADMAP Success Criteria)
- ✅ Dashboard mostra métricas em tempo real (atualização < 30s)
- ✅ Histórico de 30 dias visível com drill-down
- ✅ Alertas disparam corretamente (email/Slack)
- ✅ Performance: queries de dashboard < 500ms
- ✅ Custo rastreado por feature (RAG, STT, Vision)
- ✅ Exportação funcional (CSV, JSON via API)

### Bonus (Nice-to-Haves)
- ⚠️ Satisfaction score tracking (thumbs up/down)
- ⚠️ Intent classification (FAQ vs suporte vs vendas)
- ⚠️ Anomaly detection (vs threshold-based alerts)

---

## 11. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|-----------|------------|
| **Event emission breaks existing flows** | High | Low | Feature flag (`ANALYTICS_ENABLED`), no-op listeners, backward compat tests |
| **Analytics queries slow down prod** | High | Medium | Separate read-replica for analytics, query optimization, aggregates |
| **Storage growth (90d retention)** | Medium | High | Cleanup job, monitoring, partitioning if needed |
| **Dashboard overload (too many metrics)** | Medium | Medium | Start with 4 core KPIs, progressive disclosure |
| **Alert fatigue (too many alerts)** | Medium | High | Conservative thresholds, group by severity, mute/snooze |
| **Cost tracking inaccurate** | Medium | Low | Hardcoded pricing constants, unit tests, manual validation |

---

## 12. References

### Existing Codebase
- `src/modules/metrics/metrics.service.ts` — Prometheus metrics (existing)
- `src/modules/message/entities/message.entity.ts` — Message schema with `userId`, `conversationId` (Phase 5)
- `src/modules/memory/` — Long-term memory (Phase 5) as data source for analytics
- `test/support/stt-transcribe.ts` — STT fallback pattern (Phase 3)
- `test/support/vision-analyze.ts` — Vision fallback pattern (Phase 4)

### External Documentation
- [NestJS EventEmitter](https://docs.nestjs.com/techniques/events) — Event-driven architecture
- [BullMQ Documentation](https://docs.bullmq.io/) — Job scheduling, aggregation
- [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/) — Alert rules, Alertmanager
- [Ant Design Pro](https://pro.ant.design/) — React admin/analytics components
- [React Query](https://tanstack.com/query/latest) — Server state management
- [PostgreSQL PERCENTILE_CONT](https://www.postgresql.org/docs/current/functions-aggregate.html) — Percentile calculation

---

## 13. Next Steps (After Research)

1. **Create 3 PLAN.md files:**
   - `06-01-PLAN.md` — Wave 1: Tracer (event collection + basic API)
   - `06-02-PLAN.md` — Wave 2: Expansion (aggregation + all KPIs + jobs)
   - `06-03-PLAN.md` — Wave 3: Dashboard + Alerting (React + charts + notifications)

2. **Verify plans with `gsd-plan-checker`**

3. **Execute with `gsd-executor` agents (3 waves)**

4. **Update PROGRESS.md após completion**

---

**End of Research Document**
