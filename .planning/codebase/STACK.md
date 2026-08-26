# Technology Stack

**Analysis Date:** 2026-08-26

## Languages

**Primary:**
- TypeScript 6.0.3 - Backend API, dashboard, SDKs (JavaScript/TypeScript)
- JavaScript (Node.js) - Runtime and build scripts

**Secondary:**
- Python 3.9+ - Database test suite (`database/tests/`), Python SDK (`sdk/python/`)
- Go 1.22+ - Go SDK (`sdk/go/`)
- PHP 8.1+ - PHP SDK (`sdk/php/`)
- Java 17+ - Java SDK (`sdk/java/`)

## Runtime

**Environment:**
- Node.js 22.13+ (pinned via `.nvmrc`: `22`)

**Package Manager:**
- npm (lockfile: `package-lock.json` expected)
- Backend uses npm scripts for build/dev/test orchestration

**Container Runtime:**
- Docker (multi-stage builds)
- Docker Compose for orchestration (profiles: `postgres`, `redis`, `minio`, `full`)

## Frameworks

**Core:**
- NestJS 11.1.29 - Backend API framework (modular architecture)
- React 19.2.8 - Dashboard UI (`dashboard/`)
- Express (via `@nestjs/platform-express`) - HTTP server

**Testing:**
- Jest 30.4.2 - Unit/integration testing (backend)
- Node.js built-in test runner - Dashboard tests (`dashboard/`)
- Supertest 7.0.0 - HTTP endpoint testing

**Build/Dev:**
- Vite 8.2.1 - Dashboard bundler and dev server
- TypeScript Compiler (tsc) 6.0.3 - Build toolchain
- Nest CLI 11.0.24 - Backend build and scaffolding
- ESLint 10.8.1 - Linting (shared config across backend/dashboard)
- Prettier 3.9.6 - Code formatting

## Key Dependencies

**Critical:**
- `whatsapp-web.js` 1.34.7 - WhatsApp Web client (Chromium-based, Puppeteer)
- `@whiskeysockets/baileys` 7.0.0-rc14 - Alternative WhatsApp client (WebSocket-based)
- `typeorm` 1.1.0 - Database ORM (PostgreSQL, SQLite)
- `bullmq` 6.1.1 - Job queue (webhook delivery, ingress processing)
- `ioredis` 6.0.0 - Redis client (queue backend, WebSocket adapter)
- `socket.io` 4.8.3 / `@socket.io/redis-adapter` 8.3.0 - Real-time WebSocket events
- `@modelcontextprotocol/sdk` 1.30.0 - Model Context Protocol integration

**Infrastructure:**
- `pg` 8.23.0 - PostgreSQL driver
- `better-sqlite3` 13.0.3 - SQLite driver (local storage option)
- `@aws-sdk/client-s3` 3.1110.0 - S3-compatible storage (MinIO or AWS)
- `dockerode` 5.0.1 - Docker API client (built-in datastore orchestration)
- `helmet` 8.3.0 - Security headers middleware
- `@nestjs/throttler` 6.5.0 - Rate limiting
- `zod` 4.4.3 - Runtime validation and schema parsing

**SDK Clients (Multi-language):**
- JavaScript/TypeScript: `@rmyndharis/openwa` (httpx, fetch-based)
- Python: `rmyndharis-openwa` (httpx 0.25+)
- Go: `github.com/rmyndharis/OpenWA/sdk/go` (Go 1.22+)
- PHP: `rmyndharis/openwa` (Guzzle 7.9+)
- Java: `com.rmyndharis:openwa` (Gson 2.11, Java 17+)

**Dashboard:**
- `@tanstack/react-query` 5.101.4 - Data fetching and caching
- `react-router-dom` 7.18.2 - Client-side routing
- `i18next` 26.3.6 / `react-i18next` 17.0.11 - Internationalization
- `socket.io-client` 4.8.3 - Real-time event subscription
- `recharts` 3.10.1 - Data visualization
- `lucide-react` 1.31.0 - Icon library

## Configuration

**Environment:**
- `.env` file loaded at runtime (precedence: host `.env` → `data/.env.generated` → defaults)
- Dashboard can toggle infrastructure via `data/.env.generated` (dynamic datastore selection)
- Blank environment variables forwarded to container allow dashboard overrides
- Production boot guard rejects weak/placeholder secrets (`API_MASTER_KEY`, `DATABASE_PASSWORD`, `S3_*`)

**Build:**
- `tsconfig.json` - Backend TypeScript config (module: nodenext, target: ES2023, strict mode)
- `dashboard/tsconfig.json` - Dashboard TypeScript config
- `vite.config.ts` - Dashboard build config
- `eslint.config.mjs` / `dashboard/eslint.config.js` - Linting rules
- `.prettierrc` - Code formatting rules
- `jest` config embedded in `package.json`

**Container:**
- `Dockerfile` - Multi-stage build (builder stage platform-pinned, production stage multi-arch)
- `docker-compose.yml` - Orchestration with profiles (`postgres`, `redis`, `minio`, `full`)
- `docker-compose.prod.yml` - Production-specific overrides
- Security: `no-new-privileges`, `cap_drop: ALL`, read-only rootfs, tmpfs for `/tmp`

## Platform Requirements

**Development:**
- Node.js 22.13+
- Docker & Docker Compose (BuildKit enabled)
- 4GB RAM minimum
- 20GB disk space

**Production:**
- Docker-compatible host (Linux preferred)
- 8GB RAM recommended (Chromium per session is memory-intensive)
- 4 vCPU recommended
- 50GB SSD storage
- `OPENWA_PIDS_LIMIT=2048` (default) - Container PID ceiling for Chromium multi-process model
- `OPENWA_MEM_LIMIT=2g` (default) - Container memory limit (tune for concurrent sessions)

**Deployment Targets:**
- Self-hosted VPS (Ubuntu 22.04+ recommended)
- Docker Swarm / Kubernetes (Helm chart: `charts/openwa/`)
- Multi-replica support via session ownership (Redis-based lease + routing)

---

*Stack analysis: 2026-08-26*
