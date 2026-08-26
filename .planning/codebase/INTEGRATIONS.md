# External Integrations

**Analysis Date:** 2026-08-26

## APIs & External Services

**WhatsApp (Primary Integration):**
- WhatsApp Web API - Multi-session gateway
  - Clients: `whatsapp-web.js` 1.34.7 (Chromium/Puppeteer-based), `@whiskeysockets/baileys` 7.0.0-rc14 (WebSocket-based)
  - Engine selection: `ENGINE_TYPE` env var (dashboard-configurable, defaults to `whatsapp-web.js`)
  - Session management: QR-based pairing, persistent auth profiles in `SESSION_DATA_PATH`
  - Version pinning: `WWEBJS_WEB_VERSION` (auto-resolve from wppconnect-team/wa-version registry or pin specific build)

**Model Context Protocol (MCP):**
- `@modelcontextprotocol/sdk` 1.30.0 - Agent tools integration
  - Mount: `/mcp` endpoint (SSE transport)
  - Auth: Per-session API key (`X-API-Key` header)
  - Rate limiting: Per-key and per-IP limits (`MCP_RATE_LIMIT_*` env vars)
  - Tool registry: `ToolRegistryService` (`src/core/agent-tools/`)

**n8n (Workflow Automation):**
- Integration via webhooks and HTTP nodes
  - OpenWA n8n plugin installed (see `package.json` observation: "OpenWA n8n Plugin Installation Completed Successfully")
  - Contract: `media` field always present in events (may carry `omitted` marker)
  - Documented in `docs/WORKFLOWS.md`

## Data Storage

**Databases:**
- PostgreSQL 16 with pgvector extension
  - Connection: `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`
  - Client: TypeORM 1.1.0 (data-owned entities: session/webhook/message/template/engine)
  - Driver: `pg` 8.23.0
  - Schema: `POSTGRES_SCHEMA` (defaults to `public`, init script creates if non-public)
  - Migrations: `src/database/migrations/` (TypeORM CLI: `npm run migration:*`)
  - Built-in orchestration: `docker-proxy` → `openwa-postgres` (profile: `postgres` or `full`)

- SQLite 3 (alternative)
  - Connection: File-based (`openwa.sqlite` in `data/`)
  - Client: TypeORM + `better-sqlite3` 13.0.3
  - File permissions: 0600/0700 enforced (`src/database/sqlite-file-permissions.ts`)
  - Default for first-run when no database configured

- Redis 7
  - Connection: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (optional), `REDIS_DB`
  - Client: `ioredis` 6.0.0
  - Use cases: BullMQ job queue backend, Socket.IO Redis adapter (multi-replica WebSocket fan-out)
  - Built-in orchestration: `openwa-redis` (profile: `redis` or `full`)

**File Storage:**
- Local filesystem
  - Path: `STORAGE_LOCAL_PATH` (defaults to `./data/storage`)
  - Use: Session profiles, chat media archive (opt-in)

- S3-compatible storage
  - Provider: MinIO (built-in) or AWS S3
  - Endpoint: `S3_ENDPOINT` (blank = AWS regional, `http://minio:9000` = built-in MinIO)
  - Credentials: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (canonical), fallback to legacy `S3_ACCESS_KEY`/`S3_SECRET_KEY`
  - Bucket: `S3_BUCKET`, Region: `S3_REGION`
  - Client: `@aws-sdk/client-s3` 3.1110.0
  - Built-in MinIO: `openwa-minio` (profile: `minio` or `full`, console: `:9001`)

**Caching:**
- Redis (same instance as queue backend)
- Context memory for LLM conversations (documented in README: "Context Memory - Redis para histórico de conversas")

## Authentication & Identity

**Auth Provider:**
- Custom (built-in)
  - Implementation: `AuthService` (`src/modules/auth/`)
  - API Master Key: `API_MASTER_KEY` (global admin access)
  - Per-session keys: Generated on session creation, scoped to session operations
  - Header: `X-API-Key` or `Authorization: Bearer <key>`
  - MCP-specific: Separate rate limiting and audit trail

**Session Ownership (Multi-node):**
- Redis-based lease mechanism
  - Node identity: `NODE_ID` (defaults to container hostname, MUST be stable across restarts)
  - Node URL: `NODE_URL` (for cross-node session routing)
  - Lease TTL: `SESSION_LEASE_TTL_MS` (default: configurable)
  - Heartbeat: `SESSION_LEASE_HEARTBEAT_MS`
  - Takeover sweep: `SESSION_TAKEOVER_SWEEP_MS`
  - Proxy timeout: `SESSION_PROXY_TIMEOUT_MS`

## Monitoring & Observability

**Error Tracking:**
- Not configured (no Sentry/Rollbar/Bugsnag detected)

**Logs:**
- Structured JSON logging (NestJS built-in Logger)
- Level: `LOG_LEVEL` env var (defaults to `info`)
- Production recommendation: Prometheus + Grafana + Loki (mentioned in README)

**Metrics:**
- Bull Board: Queue dashboard mounted on API (route: configurable)
  - UI: `@bull-board/express` 8.6.1
  - Integration: `@bull-board/nestjs` 8.6.1
  - Coverage test: `src/modules/queue/bull-board-mount-coverage.spec.ts`

**Health Checks:**
- Endpoint: `/api/health/ready`
- Docker healthcheck: HTTP 200 check every 30s
- Dependencies: Postgres, Redis (both `required: false` - graceful degradation)

## CI/CD & Deployment

**Hosting:**
- Self-hosted (Docker Compose recommended)
- Kubernetes-ready (Helm chart: `charts/openwa/`)

**CI Pipeline:**
- GitHub Actions (`.github/` directory present)
- Test suites: `npm run test`, `npm run test:scripts`, `npm run test:docs`
- Linting: `npm run lint`, `npm run format:check`
- Contract checks: `npm run check:*` (versions, audit, SDK coverage, OpenAPI drift)

**Container Registry:**
- Multi-arch build: `linux/amd64`, `linux/arm64` (via BuildKit)
- Base image: `node:22-slim` (digest-pinned: `sha256:d649c27...`)

## Environment Configuration

**Required env vars (production):**
- `API_MASTER_KEY` - Global admin API key (production boot guard enforces non-weak)
- `DATABASE_TYPE` - `postgres` or `sqlite`
- `DATABASE_PASSWORD` - If using Postgres (boot guard enforces non-empty)
- `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` - If using S3 storage (boot guard enforces non-weak for external S3)

**Optional env vars (blanks forwarded for dashboard overrides):**
- `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USERNAME`, `DATABASE_NAME`, `POSTGRES_SCHEMA`
- `ENGINE_TYPE`, `SESSION_DATA_PATH`, `PUPPETEER_HEADLESS`, `PUPPETEER_ARGS`
- `STORAGE_TYPE`, `STORAGE_LOCAL_PATH`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- `AUTO_START_SESSIONS` - Opt-in: "true" to restart authenticated sessions at boot
- `CHAT_MEDIA_ARCHIVE_ENABLED` - Opt-in: archive chat media to storage
- `SEND_PACING_ENABLED` - Opt-in: anti-ban governor for outbound messages

**Secrets location:**
- Host `.env` (top precedence, never committed)
- `data/.env.generated` (dashboard-managed, runtime-generated)
- Docker secrets (supported via Docker Compose secrets mount)

## Webhooks & Callbacks

**Incoming:**
- Integration Fabric: `@Public` provider-webhook ingress (`src/modules/integration/`)
  - Fast-ack pipeline (immediate 202 Accepted, async processing)
  - Use case: External systems trigger OpenWA actions

**Outgoing:**
- Webhook delivery queue (BullMQ)
  - Queue: `webhook-queue` (`src/modules/queue/queue-names.ts`)
  - Worker: `WebhookProcessor` (keyed async lock per conversation to preserve order)
  - Concurrency: Configurable (`WEBHOOK_WORKER_CONCURRENCY`)
  - Retry: BullMQ exponential backoff
  - Entity: `Webhook` (`src/modules/webhook/**/*.entity.ts`)
  - Use case: Real-time event notifications to external systems (n8n, custom webhooks)

**WebSocket (Real-time Events):**
- Mount: `/socket.io` (Socket.IO 4.8.3)
- Transport: WebSocket with fallback to long-polling
- Redis adapter: Cross-replica broadcast (`@socket.io/redis-adapter` 8.3.0)
- Rate limiting: Per-connection limits (`WEBSOCKET_RATE_LIMIT_*`)
- Module: `EventsModule` (`src/modules/events/` implied by `app.module.ts`)

## Docker Socket Access (Infrastructure Orchestration)

**Docker Socket Proxy:**
- Image: `tecnativa/docker-socket-proxy:v0.4.2`
- Purpose: Sole container with `/var/run/docker.sock` access (principle of least privilege)
- Network: `internal-docker` (isolated, only reachable by `openwa-api`)
- Allowed operations: `PING`, `INFO`, `CONTAINERS`, `IMAGES`, `VOLUMES`, `POST`
- Use case: Dashboard toggles for built-in Postgres/Redis/MinIO orchestration
- Client: `dockerode` 5.0.1 (`src/modules/docker/docker.service.ts`)

**Security Notes:**
- `DELETE` not explicitly enabled (POST side effect, accepted limitation - see SECURITY.md)
- Compromise risk: API container could create host bind-mount containers if exploited
- Mitigation: Disable proxy entirely if not using built-in datastores (override: `profiles: ['disabled']`)

---

*Integration audit: 2026-08-26*
