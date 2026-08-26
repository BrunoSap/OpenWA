<!-- refreshed: 2026-08-26 -->
# Architecture

**Analysis Date:** 2026-08-26

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        HTTP/WebSocket Layer                              │
│  NestJS Controllers (REST API) + Socket.IO Gateway (Real-time events)   │
├──────────────┬──────────────┬──────────────┬───────────────────────────┤
│   Sessions   │  Messages    │  Webhooks    │    Integration Fabric     │
│ `modules/    │ `modules/    │ `modules/    │  `modules/integration/`   │
│  session/`   │  message/`   │  webhook/`   │  (Provider ingress)       │
└──────┬───────┴──────┬───────┴──────┬───────┴──────────┬────────────────┘
       │              │              │                   │
       ▼              ▼              ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Engine Layer (Adapters)                          │
│  `src/engine/` - Pluggable WhatsApp engine abstraction                  │
│  ├─ WhatsAppWebJsAdapter (Puppeteer-based, browser automation)          │
│  └─ BaileysAdapter (WebSocket-based, no browser)                        │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Core Infrastructure                              │
│  ├─ Plugins (`core/plugins/`) - Sandboxed plugin runtime (workers)      │
│  ├─ Hooks (`core/hooks/`) - Event hook system                           │
│  ├─ Agent Tools (`core/agent-tools/`) - Protocol-neutral tool registry  │
│  └─ Common (`common/`) - Shared utilities, guards, middleware           │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Persistence Layer                               │
│  ├─ Main DB (SQLite): API keys, audit logs (`database/main.sqlite`)     │
│  ├─ Data DB (SQLite/Postgres): Sessions, messages, webhooks             │
│  ├─ Redis: Rate limiting, caching, WebSocket fan-out (optional)         │
│  └─ Storage: Media files (local filesystem / MinIO / S3)                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **main.ts** | Bootstrap, lifecycle, graceful shutdown | `src/main.ts` |
| **AppModule** | Root module, orchestrates all feature modules | `src/app.module.ts` |
| **EngineFactory** | Creates WhatsApp engine instances (pluggable) | `src/engine/engine.factory.ts` |
| **SessionService** | Session lifecycle (create, start, stop, delete) | `src/modules/session/session.service.ts` |
| **MessageModule** | Send/receive messages, templates, batching | `src/modules/message/` |
| **WebhookModule** | Outbound webhook delivery + retry (outbox pattern) | `src/modules/webhook/` |
| **IntegrationModule** | Provider webhook ingress + fast-ack pipeline | `src/modules/integration/` |
| **PluginLoaderService** | Plugin discovery, sandboxed execution (workers) | `src/core/plugins/plugin-loader.service.ts` |
| **AuthModule** | API key auth, role-based access (OPERATOR/ADMIN/USER) | `src/modules/auth/` |
| **EventsModule** | WebSocket Gateway, cross-replica fan-out (Redis) | `src/modules/events/` |
| **QueueModule** | BullMQ job processing (webhooks, ingress, optional) | `src/modules/queue/` |

## Pattern Overview

**Overall:** Modular Monolith with NestJS + Pluggable Engine Architecture

**Key Characteristics:**
- **Domain-driven modules:** Each module (`session/`, `message/`, `webhook/`) owns its entities, services, controllers
- **Dependency injection:** NestJS IoC container wires cross-module dependencies
- **Adapter pattern:** Engine layer abstracts WhatsApp client implementations (wwjs vs Baileys)
- **Event-driven:** Engine events → webhook delivery → integration ingress (async pipelines)
- **Pluggable:** Core plugin system with sandboxed worker threads for untrusted code
- **Dual-database:** Main (auth/audit) always SQLite, Data (user data) switchable SQLite/Postgres

## Layers

**Presentation Layer (HTTP/WebSocket):**
- Purpose: Expose REST API + real-time event streaming
- Location: `src/modules/*/controllers/*.controller.ts`, `src/modules/events/events.gateway.ts`
- Contains: NestJS controllers decorated with `@Controller()`, Socket.IO gateway
- Depends on: Service layer (each module's `*.service.ts`)
- Used by: External clients (Dashboard, n8n, API consumers)

**Application Service Layer:**
- Purpose: Business logic, orchestration, session/message management
- Location: `src/modules/*/services/*.service.ts`
- Contains: Injectable services decorated with `@Injectable()`, DTOs for validation
- Depends on: Engine layer, repositories (TypeORM), core infrastructure
- Used by: Controllers, other services (cross-module via DI)

**Engine Abstraction Layer:**
- Purpose: Unified interface to multiple WhatsApp client implementations
- Location: `src/engine/`
- Contains: `IWhatsAppEngine` interface, adapters (wwjs, Baileys), capability matrix
- Depends on: Third-party WhatsApp libraries (`whatsapp-web.js`, `@whiskeysockets/baileys`)
- Used by: SessionService, MessageModule (via EngineRegistry)

**Core Infrastructure Layer:**
- Purpose: Cross-cutting concerns (auth, logging, caching, plugins, hooks)
- Location: `src/core/`, `src/common/`
- Contains: Plugin runtime, hook system, guards, middleware, utilities
- Depends on: Nothing (foundation layer)
- Used by: All application modules

**Persistence Layer:**
- Purpose: Data storage and retrieval
- Location: `src/database/`, entity files (`*.entity.ts`)
- Contains: TypeORM entities, migrations, DataSources (main + data)
- Depends on: SQLite (better-sqlite3) / Postgres (pg), Redis (ioredis)
- Used by: All modules via TypeORM repositories

## Data Flow

### Primary Request Path (Send Message)

1. **HTTP Request** → `MessageController.send()` (`src/modules/message/message.controller.ts:150`)
2. **Service Layer** → `MessageService.sendMessage()` validates DTO, resolves session (`src/modules/message/message.service.ts:250`)
3. **Engine Dispatch** → Retrieves engine from `EngineRegistry`, calls adapter's `sendMessage()` (`src/engine/engine-registry.service.ts:80`)
4. **WhatsApp Client** → Adapter (wwjs or Baileys) sends to WhatsApp servers (`src/engine/adapters/whatsapp-web-js.adapter.ts:200`)
5. **Response** → Returns `MessageResult` with WhatsApp message ID to controller

### Inbound Message Flow (Webhook Delivery)

1. **Engine Event** → WhatsApp client emits `message` event, adapter converts to `IncomingMessage` (`src/engine/adapters/wwebjs-message-events.ts:50`)
2. **Session Wiring** → `SessionEngineEventWiring` routes event to webhook service (`src/modules/session/session-engine-event-wiring.ts:120`)
3. **Webhook Outbox** → `WebhookOutboxService` persists event to `webhook_outbox_event` table (`src/modules/webhook/webhook-outbox.service.ts:100`)
4. **Queue Dispatch** → If `QUEUE_ENABLED`, enqueues job; else direct HTTP POST (`src/modules/webhook/webhook-delivery.service.ts:180`)
5. **Delivery + Retry** → Exponential backoff retry on failure, failure tracking (`src/modules/webhook/webhook-delivery.service.ts:250`)

### Integration Ingress Flow (Provider Webhook)

1. **Public Ingress** → External provider POSTs to `/api/integrations/:instanceId/ingress` (`src/modules/integration/ingress.controller.ts:50`)
2. **Fast ACK** → Returns 202 immediately, payload persisted to `ingress_events` (`src/modules/integration/ingress-ack.ts:20`)
3. **Queue Processing** → Job dispatched to `ingress` queue processor (`src/modules/queue/processors/ingress.processor.ts:80`)
4. **Plugin Dispatch** → Plugin sandbox executes `onIngressEvent()` handler (`src/core/plugins/plugin-worker-host.ts:200`)
5. **Session Interaction** → Plugin uses capability APIs to send WhatsApp messages via session

**State Management:**
- Session state: In-memory engine registry (`EngineRegistry`) + persisted to `sessions` table
- WebSocket state: Redis adapter for cross-replica pub/sub when `REDIS_ENABLED=true`
- Queue state: BullMQ (Redis-backed) for webhook/ingress job persistence

## Key Abstractions

**IWhatsAppEngine:**
- Purpose: Capability-based interface abstracting WhatsApp client implementations
- Examples: `src/engine/interfaces/whatsapp-engine.interface.ts:500`
- Pattern: Adapter pattern - each client (wwjs, Baileys) implements this interface
- Capabilities: `SessionLifecycleCapability`, `MessagingCapability`, `GroupCapability`, `CatalogCapability`, etc.

**Plugin System:**
- Purpose: Sandboxed runtime for untrusted third-party code (n8n integration, custom handlers)
- Examples: `src/core/plugins/plugin-loader.service.ts`, sandbox workers in `src/core/plugins/sandbox/`
- Pattern: Worker threads with message passing, capability-based security model
- Isolation: Separate heap (OOM doesn't kill host), no direct host process.env/secrets access

**Outbox Pattern (Webhooks):**
- Purpose: Reliable async event delivery with retry and failure tracking
- Examples: `src/modules/webhook/webhook-outbox.service.ts`, `entities/webhook-outbox-event.entity.ts`
- Pattern: Transactional outbox - event persisted in same transaction as business data, delivered async
- Guarantees: At-least-once delivery, ordered per session when queue enabled

**Module Composition:**
- Purpose: Encapsulate domain logic (session, message, webhook) as cohesive units
- Examples: `src/modules/session/session.module.ts`, each module exports `*.module.ts`
- Pattern: NestJS module system - `@Module({ imports, controllers, providers, exports })`
- Benefits: Clear boundaries, testable in isolation, lazy-loadable (QueueModule, MCPModule conditional)

## Entry Points

**HTTP Server:**
- Location: `src/main.ts:197`
- Triggers: `app.listen(port)` after Nest bootstraps
- Responsibilities: Serves REST API (`/api/*`), bundled dashboard SPA (`/`), Swagger docs (`/api/docs`)

**WebSocket Gateway:**
- Location: `src/modules/events/events.gateway.ts`
- Triggers: Client connects to `/socket.io`
- Responsibilities: Real-time event streaming (messages, status updates), session-scoped subscriptions

**Background Workers (Optional):**
- Location: `src/modules/queue/processors/*.processor.ts` (webhook, ingress, message-batch)
- Triggers: `QUEUE_ENABLED=true` enables BullMQ processors
- Responsibilities: Async webhook delivery, integration ingress processing, batch message sends

**CLI Scripts:**
- Location: `scripts/` (e.g., `scripts/export-openapi.ts`)
- Triggers: Manual execution via `npm run` commands
- Responsibilities: OpenAPI export, database migrations, health checks

## Architectural Constraints

- **Threading:** Single-threaded event loop (Node.js), but plugin workers run in separate threads (worker_threads). Each WhatsApp session (wwjs) spawns a Chromium multi-process tree.
- **Global state:** `EngineRegistry` (`src/engine/engine-registry.service.ts`) is a singleton map of sessionId → engine instance. Shared across all requests/modules.
- **Circular imports:** Avoided via forwardRef() where necessary (e.g., SessionModule ↔ WebhookModule). Core modules (`HooksModule`, `PluginsModule`) registered before feature modules to break cycles.
- **Database connections:** Two TypeORM connections - `main` (SQLite, always) and `data` (SQLite or Postgres). Named connections prevent entity collisions.
- **Puppeteer sandboxing:** Chromium runs with `--no-sandbox` (container is security boundary). Container hardened with `cap_drop: ALL`, minimal caps re-added, read-only rootfs.
- **Plugin sandboxing:** Worker threads with allowlisted env vars (no secrets), heap cap (256MB default), inflight capability call limit (32 concurrent).

## Anti-Patterns

### ❌ Direct Engine Access

**What happens:** Controller directly imports `EngineRegistry` or `EngineFactory` and calls engine methods
**Why it's wrong:** Bypasses session lifecycle fences (starting/stopping states), audit logging, error handling in SessionService
**Do this instead:** Always route through `SessionService` → `SessionEngineLifecycle` → `EngineRegistry` (`src/modules/session/session.service.ts`)

### ❌ Synchronous Webhook Delivery

**What happens:** Calling webhook URL in same request path as message send/receive
**Why it's wrong:** HTTP timeout to slow webhook endpoint blocks session event loop, stalls message processing
**Do this instead:** Use `WebhookOutboxService` to persist event, deliver async via queue or background worker (`src/modules/webhook/webhook-outbox.service.ts`)

### ❌ Plugin Code in Host Process

**What happens:** Importing third-party plugin code directly into main server process (`require(pluginMainPath)`)
**Why it's wrong:** Untrusted code shares heap (OOM kills server), has full process.env (secrets), no isolation
**Do this instead:** Load plugins via `PluginWorkerHost` in sandboxed worker threads (`src/core/plugins/sandbox/plugin-worker-host.ts`)

### ❌ Shared Mutable State Across Modules

**What happens:** Exporting a mutable map/array from a module, mutating it from another module
**Why it's wrong:** Race conditions in concurrent requests, unpredictable state in tests, violates encapsulation
**Do this instead:** Encapsulate state in a service (e.g., `EngineRegistry` for engines), expose methods not raw data

## Error Handling

**Strategy:** Structured exceptions with NestJS filters, engine-specific error translation

**Patterns:**
- **Domain exceptions:** Custom error classes (`EngineNotReadyError`, `SessionNotFoundException`) extend `HttpException` with proper status codes
- **Engine errors:** Adapters catch native library errors (wwjs, Baileys), translate to domain exceptions in `src/engine/adapters/*`
- **Global filter:** NestJS default exception filter catches unhandled errors, returns structured JSON (`{ statusCode, message, error }`)
- **Graceful degradation:** Optional modules (QueueModule, MCPModule, SearchModule) fail gracefully if dependencies (Redis) unavailable
- **Webhook delivery:** Exponential backoff retry (3 attempts default), failure logged to `webhook_delivery_failures` table

## Cross-Cutting Concerns

**Logging:** Structured logger (`LoggerService` in `src/common/services/logger.service.ts`) with JSON/pretty output, per-module logger instances via `createLogger(context)`, log level configured via `LOG_LEVEL` env var

**Validation:** Global validation pipe (`applyGlobalValidation` in `src/config/app-validation.ts`) with class-validator decorators on DTOs, automatic 400 responses on invalid input

**Authentication:** API key-based auth with `ApiKeyGuard` (`src/modules/auth/guards/api-key.guard.ts`), role-based access (`@RequireRole(ApiKeyRole.OPERATOR)`), session-scoped keys (`@SessionScoped()`)

**Rate Limiting:** Throttler module with Redis storage for cross-replica limits when `REDIS_ENABLED=true`, three tiers (short/medium/long TTL)

**Metrics:** Prometheus metrics exposed at `/api/metrics`, custom metrics via `MetricsService` (`src/modules/metrics/metrics.service.ts`)

**Audit Trail:** All API mutations logged to `audit_logs` table via `AuditService` (`src/modules/audit/audit.service.ts`), includes actor (API key), action, metadata

---

*Architecture analysis: 2026-08-26*
