# Phase 6: Analytics Dashboard - Research

**Researched:** 2026-08-26
**Domain:** Analytics, Metrics Collection, Dashboard Architecture
**Confidence:** MEDIUM

## Summary

Phase 6 implementa um dashboard de métricas operacionais e de negócio para o OpenWA. A pesquisa identificou que a plataforma já possui infraestrutura básica de métricas (Prometheus/Grafana no docker-compose, módulo `src/modules/metrics`, agregações SQL em `src/modules/stats`), mas falta:

1. **Eventos de métricas de negócio**: tracking de tokens LLM, custo por conversa, taxa de resolução
2. **Agregações pré-computadas**: materialized views ou jobs BullMQ para KPIs pesados
3. **Dashboard dedicado**: API REST para analytics + UI web ou provisioning Grafana

**Primary recommendation:** Estender o sistema de métricas existente com event-driven collection (NestJS EventEmitter2) para KPIs de negócio, usar PostgreSQL com materialized views refresh incremental para agregações, e provisionar dashboards Grafana via YAML (já existe infraestrutura Docker). Evitar TimescaleDB por adicionar complexidade desnecessária — PostgreSQL nativo suporta time-series queries eficientes com índices em `createdAt`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Metrics Collection | API / Backend | — | Event emitters em services coletam métricas no momento da ação (message send, LLM call) |
| Metrics Storage | Database / Storage | — | PostgreSQL armazena eventos raw + aggregations; Redis cache para queries frequentes |
| Aggregation Jobs | API / Backend | — | BullMQ workers processam agregações periódicas (hourly/daily rollups) |
| Dashboard API | API / Backend | — | REST endpoints `/api/analytics/*` servem dados pré-agregados |
| Dashboard UI | CDN / Static | Frontend Server (SSR) | Opção 1: Grafana (provisioned, no custom code). Opção 2: React dashboard servido via NestJS ServeStatic |
| Alerting | API / Backend | — | Threshold checks em aggregation jobs disparam webhooks (Slack, email) |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @nestjs/event-emitter | 3.1.0 | Event-driven metrics collection | [VERIFIED: npm registry] NestJS oficial para pub/sub interno, usado para desacoplar coleta de métricas da lógica de negócio |
| pg | 8.23.0 | PostgreSQL driver | [VERIFIED: codebase — já instalado] Driver nativo Node.js para PostgreSQL, já usado pelo projeto |
| bullmq | 6.1.1 | Job scheduler para agregações | [VERIFIED: codebase — já instalado] Queue system do projeto, ideal para cron jobs de aggregation |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @nestjs/schedule | latest | Cron jobs alternativos | [ASSUMED] Se BullMQ for overkill para aggregations simples, mas BullMQ já existe e é mais robusto |
| ioredis | 6.0.0 | Cache de agregações | [VERIFIED: codebase — já instalado] Já usado pelo projeto, ideal para memoizar queries de dashboard |
| node-cron | latest | Fallback scheduler | [ASSUMED] Alternativa lightweight se BullMQ não for viável, mas menos tolerante a falhas |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PostgreSQL materialized views | TimescaleDB continuous aggregates | TimescaleDB adiciona dependência e complexidade de deploy; PostgreSQL views com REFRESH CONCURRENTLY são suficientes para volume esperado (<100k msgs/dia) |
| Grafana provisioned | Custom React dashboard | Custom UI dá mais controle, mas Grafana é battle-tested e zero-maintenance; só construir custom se Grafana não atender UX específico |
| Event-driven collection | Polling agregador | Polling adiciona latência e load no DB; events capturam métricas no momento exato da ação |

**Installation:**
```bash
npm install @nestjs/event-emitter
```

**Version verification:** 
```bash
npm view @nestjs/event-emitter version  # 3.1.0 (2026-08-26)
npm view pg version                      # 8.23.0 (já instalado)
npm view bullmq version                  # 6.1.1 (já instalado)
```

## Package Legitimacy Audit

> Phase 6 instala 1 novo pacote externo.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @nestjs/event-emitter | npm | 5+ yrs | ~500k/wk | github.com/nestjs/event-emitter | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none

**Packages flagged as suspicious [SUS]:** none

*@nestjs/event-emitter descoberto via Context7 (official NestJS docs), confirmado no registry npm. Parte da família @nestjs/* oficial.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Metrics Collection Layer                      │
│  (Event-driven: decorators + EventEmitter2 in services)         │
└───────────────────────┬─────────────────────────────────────────┘
                        │ emit events
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                 Analytics Events Listener                        │
│  (AnalyticsService subscribes to: message.sent, llm.completed,  │
│   rag.query, stt.transcribed, vision.analyzed)                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ persist raw events
                        ↓
┌─────────────────────────────────────────────────────────────────┐
│                   PostgreSQL Storage                             │
│  Tables: analytics_events (raw), analytics_aggregations (KPIs)  │
│  Indexes: (event_type, created_at), (session_id, created_at)    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ↓                           ↓
┌──────────────────────┐    ┌──────────────────────┐
│  BullMQ Aggregator   │    │  Materialized Views  │
│  (cron: hourly/daily)│    │  (manual REFRESH or  │
│  Pre-compute KPIs    │    │   triggered refresh) │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           └────────────┬──────────────┘
                        ↓ query aggregated data
           ┌────────────────────────┐
           │   Analytics API        │
           │  GET /api/analytics/*  │
           │  (cached via ioredis)  │
           └────────────┬───────────┘
                        │
         ┌──────────────┴───────────────┐
         ↓                              ↓
┌─────────────────┐         ┌─────────────────────┐
│  Grafana        │         │  Custom Dashboard   │
│  (provisioned)  │         │  (React, optional)  │
└─────────────────┘         └─────────────────────┘
```

### Recommended Project Structure
```
src/
├── modules/
│   ├── analytics/                    # Novo módulo
│   │   ├── analytics.module.ts
│   │   ├── analytics.service.ts      # Event listener + persistence
│   │   ├── analytics.controller.ts   # REST API
│   │   ├── entities/
│   │   │   ├── analytics-event.entity.ts
│   │   │   └── analytics-aggregation.entity.ts
│   │   ├── dto/
│   │   │   ├── analytics-query.dto.ts
│   │   │   └── kpi-response.dto.ts
│   │   ├── jobs/
│   │   │   └── aggregation.processor.ts  # BullMQ worker
│   │   └── decorators/
│   │       └── track-metric.decorator.ts # @TrackMetric() decorator
│   ├── metrics/                      # Existente (Prometheus)
│   └── stats/                        # Existente (agregações SQL)
├── database/
│   ├── migrations/
│   │   └── XXXXXX-create-analytics-tables.ts
│   └── views/
│       └── analytics_kpis_hourly.sql  # Materialized view DDL
└── config/
    └── grafana-dashboards/           # Provisioned dashboards (JSON)
        └── openwa-analytics.json
```

### Pattern 1: Event-Driven Metrics Collection

**What:** Services emitem eventos quando ações relevantes ocorrem; `AnalyticsService` escuta e persiste.

**When to use:** Para capturar métricas no momento exato da ação sem adicionar coupling.

**Example:**
```typescript
// Source: Context7 NestJS docs + best practices
// src/modules/message/message.service.ts
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class MessageService {
  constructor(private eventEmitter: EventEmitter2) {}

  async sendMessage(sessionId: string, to: string, text: string) {
    const startTime = Date.now();
    
    // Lógica de envio existente...
    const result = await this.engine.sendText(to, text);
    
    // Emitir evento para analytics
    this.eventEmitter.emit('message.sent', {
      sessionId,
      messageId: result.id,
      direction: 'outgoing',
      latencyMs: Date.now() - startTime,
      timestamp: new Date(),
    });
    
    return result;
  }
}

// src/modules/analytics/analytics.service.ts
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEvent)
    private eventRepo: Repository<AnalyticsEvent>,
  ) {}

  @OnEvent('message.sent')
  async handleMessageSent(payload: any) {
    await this.eventRepo.save({
      eventType: 'message.sent',
      sessionId: payload.sessionId,
      metadata: payload,
      createdAt: payload.timestamp,
    });
  }

  @OnEvent('llm.completed')
  async handleLLMCompleted(payload: any) {
    await this.eventRepo.save({
      eventType: 'llm.completed',
      sessionId: payload.sessionId,
      metadata: {
        provider: payload.provider,
        model: payload.model,
        tokensUsed: payload.tokensUsed,
        costUsd: payload.costUsd,
        latencyMs: payload.latencyMs,
      },
      createdAt: new Date(),
    });
  }
}
```

### Pattern 2: Materialized Views para Agregações

**What:** PostgreSQL materialized views pré-computam agregações pesadas; refresh via BullMQ job.

**When to use:** Quando queries de KPIs são complexas (GROUP BY multi-table, window functions) e rodam frequentemente.

**Example:**
```sql
-- Source: PostgreSQL 16 docs + best practices
-- database/views/analytics_kpis_hourly.sql

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics_kpis_hourly AS
SELECT
  date_trunc('hour', ae.created_at) AS hour_bucket,
  ae.session_id,
  COUNT(*) FILTER (WHERE ae.event_type = 'message.sent') AS messages_sent,
  COUNT(*) FILTER (WHERE ae.event_type = 'message.received') AS messages_received,
  COUNT(*) FILTER (WHERE ae.event_type = 'llm.completed') AS llm_calls,
  SUM((ae.metadata->>'tokensUsed')::int) FILTER (WHERE ae.event_type = 'llm.completed') AS total_tokens,
  SUM((ae.metadata->>'costUsd')::float) FILTER (WHERE ae.event_type = 'llm.completed') AS total_cost_usd,
  AVG((ae.metadata->>'latencyMs')::int) FILTER (WHERE ae.event_type = 'llm.completed') AS avg_llm_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (ae.metadata->>'latencyMs')::int) 
    FILTER (WHERE ae.event_type = 'llm.completed') AS p95_llm_latency_ms
FROM analytics_events ae
WHERE ae.created_at >= NOW() - INTERVAL '30 days'
GROUP BY hour_bucket, ae.session_id;

CREATE UNIQUE INDEX ON analytics_kpis_hourly (hour_bucket, session_id);
```

```typescript
// Refresh via BullMQ job (cron: every hour at :05)
// src/modules/analytics/jobs/aggregation.processor.ts
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Processor('analytics-aggregation')
export class AggregationProcessor extends WorkerHost {
  constructor(
    @InjectDataSource('data') private dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job) {
    const startTime = Date.now();
    
    // REFRESH CONCURRENTLY permite leituras durante refresh
    await this.dataSource.query(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY analytics_kpis_hourly'
    );
    
    const durationMs = Date.now() - startTime;
    console.log(`[Analytics] Materialized view refreshed in ${durationMs}ms`);
    
    return { durationMs };
  }
}
```

### Pattern 3: KPI Calculation Formulas

**What:** Fórmulas para calcular métricas de negócio a partir de eventos raw.

**Example:**
```typescript
// src/modules/analytics/analytics.service.ts

interface ResolutionRateKPI {
  totalConversations: number;
  resolvedByBot: number;
  escalatedToHuman: number;
  resolutionRate: number; // 0-1
}

async calculateResolutionRate(
  sessionId: string,
  startDate: Date,
  endDate: Date,
): Promise<ResolutionRateKPI> {
  // Uma conversa é "resolvida pelo bot" se não teve evento 'escalate.human'
  // dentro de 30min após o último 'message.received'
  
  const result = await this.dataSource.query(`
    WITH conversations AS (
      SELECT
        (metadata->>'conversationId') AS conversation_id,
        MAX(created_at) AS last_activity,
        BOOL_OR(event_type = 'escalate.human') AS escalated
      FROM analytics_events
      WHERE session_id = $1
        AND created_at BETWEEN $2 AND $3
        AND event_type IN ('message.received', 'message.sent', 'escalate.human')
      GROUP BY conversation_id
    )
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE NOT escalated) AS resolved_by_bot,
      COUNT(*) FILTER (WHERE escalated) AS escalated
    FROM conversations
  `, [sessionId, startDate, endDate]);
  
  const { total, resolved_by_bot, escalated } = result[0];
  
  return {
    totalConversations: parseInt(total),
    resolvedByBot: parseInt(resolved_by_bot),
    escalatedToHuman: parseInt(escalated),
    resolutionRate: total > 0 ? resolved_by_bot / total : 0,
  };
}

async calculateCostPerConversation(
  sessionId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  const result = await this.dataSource.query(`
    SELECT
      COUNT(DISTINCT (metadata->>'conversationId')) AS conversation_count,
      COALESCE(SUM((metadata->>'costUsd')::float), 0) AS total_cost
    FROM analytics_events
    WHERE session_id = $1
      AND created_at BETWEEN $2 AND $3
      AND event_type IN ('llm.completed', 'stt.transcribed', 'vision.analyzed')
  `, [sessionId, startDate, endDate]);
  
  const { conversation_count, total_cost } = result[0];
  return conversation_count > 0 ? total_cost / conversation_count : 0;
}

async calculateFallbackRate(
  sessionId: string,
  startDate: Date,
  endDate: Date,
): Promise<number> {
  // Fallback = quando LLM responde "Não entendi" ou usa resposta padrão
  // Rastrear via metadata.usedFallback ou event_type = 'llm.fallback'
  
  const result = await this.dataSource.query(`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'llm.completed') AS total_llm_calls,
      COUNT(*) FILTER (WHERE 
        event_type = 'llm.completed' 
        AND (metadata->>'usedFallback')::boolean = true
      ) AS fallback_count
    FROM analytics_events
    WHERE session_id = $1
      AND created_at BETWEEN $2 AND $3
  `, [sessionId, startDate, endDate]);
  
  const { total_llm_calls, fallback_count } = result[0];
  return total_llm_calls > 0 ? fallback_count / total_llm_calls : 0;
}
```

### Anti-Patterns to Avoid

- **Polling para métricas em tempo real:** Use event-driven (EventEmitter2) para capturar no momento da ação, não polling periódico que adiciona latência e load.
- **Agregações query-time sem cache:** KPIs complexos devem ser pré-computados (materialized views ou aggregation jobs), não calculados on-demand em cada request de dashboard.
- **Métricas no hot path sem async:** Persistir eventos de analytics deve ser fire-and-forget (EventEmitter é sync mas listener pode fazer async save), nunca bloquear o fluxo principal (ex: envio de mensagem).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dashboard UI | Custom charting from scratch | Grafana provisioned ou Chart.js/Recharts | [ASSUMED] Grafana é battle-tested e zero-maintenance para ops dashboards; se custom UI necessário, usar lib de charts pronta |
| Time-series DB | TimescaleDB setup | PostgreSQL + índices em `createdAt` | [ASSUMED] TimescaleDB adiciona complexidade; PostgreSQL nativo suporta time-series queries eficientes com volume esperado (<100k events/dia) |
| Percentile calculations | Custom algorithm | PostgreSQL `PERCENTILE_CONT()` | [VERIFIED: PostgreSQL docs] Window function nativa calcula p50/p95/p99 corretamente, mais eficiente que implementar em app layer |
| Alerting logic | Custom threshold checker | Grafana Alerts ou webhook em aggregation job | [ASSUMED] Grafana tem alerting built-in com múltiplos canais (Slack, email); se custom, apenas threshold check simples em job |

**Key insight:** Dashboard e analytics são domínio com ferramentas maduras (Grafana, PostgreSQL aggregations). Não reinventar a roda — focar em coleta de eventos de negócio (que são específicos do OpenWA) e usar ferramentas prontas para agregação/visualização.

## Common Pitfalls

### Pitfall 1: Eventos bloqueando o hot path

**What goes wrong:** Persistir métricas de forma síncrona no fluxo de envio de mensagem adiciona latência visível ao usuário.

**Why it happens:** EventEmitter2 do NestJS é síncrono por padrão; se listener faz I/O (DB save), bloqueia.

**How to avoid:** 
- Usar listeners async mas não await no emit (fire-and-forget)
- Ou usar queue (BullMQ) para persistir eventos assincronamente
- Aceitar que eventos podem ser perdidos em crash (trade-off latência vs durabilidade)

**Warning signs:** Latência de envio de mensagem aumenta de <50ms para >200ms após adicionar analytics.

### Pitfall 2: Aggregations sem índices adequados

**What goes wrong:** Queries de KPIs fazem table scan completo, matando performance em produção.

**Why it happens:** Desenvolvedores testam com poucos dados (<1k rows), onde índices não fazem diferença.

**How to avoid:**
- Criar índices compostos em `(event_type, created_at)` e `(session_id, created_at)`
- Testar queries com EXPLAIN ANALYZE em dataset realista (100k+ rows)
- Usar materialized views para agregações complexas

**Warning signs:** Dashboard queries levam >5s; logs mostram "Seq Scan" no EXPLAIN.

### Pitfall 3: Materialized views stale sem refresh

**What goes wrong:** Dashboard mostra dados desatualizados (horas ou dias atrás) porque view não foi refreshed.

**Why it happens:** Materialized views não auto-refresh; precisa de trigger manual ou cron job.

**How to avoid:**
- Configurar BullMQ job com cron `0 5 * * * *` (every hour at :05) para refresh
- Monitorar timestamp da última row na view vs NOW() — alertar se >2h stale
- Usar `REFRESH CONCURRENTLY` para permitir leituras durante refresh

**Warning signs:** Dashboard mostra "Last updated: 8 hours ago"; usuário reporta "números não batem".

### Pitfall 4: Cost tracking sem provider-specific logic

**What goes wrong:** Cálculo de custo LLM está errado porque cada provider (Groq, OpenAI) tem pricing diferente.

**Why it happens:** Código usa fórmula única `tokens * 0.001` sem considerar modelo e provider.

**How to avoid:**
- Mapear `(provider, model)` → pricing table (ex: `gpt-4: $0.03/1k tokens`, `groq/mixtral: free`)
- Armazenar `costUsd` calculado no evento `llm.completed`, não recalcular depois
- Atualizar pricing table quando providers mudarem preços

**Warning signs:** Dashboard mostra custo total $0 quando deveria ser >$0; ou custo muito alto para Groq (que é free).

## Code Examples

Verified patterns from official sources:

### BullMQ Cron Job for Aggregations

```typescript
// Source: Context7 BullMQ docs
// src/modules/analytics/analytics.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AggregationProcessor } from './jobs/aggregation.processor';
import { AnalyticsEvent } from './entities/analytics-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnalyticsEvent], 'data'),
    BullModule.registerQueue({
      name: 'analytics-aggregation',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  providers: [AnalyticsService, AggregationProcessor],
  controllers: [AnalyticsController],
  exports: [AnalyticsService],
})
export class AnalyticsModule {
  constructor(private analyticsService: AnalyticsService) {}

  async onModuleInit() {
    // Schedule hourly aggregation job
    await this.analyticsService.scheduleAggregationJob();
  }
}

// src/modules/analytics/analytics.service.ts
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectQueue('analytics-aggregation') private aggregationQueue: Queue,
  ) {}

  async scheduleAggregationJob() {
    await this.aggregationQueue.upsertJobScheduler(
      'hourly-aggregation',
      {
        pattern: '0 5 * * * *', // Every hour at :05
        tz: 'UTC',
      },
      {
        name: 'aggregate-metrics',
        data: { type: 'hourly' },
      },
    );
    console.log('[Analytics] Hourly aggregation job scheduled');
  }
}
```

### Grafana Dashboard Provisioning

```yaml
# Source: Context7 Grafana docs
# config/grafana-dashboards/datasource.yml
apiVersion: 1

datasources:
  - name: OpenWA PostgreSQL
    type: postgres
    url: postgres:5432
    user: openwa
    secureJsonData:
      password: 'openwa_secure_2026'
    jsonData:
      database: openwa
      sslmode: 'disable'
      maxOpenConns: 10
      maxIdleConns: 5
      connMaxLifetime: 14400
      postgresVersion: 1600
      timescaledb: false
```

```json
// config/grafana-dashboards/openwa-analytics.json (simplified)
{
  "dashboard": {
    "title": "OpenWA Analytics",
    "panels": [
      {
        "title": "Messages per Hour",
        "targets": [
          {
            "format": "time_series",
            "rawSql": "SELECT hour_bucket AS time, messages_sent, messages_received FROM analytics_kpis_hourly WHERE $__timeFilter(hour_bucket) ORDER BY 1",
            "refId": "A"
          }
        ],
        "type": "graph"
      },
      {
        "title": "LLM Cost (USD)",
        "targets": [
          {
            "format": "time_series",
            "rawSql": "SELECT hour_bucket AS time, SUM(total_cost_usd) as cost FROM analytics_kpis_hourly WHERE $__timeFilter(hour_bucket) GROUP BY 1 ORDER BY 1",
            "refId": "A"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
```

### Analytics REST API

```typescript
// Source: NestJS patterns + codebase conventions
// src/modules/analytics/analytics.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('analytics')
@Controller('api/analytics')
@UseGuards(ApiKeyGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('kpis/resolution-rate')
  @ApiOperation({ summary: 'Get resolution rate KPI' })
  async getResolutionRate(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.calculateResolutionRate(
      query.sessionId,
      query.startDate,
      query.endDate,
    );
  }

  @Get('kpis/cost-per-conversation')
  @ApiOperation({ summary: 'Get cost per conversation' })
  async getCostPerConversation(@Query() query: AnalyticsQueryDto) {
    const cost = await this.analyticsService.calculateCostPerConversation(
      query.sessionId,
      query.startDate,
      query.endDate,
    );
    return { costUsd: cost };
  }

  @Get('kpis/fallback-rate')
  @ApiOperation({ summary: 'Get LLM fallback rate' })
  async getFallbackRate(@Query() query: AnalyticsQueryDto) {
    const rate = await this.analyticsService.calculateFallbackRate(
      query.sessionId,
      query.startDate,
      query.endDate,
    );
    return { fallbackRate: rate };
  }

  @Get('overview')
  @ApiOperation({ summary: 'Get analytics overview for last 30 days' })
  async getOverview(@Query('sessionId') sessionId?: string) {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const [resolutionRate, costPerConv, fallbackRate] = await Promise.all([
      this.analyticsService.calculateResolutionRate(sessionId, startDate, endDate),
      this.analyticsService.calculateCostPerConversation(sessionId, startDate, endDate),
      this.analyticsService.calculateFallbackRate(sessionId, startDate, endDate),
    ]);
    
    return {
      period: { startDate, endDate },
      sessionId: sessionId || 'all',
      kpis: {
        resolutionRate: resolutionRate.resolutionRate,
        totalConversations: resolutionRate.totalConversations,
        costPerConversation: costPerConv,
        fallbackRate: fallbackRate,
      },
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Prometheus metrics only | Hybrid: Prometheus (ops) + Business events (analytics) | 2024+ | [ASSUMED] Prometheus é excelente para métricas de infraestrutura mas não para KPIs de negócio complexos; trend é separar concerns |
| Real-time aggregation | Pre-computed via materialized views | 2020+ | [ASSUMED] Dashboards modernos priorizam UX (queries <500ms) sobre freshness absoluta; stale-by-5-min é aceitável |
| Polling for metrics | Event-driven collection | 2018+ | [VERIFIED: NestJS EventEmitter2 desde 2018] Event-driven captura métricas no momento exato sem overhead de polling |

**Deprecated/outdated:**
- **TimescaleDB para todo time-series:** [ASSUMED] Hype inicial (2017-2020) diminuiu; comunidade reconhece que PostgreSQL nativo é suficiente para muitos casos (<1M events/dia)
- **Custom dashboard frameworks (D3.js from scratch):** [ASSUMED] Grafana e libs prontas (Chart.js, Recharts) dominaram; custom só para UX muito específico

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this
> section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | PostgreSQL é suficiente vs TimescaleDB para volume esperado (<100k events/dia) | Standard Stack | Se volume real for >1M events/dia, queries podem ficar lentas; migração para TimescaleDB seria complexa |
| A2 | Grafana provisioned é preferível a custom React dashboard | Standard Stack | Se UX específico for mandatório (ex: embedded no produto), Grafana pode não atender; refactor para custom seria significativo |
| A3 | LLM cost tracking não existe atualmente | Architecture Patterns | Se já existir tracking (não encontrado em grep), implementação duplicada seria waste |
| A4 | Pricing LLM varia por provider/model | Common Pitfalls | Se pricing for flat, lógica de pricing table seria over-engineering |
| A5 | Dashboard pode tolerar staleness de 5-60min | State of the Art | Se real-time absoluto for requirement, materialized views não servem; precisaria stream processing (Kafka, Flink) |
| A6 | Volume de eventos permite event storage em PostgreSQL (não precisa Kafka) | Architecture Patterns | Se volume for >10k events/segundo, PostgreSQL pode não escalar; precisaria message broker dedicado |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Qual o volume esperado de eventos de analytics?**
   - What we know: Projeto suporta até 10+ sessões simultâneas; sem dados de msgs/dia por sessão
   - What's unclear: Se volume será <10k events/dia (PostgreSQL tranquilo) ou >100k (considerar optimizations)
   - Recommendation: Implementar com PostgreSQL; monitorar query performance; migrar para TimescaleDB se p95 latency >1s

2. **Dashboard deve ser real-time (<1s freshness) ou near-real-time (~5min) é aceitável?**
   - What we know: Grafana e materialized views suportam near-real-time bem; real-time precisa streaming
   - What's unclear: Requirement de negócio — ops dashboards geralmente toleram 5min staleness
   - Recommendation: Começar com near-real-time (materialized views refresh a cada hora, cache Redis 30s); se real-time for necessário, adicionar WebSocket push depois

3. **LLM cost tracking: como capturar tokens e custo?**
   - What we know: Codebase não tem tracking explícito de tokens (grep não encontrou)
   - What's unclear: Se integração n8n externa já rastreia, ou se OpenWA precisa instrumentar chamadas LLM
   - Recommendation: Adicionar instrumentation em `src/modules/integration` (n8n client) para capturar `tokensUsed` e calcular `costUsd` com pricing table

4. **Alerting: qual canal preferido (email, Slack, webhook)?**
   - What we know: Projeto já tem webhook system robusto com retry
   - What's unclear: Preferência operacional — Grafana Alerts suporta múltiplos canais
   - Recommendation: Usar Grafana Alerts com webhook para flexibilidade; implementar receiver endpoint em OpenWA se custom logic necessário

## Environment Availability

> Verifica dependências externas para Phase 6.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Metrics storage | ✓ | 16+ (docker-compose) | — |
| Redis | Aggregation cache | ✓ | 7 (já usado) | — |
| Grafana | Dashboard (option 1) | ✓ | latest (docker-compose) | Custom React dashboard |
| BullMQ | Aggregation jobs | ✓ | 6.1.1 (já instalado) | @nestjs/schedule para cron simples |

**Missing dependencies with no fallback:** Nenhuma — todas as dependências core já existem no projeto.

**Missing dependencies with fallback:**
- **Grafana:** Se não for usar Grafana, fallback é construir custom React dashboard (Chart.js/Recharts). Grafana está disponível no `docker-compose.full-stack.yml`, então assume-se que está disponível.

## Validation Architecture

> **Não aplicável:** `.planning/config.json` não existe; assume-se que validação não está configurada. Se workflow.nyquist_validation for habilitado futuramente, adicionar:

### Test Framework (quando habilitado)
| Property | Value |
|----------|-------|
| Framework | Jest 30.4.2 (já configurado) |
| Config file | package.json jest section |
| Quick run command | `npm run test:e2e:analytics` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map (quando habilitado)
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Event collection não bloqueia hot path | unit | `npm test src/modules/analytics/analytics.service.spec.ts` | ❌ Wave 0 |
| DASH-02 | Aggregation job atualiza materialized view | integration | `npm run test:e2e -- aggregation.e2e-spec.ts` | ❌ Wave 0 |
| DASH-03 | KPI calculations retornam valores corretos | unit | `npm test src/modules/analytics/analytics.service.spec.ts` | ❌ Wave 0 |
| DASH-04 | API analytics retorna <500ms com cache | e2e | `npm run test:e2e -- analytics-api.e2e-spec.ts` | ❌ Wave 0 |

### Wave 0 Gaps (quando validação habilitada)
- [ ] `test/analytics-api.e2e-spec.ts` — covers DASH-04 (API latency)
- [ ] `src/modules/analytics/analytics.service.spec.ts` — covers DASH-01, DASH-03
- [ ] `test/aggregation.e2e-spec.ts` — covers DASH-02

*(Se validação não for habilitada, Wave 0 pode omitir testes E2E e focar em manual testing via Grafana dashboards.)*

## Security Domain

> Security enforcement assume-se habilitado (padrão quando config ausente).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | API Key guard existente para `/api/analytics/*` endpoints |
| V3 Session Management | no | Analytics é stateless; sem sessões |
| V4 Access Control | yes | API Key guard + rate limiting (já existente no projeto) |
| V5 Input Validation | yes | class-validator em DTOs (AnalyticsQueryDto) |
| V6 Cryptography | no | Não armazena dados sensíveis; métricas são agregadas |

### Known Threat Patterns for Analytics Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection em queries analytics | Tampering | [VERIFIED: codebase] TypeORM parametrized queries + raw SQL com bind params ($1, $2) |
| PII leak em analytics events | Information Disclosure | Sanitizar `metadata` — nunca armazenar senhas, tokens, ou PII (CPF, email completo) |
| DoS via aggregation queries | Denial of Service | Rate limiting no controller + query timeout (PostgreSQL `statement_timeout`) |
| Unauthorized access a métricas | Elevation of Privilege | API Key guard (já existente) + Grafana auth (configurar `GF_SECURITY_ADMIN_PASSWORD`) |

**Mitigations específicas para Phase 6:**
- **Event metadata sanitization:** Antes de persistir `analytics_events`, remover campos sensíveis (ex: `message.body`, `user.email`) — manter apenas IDs e métricas numéricas.
- **Grafana authentication:** Configurar `GF_SECURITY_ADMIN_PASSWORD` no docker-compose; não usar default `admin/admin`.
- **Query timeout:** Configurar `statement_timeout = 10s` no PostgreSQL para prevenir DoS via queries lentas.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: npm registry] @nestjs/event-emitter 3.1.0 — confirmed via `npm view`
- [VERIFIED: npm registry] pg 8.23.0, bullmq 6.1.1 — confirmed already installed via package.json
- [CITED: Context7 /nestjs/docs.nestjs.com] EventEmitter2 patterns, interceptors for metrics collection
- [CITED: Context7 /taskforcesh/bullmq] Cron job patterns, job schedulers with upsertJobScheduler
- [CITED: Context7 /grafana/grafana] PostgreSQL data source provisioning, dashboard JSON format

### Secondary (MEDIUM confidence)
- [CITED: Context7 /nestjs/docs.nestjs.com] ObserveModule runtime metrics (não usado no projeto, referência de padrão)

### Tertiary (LOW confidence)
- [ASSUMED] PostgreSQL materialized views são suficientes para volume <100k events/dia (não confirmado com benchmark)
- [ASSUMED] TimescaleDB vs PostgreSQL tradeoff — baseado em conhecimento geral, não em documentação oficial para este projeto
- [ASSUMED] KPI formulas (resolution rate, cost per conversation) — baseado em práticas comuns de chatbot analytics, não em requirement específico do projeto
- [ASSUMED] Grafana é preferível a custom dashboard — baseado em experiência geral, não em requirement de UX específico

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - NestJS e BullMQ patterns verificados via Context7; PostgreSQL aggregations assumidas baseadas em capabilities conhecidas
- Architecture: MEDIUM - Event-driven collection verificada (NestJS EventEmitter2 docs); materialized views e aggregation jobs assumidas eficazes para volume esperado
- Pitfalls: MEDIUM - Baseado em experiência com analytics systems e PostgreSQL, mas não testado especificamente neste projeto

**Research date:** 2026-08-26
**Valid until:** 30 dias (stack estável; NestJS/PostgreSQL patterns mudam pouco)
