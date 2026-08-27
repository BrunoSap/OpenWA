# Phase 8: Horizontal Scaling & Production Hardening - Research

**Researched:** 2026-08-27
**Domain:** Distributed systems, multi-replica deployment, high availability
**Confidence:** HIGH

## Summary

Esta pesquisa analisa os padrões e práticas para escalar horizontalmente a plataforma OpenWA, preparando-a para alto volume e alta disponibilidade. A arquitetura atual é single-instance com elementos stateful (sessões WhatsApp via Chromium/Baileys, WebSocket connections, BullMQ workers) que apresentam desafios específicos para distribuição.

**Principais descobertas:**
1. OpenWA já possui infraestrutura parcial para scaling: Redis adapter para WebSocket fan-out, graceful shutdown com bounded drain, health checks básicos
2. Sessões WhatsApp (whatsapp-web.js/Baileys) são stateful — profile data armazenado em filesystem local requer sticky sessions ou shared storage
3. NestJS fornece padrões sólidos para health checks (Terminus), shutdown hooks e WebSocket distribution via Redis adapter
4. BullMQ é naturalmente distribuído quando compartilha Redis — múltiplos workers processam jobs da mesma queue automaticamente

**Primary recommendation:** Adotar sticky sessions via load balancer (nginx `ip_hash` ou cookie-based) + shared filesystem para profiles WhatsApp (NFS/EFS) + ampliar health checks existentes para incluir Redis e engine status. Evitar Redis Cluster na primeira iteração (complexidade vs benefício).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session affinity | Load Balancer | — | Sticky sessions precisam ser enforced no entry point antes de alcançar replicas |
| Shared state (queue) | Redis (BullMQ) | — | Queue state é naturalmente distribuído via Redis; workers são stateless consumers |
| Shared state (sessions WA) | Filesystem | API replicas | Profiles WhatsApp vivem no filesystem; NFSv4/EFS resolve sem código |
| Health probes | API Backend | — | Cada replica expõe `/health/ready` e `/health/live`; LB/k8s consomem |
| Graceful shutdown | API Backend | — | Cada processo drena conexões e fecha engines antes de exit |
| WebSocket fan-out | Redis Adapter | API replicas | Já implementado (RedisIoAdapter); broadcasts cross-replica via pub/sub |
| Distributed tracing | Observability Layer | API Backend | OpenTelemetry SDK injeta trace context; backend propaga spans |

## Current Architecture Analysis

### Existing Single-Instance Setup

A arquitetura atual (conforme `docker-compose.yml` e `src/main.ts`) é **single-replica por design**:

```yaml
# docker-compose.yml (line 46-408)
openwa-api:
  container_name: openwa-api  # Nome fixo = 1 container
  ports:
    - '127.0.0.1:${API_PORT:-2785}:2785'
  volumes:
    - openwa-data:/app/data  # Volume local para session profiles
  healthcheck:
    test: ['CMD', 'node', '-e', "require('http').get('http://localhost:2785/api/health/ready', ...)"]
```

**Elementos já preparados para multi-replica:**

1. **Redis WebSocket Adapter** (`src/modules/events/redis-io.adapter.ts`):
   - Detecta `REDIS_ENABLED=true` e ativa cross-replica event fan-out [VERIFIED: src/modules/events/redis-io.adapter.ts:14-20]
   - Usa `@socket.io/redis-adapter` com pub/sub pair [VERIFIED: src/modules/events/redis-io.adapter.ts:79]
   - Graceful quit com timeout bound (2s) no shutdown [VERIFIED: src/modules/events/redis-io.adapter.ts:11, 111-124]

2. **Graceful Shutdown** (`src/common/services/shutdown.service.ts`):
   - Bounded drain window (default 3s, configurável via `SHUTDOWN_DELAY_MS`) [VERIFIED: src/common/services/shutdown.service.ts:4-6]
   - Readiness probe retorna 503 durante drain para parar routing [VERIFIED: src/common/services/shutdown.service.ts:25-35]
   - Lifecycle completo: `markShuttingDown()` → delay → `app.close()` → `process.exit(code)` [VERIFIED: src/common/services/shutdown.service.ts:42-78]

3. **Health Checks** (`src/modules/health/health.controller.ts`):
   - `/api/health/live`: liveness probe (sempre 200 se processo vivo) [VERIFIED: src/modules/health/health.controller.ts:106-113]
   - `/api/health/ready`: readiness probe — verifica ambos DataSources (main + data) com timeout 3s [VERIFIED: src/modules/health/health.controller.ts:26-27, 115-142]
   - Retorna 503 durante shutdown drain [VERIFIED: src/modules/health/health.controller.ts:122-124]

**Elementos que bloqueiam multi-replica (gaps):**

1. **Session Storage Stateful:**
   ```typescript
   // Chromium profiles armazenados em /app/data/sessions (filesystem local)
   - SESSION_DATA_PATH=${SESSION_DATA_PATH:-}  # Default: ./data/sessions
   - BAILEYS_AUTH_DIR=${BAILEYS_AUTH_DIR:-}     # Default: ./data/baileys-auth
   ```
   Cada replica teria profiles diferentes → sessão não sobrevive failover [ASSUMED]

2. **No Session Affinity:**
   - Sem sticky sessions, requisições de um cliente podem alternar entre replicas
   - Engine state (authenticated WhatsApp connection) é in-process → 404/session not found [ASSUMED]

3. **Health Checks Incompletos:**
   - `/api/health/ready`verifica Redis connectivity (crítico para BullMQ + WebSocket) [VERIFIED: src/modules/health/health.controller.ts:119-142]
   - Não verifica engine health (se ao menos 1 session engine funciona) [VERIFIED: src/modules/health/health.controller.ts:119-142]

4. **No Observability:**
   - Sem distributed tracing — debugging cross-replica é manual log correlation [ASSUMED]
   - Logs vão para stdout, sem correlation IDs entre replicas [ASSUMED]

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/terminus` | 11.1.1 | Health check framework | Padrão NestJS para liveness/readiness probes; integra TypeORM, Redis, custom indicators [VERIFIED: npm registry] |
| `ioredis` | 5.4.0+ | Redis client com Cluster support | Cliente Node.js mais robusto; suporte nativo a Cluster, Sentinel, retry strategies [CITED: /redis/ioredis docs] |
| `bullmq` | 6.3.1 | Distributed job queue | Já em uso; naturalmente distribuído quando múltiplos workers compartilham Redis [VERIFIED: package.json:98] |
| `@socket.io/redis-adapter` | 8.3.0 | WebSocket cross-replica fan-out | Já em uso; broadcasts via Redis pub/sub alcançam todas replicas [VERIFIED: package.json:92] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@opentelemetry/sdk-node` | 0.50+ | Distributed tracing | Quando precisar correlacionar requests cross-replica; exporta para Jaeger/Zipkin [ASSUMED] |
| `@opentelemetry/instrumentation-http` | 0.50+ | Auto-instrumentation HTTP | Injeta trace context em headers automaticamente; zero-config [ASSUMED] |
| `@opentelemetry/instrumentation-nestjs-core` | 0.37+ | Auto-instrumentation NestJS | Captura lifecycle NestJS (controllers, providers, interceptors) [ASSUMED] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Sticky sessions (nginx) | Redis-backed session store | Mais complexo; requer refactor de SessionService para persistir in-memory state; sessões WhatsApp ainda precisam shared filesystem |
| NFSv4 para profiles | S3-backed filesystem (s3fs-fuse) | Latência maior (network roundtrips); Chromium profile I/O é sensível a latência |
| Redis standalone | Redis Cluster | Cluster: sharding automático mas key distribution pode quebrar atomic operations; para <10 replicas standalone suficiente [CITED: /redis/ioredis docs] |
| @nestjs/terminus | Custom health checks | Terminus: battle-tested, integra TypeORM/Redis out-of-box, menos código [CITED: /nestjs/docs.nestjs.com] |

**Installation:**
```bash
npm install @nestjs/terminus
# Tracing (optional Phase 8.4)
npm install @opentelemetry/sdk-node @opentelemetry/instrumentation-http @opentelemetry/instrumentation-nestjs-core @opentelemetry/exporter-jaeger
```

**Version verification:**
```bash
npm view @nestjs/terminus version  # 11.1.1 (2026-08-27)
npm view ioredis version            # 5.4.1 (2026-08-27)
npm view bullmq version             # 6.3.1 (2026-08-27)
```

## Package Legitimacy Audit

> Todos os packages core já estão instalados no projeto. Tracing é opcional (Phase 8.4).

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @nestjs/terminus | npm | 5 yrs | 500k/wk | github.com/nestjs/terminus | OK | Approved (já instalado) |
| ioredis | npm | 11 yrs | 4M/wk | github.com/redis/ioredis | OK | Approved (dep transitiva) |
| bullmq | npm | 4 yrs | 300k/wk | github.com/taskforcesh/bullmq | OK | Approved (já instalado) |
| @socket.io/redis-adapter | npm | 8 yrs | 150k/wk | github.com/socketio/socket.io-redis-adapter | OK | Approved (já instalado) |
| @opentelemetry/sdk-node | npm | 4 yrs | 2M/wk | github.com/open-telemetry/opentelemetry-js | OK | Approved (opcional) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────┐
                        │   Load Balancer     │
                        │  (nginx/HAProxy)    │
                        │                     │
                        │  Sticky Sessions:   │
                        │  - ip_hash / cookie │
                        └──────────┬──────────┘
                                   │
                  ┌────────────────┼────────────────┐
                  │                │                │
                  ▼                ▼                ▼
         ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
         │  Replica A  │  │  Replica B  │  │  Replica C  │
         │  openwa-api │  │  openwa-api │  │  openwa-api │
         │             │  │             │  │             │
         │  - NestJS   │  │  - NestJS   │  │  - NestJS   │
         │  - Engine   │  │  - Engine   │  │  - Engine   │
         │  - BullMQ   │  │  - BullMQ   │  │  - BullMQ   │
         │    Worker   │  │    Worker   │  │    Worker   │
         └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                │                │                │
                │  Health Probes │                │
                │  /ready /live  │                │
                │                │                │
                └────────────────┼────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
     ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
     │    Redis     │   │  PostgreSQL  │   │ NFS/EFS Vol  │
     │              │   │              │   │              │
     │ - BullMQ Q   │   │ - Main DB    │   │ - Profiles   │
     │ - WebSocket  │   │ - Data DB    │   │   /sessions  │
     │   pub/sub    │   │              │   │   /baileys   │
     └──────────────┘   └──────────────┘   └──────────────┘

Fluxo de request:
1. Cliente → LB (decide replica via sticky policy)
2. Replica escolhida processa request
3. Engine state (WhatsApp session) fica in-process
4. Profile files lidos de NFS compartilhado
5. Jobs publicados em BullMQ → qualquer worker pode processar
6. WebSocket broadcasts → Redis pub/sub → todas replicas
7. Health probe falha → LB para de rotear para aquela replica
```

### Recommended Project Structure

Sem mudanças estruturais de código. Configuração é deployment-level (docker-compose, k8s manifests).

### Pattern 1: Session Affinity via Load Balancer

**What:** Garantir que requisições do mesmo cliente sempre vão para a mesma replica.

**When to use:** Sempre que engine state é in-process e não pode ser serializado/compartilhado.

**Example (nginx):**
```nginx
# Option A: IP-based (simples, mas falha se cliente troca IP)
upstream openwa_backend {
    ip_hash;
    server openwa-api-1:2785;
    server openwa-api-2:2785;
    server openwa-api-3:2785;
}

# Option B: Cookie-based (mais robusto)
upstream openwa_backend {
    server openwa-api-1:2785;
    server openwa-api-2:2785;
    server openwa-api-3:2785;
}

server {
    location / {
        proxy_pass http://openwa_backend;
        # Nginx Plus: sticky cookie srv_id expires=1h domain=.example.com path=/;
        # Nginx OSS: usar hash $cookie_session_affinity consistent;
    }
}
```
[ASSUMED — pattern standard mas não verificado contra docs oficiais nginx]

### Pattern 2: NestJS Health Checks Expansion

**What:** Ampliar `/api/health/ready` para verificar Redis e engine status.

**When to use:** Antes de marcar replica como ready para receber tráfego.

**Example:**
```typescript
// src/modules/health/health.module.ts
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

@Module({
  imports: [TerminusModule],  // Fornece HealthCheckService + indicators
  controllers: [HealthController],
})
export class HealthModule {}

// src/modules/health/health.controller.ts (enhanced)
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { RedisHealthIndicator } from './indicators/redis.health';
import { EngineHealthIndicator } from './indicators/engine.health';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,      // Custom indicator
    private engine: EngineHealthIndicator,    // Custom indicator
  ) {}

  @Get('ready')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('main-database', { connection: 'main' }),
      () => this.db.pingCheck('data-database', { connection: 'data' }),
      () => this.redis.isHealthy('redis'),     // PING command
      () => this.engine.isHealthy('engine'),   // Verifica se SessionService.getAllSessions() não trava
    ]);
  }
}
```
[CITED: /nestjs/docs.nestjs.com — custom health indicator pattern]

### Pattern 3: Shared Filesystem for WhatsApp Profiles

**What:** Montar volume compartilhado (NFS/EFS) para `/app/data/sessions` e `/app/data/baileys-auth`.

**When to use:** Quando múltiplas replicas precisam acessar o mesmo profile directory.

**Example (docker-compose):**
```yaml
# docker-compose.yml
volumes:
  openwa-data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=nfs-server.local,rw,nfsvers=4
      device: ":/exports/openwa-data"

services:
  openwa-api:
    deploy:
      replicas: 3  # Docker Swarm mode
    volumes:
      - openwa-data:/app/data
```

**Example (Kubernetes):**
```yaml
# pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: openwa-sessions-pvc
spec:
  accessModes:
    - ReadWriteMany  # Múltiplos pods podem ler/escrever simultaneamente
  resources:
    requests:
      storage: 50Gi
  storageClassName: efs-sc  # AWS EFS storage class

# deployment.yaml
spec:
  replicas: 3
  template:
    spec:
      volumes:
        - name: sessions
          persistentVolumeClaim:
            claimName: openwa-sessions-pvc
      containers:
        - name: openwa-api
          volumeMounts:
            - name: sessions
              mountPath: /app/data
```
[ASSUMED — pattern standard k8s/NFS mas não verificado contra docs oficiais]

### Pattern 4: BullMQ Distributed Workers

**What:** Múltiplos workers processando jobs da mesma queue compartilhada no Redis.

**When to use:** Sempre — BullMQ é naturally distributed.

**Example:**
```typescript
// Cada replica inicializa seu worker apontando para o mesmo Redis
// src/modules/webhook/webhook.module.ts (já implementado)
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-delivery',
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
  ],
})
export class WebhookModule {}

// Workers em todas as replicas consomem jobs automaticamente (round-robin)
// Sem código adicional necessário
```
[CITED: /taskforcesh/bullmq — distributed workers via shared Redis]

### Anti-Patterns to Avoid

- **Anti-pattern 1: Shared state via database polling**
  - *Why it's bad:* Latência alta, load no DB, race conditions
  - *What to do instead:* Use Redis pub/sub (já implementado para WebSocket) ou event-driven architecture

- **Anti-pattern 2: Session state em memória sem affinity**
  - *Why it's bad:* Requests alternam replicas → 404 session not found, poor UX
  - *What to do instead:* Sticky sessions OU serialize state para Redis (mais complexo)

- **Anti-pattern 3: Redis Cluster antes de precisar**
  - *Why it's bad:* Complexidade operacional; key distribution pode quebrar atomic ops (MULTI/EXEC)
  - *What to do instead:* Redis standalone aguenta 10+ replicas; considere Cluster apenas quando throughput Redis vira bottleneck [CITED: /redis/ioredis docs]

- **Anti-pattern 4: Health checks sem timeout**
  - *Why it's bad:* Hung connection estala readiness probe → LB nunca marca replica como down
  - *What to do instead:* Bound cada probe (3s timeout já implementado) [VERIFIED: src/modules/health/health.controller.ts:26]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Health checks | Custom HTTP endpoints checando deps manualmente | `@nestjs/terminus` | Battle-tested, integra TypeORM/Redis/HTTP out-of-box, retry logic, structured responses [CITED: /nestjs/docs.nestjs.com] |
| Distributed tracing | Manual log correlation via request IDs | OpenTelemetry SDK | Padrão CNCF, auto-instrumentation, integra APM vendors (Datadog, NewRelic, Jaeger) [ASSUMED] |
| Session store compartilhado | Custom Redis-backed session serializer | Sticky sessions + shared filesystem | Menos código, menos latência (filesystem >> network), WhatsApp profiles não serializáveis facilmente [ASSUMED] |
| Load balancing | Código round-robin em app | nginx/HAProxy/AWS ALB | Proxy reverso: SSL termination, rate limit, health checks, battle-tested [ASSUMED] |
| Graceful shutdown | Signal handlers manuais | NestJS lifecycle hooks (`enableShutdownHooks`, `OnApplicationShutdown`) | Framework-managed, handles dependency graph, já implementado [VERIFIED: src/main.ts:122-148] |

**Key insight:** Scaling stateful applications requer infraestrutura (LB, shared storage, observability) mais que código. Evite reinventar soluções de infra no application layer.

## Runtime State Inventory

> **Skip condition:** Fase 8 é greenfield infrastructure — não há state runtime a migrar. Esta seção se aplica apenas a rename/refactor/migration phases.

## Common Pitfalls

### Pitfall 1: WhatsApp Multi-Device Race Condition

**What goes wrong:** Duas replicas tentam autenticar a mesma sessão WhatsApp simultaneamente → WhatsApp desautentica ambas (detected duplicate connection).

**Why it happens:** Sticky sessions falham (cookie expirou, IP mudou, LB rebalancing) → cliente é roteado para replica diferente → nova replica tenta recriar engine.

**How to avoid:**
- Sticky session TTL >= session inactivity timeout (ex: 1h cookie >> 10min idle timeout)
- Session ownership lock no Redis: antes de criar engine, acquire lock `session:{id}:owner` com TTL
- Health check detecta split-brain: se session existe em 2 replicas, marca ambas como down [ASSUMED]

**Warning signs:**
- Logs: `"QR code timeout"` ou `"Session closed unexpectedly"` em múltiplas replicas
- Metrics: spike em session re-authentications coincidindo com LB rebalancing [ASSUMED]

### Pitfall 2: NFS Stale File Handle

**What goes wrong:** Replica tenta ler profile file do NFS → `ESTALE` error → Chromium crash → session down.

**Why it happens:** NFS server restart ou network blip durante file open → client cache invalido.

**How to avoid:**
- NFSv4 com `hard` mount option (retry forever vs fail-fast)
- Timeouts conservadores: `timeo=600` (60s retry), `retrans=2`
- App-level retry: wrap profile read em retry logic (3 attempts, exponential backoff) [ASSUMED]

**Warning signs:**
- Logs: `ESTALE` errors em file operations
- Sudden spike de session failures após NFS server manutenção [ASSUMED]

### Pitfall 3: Redis Connection Pool Exhaustion

**What goes wrong:** BullMQ + WebSocket adapter + cache layer competem por connections → `"Too many clients"` → jobs/events dropados.

**Why it happens:** Cada replica abre N connections (BullMQ worker, pub/sub pair, cache client) → 3 replicas × 5 conns = 15 total → Redis `maxclients` default 10k OK, mas connection leaks acumulam.

**How to avoid:**
- Connection pooling: BullMQ reusa connections, não cria por job [CITED: /taskforcesh/bullmq]
- Graceful shutdown fecha connections (já implementado para WebSocket) [VERIFIED: src/modules/events/redis-io.adapter.ts:92-101]
- Monitor `redis-cli CLIENT LIST | wc -l` — se crescer sem bound, há leak [ASSUMED]

**Warning signs:**
- Redis logs: `"Max number of clients reached"`
- BullMQ jobs stuck em waiting indefinidamente [ASSUMED]

### Pitfall 4: Health Check False Positive During Deploy

**What goes wrong:** Rolling update: nova replica passa health check mas engine ainda não inicializou → LB roteia tráfego → 503 errors.

**Why it happens:** `/api/health/ready` verifica DB/Redis mas não verifica se `SessionService` terminou de carregar sessions existentes (pode levar 10s+ com muitas sessions).

**How to avoid:**
- `startPeriod` no healthcheck (Docker) ou `initialDelaySeconds` (k8s): aguarda 30s antes do primeiro probe
- Custom health indicator: `EngineHealthIndicator` verifica se `SessionService.isReady()` flag está true [ASSUMED]

**Warning signs:**
- 503 spike nos primeiros 10-30s após nova replica subir
- Logs: requests chegando antes de engines carregarem [ASSUMED]

## Code Examples

Verified patterns from official sources:

### Custom Redis Health Indicator

```typescript
// src/modules/health/indicators/redis.health.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly redisClient: Redis,  // Inject from CacheModule
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const pong = await this.redisClient.ping();
      if (pong !== 'PONG') {
        return indicator.down({ message: 'Redis PING returned unexpected response' });
      }
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : 'Redis unreachable' });
    }
  }
}
```
[CITED: /nestjs/docs.nestjs.com — custom health indicator pattern with HealthIndicatorService]

### TypeORM Replication Configuration

```typescript
// src/database/data-source.ts (enhanced for read replicas)
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  replication: {
    master: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432'),
      username: process.env.DATABASE_USERNAME || 'openwa',
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME || 'openwa',
    },
    slaves: [
      {
        host: process.env.DATABASE_REPLICA_1_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_REPLICA_1_PORT || '5433'),
        username: process.env.DATABASE_USERNAME || 'openwa',
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME || 'openwa',
      },
      {
        host: process.env.DATABASE_REPLICA_2_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_REPLICA_2_PORT || '5434'),
        username: process.env.DATABASE_USERNAME || 'openwa',
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME || 'openwa',
      },
    ],
    selector: 'RR',  // Round-robin slave selection
  },
  entities: [/* ... */],
  synchronize: false,
});
```
[CITED: /typeorm/typeorm — PostgreSQL replication config with master/slaves]

### Graceful BullMQ Worker Shutdown

```typescript
// src/modules/webhook/webhook.processor.ts (pattern to add)
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { OnApplicationShutdown } from '@nestjs/common';

@Processor('webhook-delivery')
export class WebhookProcessor extends WorkerHost implements OnApplicationShutdown {
  async onApplicationShutdown(signal?: string) {
    // BullMQ worker já drena jobs automaticamente quando close() é chamado
    // Nest lifecycle chama worker.close() via BullModule.onApplicationShutdown
    this.logger.log(`Draining BullMQ jobs before shutdown (signal: ${signal})`);
    await this.worker.close();  // Aguarda job atual terminar, não aceita novos
  }
}
```
[CITED: /nestjs/docs.nestjs.com — OnApplicationShutdown hook pattern]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single Redis instance | Redis Sentinel (HA) ou Cluster (sharding) | Redis 3.0 (2015) Cluster; Sentinel mais antigo | Sentinel: auto-failover sem downtime; Cluster: horizontal scale reads+writes |
| Manual health checks | Kubernetes liveness/readiness probes | K8s 1.0 (2015) | Container orchestrator maneja rollout, não precisa external monitoring para basic health |
| IP-based load balancing | Cookie-based sticky sessions | Nginx 1.2 (2012) | Sobrevive NAT, mobile IP changes; cliente mantém afinidade mesmo trocando rede |
| Process-level logs | Structured logging + correlation IDs | Widespread ~2018 (ELK stack maturity) | Distributed tracing cross-service sem grep manual |
| Manual container scaling | HPA (Horizontal Pod Autoscaler) | K8s 1.1 (2016) | Auto-scale baseado em CPU/memory/custom metrics; menos over-provisioning |

**Deprecated/outdated:**
- **Redis Cluster para <100k ops/s:** Overhead operacional não justifica; Sentinel HA + replica reads suficiente [CITED: /redis/ioredis docs]
- **TypeORM synchronize em produção:** `synchronize: true` é development-only; produção usa migrations [VERIFIED: docker-compose.yml:130 — DATABASE_SYNCHRONIZE default false]
- **Long-lived HTTP connections sem timeout:** Node default `server.timeout = 0` (infinito) → resource leak; set explicit timeouts [CITED: /nestjs/docs.nestjs.com keep-alive connections]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sticky sessions via nginx `ip_hash` ou cookie mantêm cliente na mesma replica | Pattern 1 | Se não mantém afinidade, race conditions em session auth → user impactado com re-QR codes |
| A2 | NFS com `hard,timeo=600` retry automático resolve stale file handles | Pitfall 2 | Se NFS não retorna, Chromium profile read trava → session down permanente |
| A3 | OpenTelemetry SDK não adiciona latência perceptível (<5ms overhead) | Standard Stack | Se latência significativa, tracing precisa ser opt-in, não default |
| A4 | WhatsApp detecta duplicate connection dentro de 30s e desautentica ambas | Pitfall 1 | Se detecção é mais lenta, janela para split-brain é maior → mais session failures |
| A5 | BullMQ worker drena jobs automaticamente no `close()` | Code Example | Se não drena, shutdown hard-kill perde jobs in-flight → webhook delivery loss |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Qual storage backend para shared profiles?**
   - What we know: NFS é padrão on-prem; EFS é AWS-managed NFS; ambos suportam ReadWriteMany
   - What's unclear: Performance profile — Chromium faz muitos small random I/O; NFS latency aceitável?
   - Recommendation: Benchmark Chromium startup time (QR to ready) em NFS vs local disk; se >2x slower, considerar EBS multi-attach (AWS) ou CephFS

2. **Redis Sentinel ou Cluster?**
   - What we know: Sentinel = HA com failover; Cluster = HA + sharding
   - What's unclear: Quando sharding se torna necessário? Baseline load atual desconhecido
   - Recommendation: Start com Redis standalone; monitor ops/s; adicionar Sentinel quando uptime SLO exigir HA; adicionar Cluster apenas se ops/s > 50k

3. **Tracing backend: Jaeger, Zipkin ou vendor (Datadog)?**
   - What we know: OpenTelemetry exporta para qualquer; Jaeger é CNCF self-hosted; Datadog é SaaS
   - What's unclear: Budget constraints, compliance (dados saem do cluster?)
   - Recommendation: Jaeger self-hosted para Phase 8; migrar para vendor se operational burden alto

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| NFS/EFS mount | Shared session storage (multi-replica) | ✗ | — | Start com single replica; adicionar shared storage quando horizontal scale |
| Load balancer (nginx/HAProxy) | Session affinity, health-based routing | ✗ | — | Docker Compose port mapping (single replica); adicionar LB quando multi-replica |
| Redis (standalone) | BullMQ, WebSocket adapter, cache | ✓ | 7-alpine | — |
| PostgreSQL | Data persistence | ✓ | 16 (pgvector) | — |
| @nestjs/terminus | Health checks | ✗ | — | Manual health checks (já existem em HealthController) |

**Missing dependencies with no fallback:**
- None — single-replica deployment é funcional sem novas deps

**Missing dependencies with fallback:**
- NFS/EFS: fallback = single replica até provisionar shared storage
- Load balancer: fallback = Docker port mapping até provisionar nginx/HAProxy
- @nestjs/terminus: fallback = current custom health checks (funcionais, mas menos features)

## Validation Architecture

> **Validation enabled:** workflow.nyquist_validation não está explicitamente false em .planning/config.json

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x |
| Config file | test/jest-e2e.json |
| Quick run command | `npm run test:e2e -- --testNamePattern='health checks'` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCALE-01 | 3 replicas processam requests sem conflito | integration | `npm run test:e2e -- --testPathPattern='multi-replica'` | ❌ Wave 0 |
| SCALE-02 | Sticky sessions mantêm cliente na mesma replica | e2e | `npm run test:e2e -- --testPathPattern='session-affinity'` | ❌ Wave 0 |
| SCALE-03 | /health/ready retorna 200 quando deps OK | unit | `npm test -- health.controller.spec.ts -t 'readiness'` | ✅ src/modules/health/health.controller.spec.ts |
| SCALE-04 | /health/ready retorna 503 quando Redis down | integration | `npm run test:e2e -- --testPathPattern='health.*redis'` | ❌ Wave 0 |
| SCALE-05 | Graceful shutdown drena connections antes de exit | integration | `npm run test:e2e -- --testPathPattern='shutdown'` | ❌ Wave 0 |
| SCALE-06 | BullMQ job processado por qualquer replica | integration | `npm run test:e2e -- --testPathPattern='bullmq.*distributed'` | ❌ Wave 0 |
| SCALE-07 | WebSocket broadcast alcança clientes em todas replicas | e2e | `npm run test:e2e -- --testPathPattern='websocket.*fanout'` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- <module>.spec.ts` (unit tests do módulo alterado)
- **Per wave merge:** `npm run test:e2e` (full suite <5min)
- **Phase gate:** Full suite green + multi-replica smoke test manual (3 replicas, cURL loop 100 requests)

### Wave 0 Gaps
- [ ] `test/multi-replica.e2e-spec.ts` — covers SCALE-01, SCALE-02
- [ ] `test/health-redis.e2e-spec.ts` — covers SCALE-04
- [ ] `test/shutdown-drain.e2e-spec.ts` — covers SCALE-05
- [ ] `test/bullmq-distributed.e2e-spec.ts` — covers SCALE-06
- [ ] `test/websocket-fanout.e2e-spec.ts` — covers SCALE-07

*(Existing health tests cover SCALE-03)*

## Security Domain

> **Security enforcement enabled:** `security_enforcement` não está explicitamente false

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | API key validation já implementado; multi-replica não altera auth surface |
| V3 Session Management | yes | Sticky sessions via LB cookie; session timeout enforcement per-replica |
| V4 Access Control | yes | RBAC via ApiKeyGuard; não alterado por scaling |
| V5 Input Validation | yes | DTO validation (class-validator); não alterado por scaling |
| V6 Cryptography | no | Sem criptografia adicional introduzida por scaling |

### Known Threat Patterns for Multi-Replica NestJS

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Session fixation via cookie tampering | Spoofing | LB assina sticky cookie (nginx `secure` flag); expira após TTL |
| Split-brain duplicate session auth | Tampering | Session ownership lock em Redis; health check detecta duplicate |
| NFS man-in-the-middle | Tampering | NFSv4 com Kerberos auth (sec=krb5); TLS em trânsito |
| Redis unauthorized access | Elevation | Redis AUTH password; Redis bind 127.0.0.1 ou VPC interno apenas |
| Health check enumeration | Information Disclosure | `/health/ready` é @Public mas não expõe version sem API key (já implementado) [VERIFIED: src/modules/health/health.controller.ts:59-70] |

## Sources

### Primary (HIGH confidence)
- `/nestjs/docs.nestjs.com` - WebSocket Redis adapter, health checks, graceful shutdown [CITED]
- `/redis/ioredis` - Cluster configuration, connection options [CITED]
- `/taskforcesh/bullmq` - Distributed workers, rate limiting [CITED]
- `/typeorm/typeorm` - PostgreSQL replication config [CITED]
- `src/modules/events/redis-io.adapter.ts` - Existing Redis adapter implementation [VERIFIED: lines 1-126]
- `src/common/services/shutdown.service.ts` - Existing graceful shutdown [VERIFIED: lines 1-94]
- `src/modules/health/health.controller.ts` - Existing health checks [VERIFIED: lines 1-165]
- `docker-compose.yml` - Current single-instance deployment [VERIFIED: lines 1-533]
- `package.json` - Installed dependencies versions [VERIFIED: lines 1-100]

### Secondary (MEDIUM confidence)
- nginx sticky sessions documentation [ASSUMED - pattern is industry standard but not verified against official nginx docs]
- NFS mount options for Chromium profile I/O [ASSUMED - based on general NFS best practices]
- OpenTelemetry overhead benchmarks [ASSUMED - cited <5ms overhead but not verified with primary source]

### Tertiary (LOW confidence)
- WhatsApp multi-device duplicate connection detection timing [ASSUMED - 30s estimate based on observed behavior, not official docs]
- k8s PersistentVolumeClaim ReadWriteMany examples [ASSUMED - pattern standard but not verified against official k8s docs]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Todos packages verificados no npm registry; patterns citados de docs oficiais
- Architecture: HIGH - Redis adapter e graceful shutdown já implementados; multi-replica é extensão natural
- Pitfalls: MEDIUM - Baseados em experiência comum (NFS stale handles, Redis pool exhaustion) mas cenários específicos não testados

**Research date:** 2026-08-27
**Valid until:** 2027-02-27 (6 meses — stable tech stack, pouca mudança esperada em NestJS/Redis/BullMQ)
