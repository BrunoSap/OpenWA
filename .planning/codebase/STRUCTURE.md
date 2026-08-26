# Codebase Structure

**Analysis Date:** 2026-08-26

## Directory Layout

```
openwa/
├── src/                    # Backend source (NestJS + TypeScript)
│   ├── main.ts            # Application entry point
│   ├── app.module.ts      # Root module
│   ├── configure-app.ts   # HTTP middleware configuration
│   ├── modules/           # Feature modules (REST APIs)
│   ├── engine/            # WhatsApp engine abstraction + adapters
│   ├── core/              # Plugin system, hooks, agent tools
│   ├── common/            # Shared utilities, guards, services
│   ├── config/            # Configuration, validation, env loading
│   └── database/          # Database setup, migrations, boot logic
├── dashboard/             # Frontend SPA (React + Vite)
│   ├── src/
│   │   ├── pages/        # Route components
│   │   ├── components/   # Reusable UI components
│   │   ├── hooks/        # Custom React hooks
│   │   └── services/     # API client
│   └── dist/             # Bundled output (served by backend)
├── database/              # SQL migrations + test scripts (Postgres)
│   ├── migrations/       # DDL/DML for data schemas (knowledge, intake, telegram)
│   ├── tests/            # Validation + performance tests (Python)
│   └── scripts/          # Migration runners
├── test/                  # E2E test suite
│   ├── __mocks__/        # Mock implementations
│   └── fixtures/         # Test data
├── data/                  # Runtime data (SQLite DBs, media, sessions)
│   ├── plugins/          # Installed plugin packages
│   ├── sessions/         # WhatsApp session profiles (Chromium/Baileys)
│   └── media/            # Uploaded/received media files
├── config/                # External service configs (nginx, redis, postgres)
├── sdk/                   # Client SDKs (Go, Python, Java, PHP, JavaScript)
├── charts/                # Kubernetes Helm charts
├── scripts/               # Utility scripts (OpenAPI export, etc.)
├── docs/                  # Documentation (consolidated guides)
├── .planning/             # Codebase analysis, onboarding docs
├── .github/               # CI/CD workflows (GitHub Actions)
├── docker-compose*.yml    # Multi-profile Docker orchestration
├── Dockerfile             # Production container image
├── package.json           # Node.js dependencies + scripts
└── tsconfig.json          # TypeScript compiler config
```

## Directory Purposes

**`src/` - Backend Application:**
- Purpose: NestJS application source code, all server-side logic
- Contains: TypeScript modules, controllers, services, entities
- Key files: `main.ts` (bootstrap), `app.module.ts` (root module), `configure-app.ts` (middleware)

**`src/modules/` - Feature Modules:**
- Purpose: Domain-driven feature modules (sessions, messages, webhooks, auth, etc.)
- Contains: Each subdirectory is a NestJS module with `*.module.ts`, `*.controller.ts`, `*.service.ts`, entities, DTOs
- Key subdirs: `session/`, `message/`, `webhook/`, `auth/`, `integration/`, `queue/`, `events/`

**`src/engine/` - WhatsApp Engine Layer:**
- Purpose: Abstraction over multiple WhatsApp client implementations
- Contains: `IWhatsAppEngine` interface, adapters (wwjs, Baileys), capability matrix, identity helpers
- Key files: `engine.factory.ts`, `engine-registry.service.ts`, `adapters/whatsapp-web-js.adapter.ts`, `adapters/baileys.adapter.ts`

**`src/core/` - Core Infrastructure:**
- Purpose: Cross-cutting systems (plugins, hooks, agent tools) used by all modules
- Contains: Plugin runtime with sandboxed workers, hook manager, tool registry
- Key subdirs: `plugins/`, `hooks/`, `agent-tools/`

**`src/common/` - Shared Utilities:**
- Purpose: Reusable code (guards, middleware, errors, utils) with no domain logic
- Contains: Guards, interceptors, error classes, logger, storage, cache services
- Key subdirs: `security/`, `services/`, `errors/`, `utils/`, `cache/`, `storage/`

**`src/config/` - Configuration:**
- Purpose: Environment loading, validation, bootstrap checks, Swagger setup
- Contains: Configuration schema (`configuration.ts`), env validation (`env.validation.ts`), security checks (`bootstrap-security.ts`)
- Key files: `load-env.ts` (must be first import), `swagger.config.ts`, `http-timeouts.ts`

**`src/database/` - Database Setup:**
- Purpose: TypeORM DataSource configuration, migration management, boot logic
- Contains: DataSource factories (main/data), PostgreSQL boot migrations with advisory locks, SQLite permission hardening
- Key files: `data-source.ts`, `data-source-main.ts`, `pg-boot-migrations.ts`, `sqlite-file-permissions.ts`

**`dashboard/` - Frontend SPA:**
- Purpose: React-based admin dashboard for managing sessions, messages, webhooks, plugins
- Contains: Vite bundled SPA, pages per route, shared components, API client hooks
- Key subdirs: `src/pages/`, `src/components/`, `src/hooks/`, `src/services/`

**`database/` - SQL Migrations (Postgres Extensions):**
- Purpose: Schema migrations for additional Postgres schemas (knowledge base, intake staging, telegram)
- Contains: DDL for pgvector extension, helper functions (CPF validation, cleanup), seed data
- Key files: `migrations/000_migration_system.sql`, `migrations/002_create_schema_knowledge.sql`

**`data/` - Runtime Data:**
- Purpose: Persistent application data (SQLite databases, media files, session profiles)
- Contains: `main.sqlite` (auth/audit), `openwa.sqlite` (user data), `sessions/` (Chromium profiles), `media/` (uploaded files), `plugins/` (installed packages)
- Generated: Yes (created at runtime)
- Committed: No (excluded via `.gitignore`)

**`test/` - E2E Test Suite:**
- Purpose: End-to-end integration tests (Vitest + Supertest)
- Contains: Test specs for all API endpoints, mocks for external dependencies, fixtures
- Key subdirs: `__mocks__/`, `fixtures/`

**`sdk/` - Client SDKs:**
- Purpose: Generated client libraries for consuming the OpenWA API
- Contains: Go, Python, Java, PHP, JavaScript SDK packages
- Generated: Yes (from OpenAPI spec via `scripts/export-openapi.ts`)

## Key File Locations

**Entry Points:**
- `src/main.ts`: HTTP server bootstrap, graceful shutdown, Swagger setup
- `dashboard/src/main.tsx`: React app entry (mounts to `#root`)
- `docker-compose.yml`: Multi-service orchestration (API, Redis, Postgres, n8n)

**Configuration:**
- `.env`: Environment variables (DATABASE_TYPE, REDIS_ENABLED, API_MASTER_KEY, etc.)
- `src/config/configuration.ts`: Typed configuration schema loaded into NestJS ConfigService
- `tsconfig.json`: TypeScript compiler options (strict mode, decorator metadata, ES2022 target)
- `package.json`: Dependencies, scripts (`npm run dev`run build`, `npm test`)

**Core Logic:**
- `src/app.module.ts`: Root module wiring all feature modules
- `src/engine/engine.factory.ts`: Creates WhatsApp engine instances (wwjs or Baileys)
- `src/modules/session/session.service.ts`: Session lifecycle (create, start, stop, terminate, delete)
- `src/modules/message/message.service.ts`: Send/receive messages, template expansion, batch sends
- `src/modules/webhook/webhook-outbox.service.ts`: Reliable async webhook delivery with outbox pattern
- `src/core/plugins/plugin-loader.service.ts`: Plugin discovery, sandboxed worker execution

**Database:**
- `src/database/data-source.ts`: TypeORM DataSource for user data (sessions, messages, webhooks)
- `src/database/data-source-main.ts`: TypeORM DataSource for auth/audit (API keys, audit logs)
- `database/migrations/*.sql`: Postgres extension migrations (pgvector, knowledge base, intake staging)

**Testing:**
- `test/**/*.spec.ts`: E2E API tests
- `src/**/*.spec.ts`: Unit/integration tests co-located with source
- `database/tests/*.py`: Database validation + performance tests (Python)

## Naming Conventions

**Files:**
- Controllers: `*.controller.ts` (e.g., `session.controller.ts`)
- Services: `*.service.ts` (e.g., `webhook-delivery.service.ts`)
- Entities: `*.entity.ts` (e.g., `session.entity.ts`)
- DTOs: `*.dto.ts` (e.g., `create-session.dto.ts`)
- Modules: `*.module.ts` (e.g., `webhook.module.ts`)
- Specs: `*.spec.ts` (e.g., `engine.factory.spec.ts`)
- Guards: `*.guard.ts` (e.g., `api-key.guard.ts`)
- Interceptors: `*.interceptor.ts` (e.g., `request-metrics.interceptor.ts`)
- Middleware: `*.middleware.ts` (e.g., `request-context.middleware.ts`)

**Directories:**
- Kebab-case: `session-engine-lifecycle.service.ts`, `webhook-delivery/`
- Singular for modules: `session/`, `message/`, `webhook/` (not `sessions/`, `messages/`)
- Plural for collections: `migrations/`, `scripts/`, `utils/`

**Functions:**
- camelCase: `createEngine()`, `sendMessage()`, `isActive()`

**Variables:**
- camelCase: `sessionId`, `engineType`, `webhookUrl`

**Constants:**
- UPPER_SNAKE_CASE: `DEFAULT_PLUGINS_DIR`, `SANDBOX_MAX_OLD_GEN_MB`

**Types/Interfaces:**
- PascalCase: `IWhatsAppEngine`, `EngineCreateOptions`, `IncomingMessage`

**Classes:**
- PascalCase: `SessionService`, `EngineFactory`, `WhatsAppWebJsAdapter`

## Where to Add New Code

**New Feature (e.g., "Polls API"):**
- Primary code: `src/modules/poll/` (create new module directory)
  - `poll.module.ts` - NestJS module definition
  - `poll.controller.ts` - REST endpoints
  - `poll.service.ts` - Business logic
  - `entities/poll.entity.ts` - TypeORM entity
  - `dto/create-poll.dto.ts` - Request validation
- Tests: `src/modules/poll/*.spec.ts` (co-located unit tests)
- E2E tests: `test/poll.e2e.spec.ts`
- Register module: Import in `src/app.module.ts` imports array

**New Engine Capability (e.g., "Status Reactions"):**
- Interface: Add method to `IWhatsAppEngine` in `src/engine/interfaces/whatsapp-engine.interface.ts`
- Adapters: Implement in `src/engine/adapters/whatsapp-web-js.adapter.ts` and `baileys.adapter.ts`
- Capability: Update `engine-capability-matrix.ts` to declare support
- Service: Expose via `SessionService` or create dedicated module

**New Plugin:**
- Implementation: `data/plugins/<plugin-name>/` (runtime installation via REST API)
- Built-in plugin: `src/engine/builtin/<plugin-name>/` (register in `EngineFactory.registerBuiltInEngines()`)
- Manifest: `plugin.json` in plugin root with `id`, `name`, `version`, `type`, `main`

**New Utility/Helper:**
- Shared helpers: `src/common/utils/<util-name>.ts`
- Domain-specific helper: Within the relevant module (e.g., `src/modules/session/session-lifecycle-fences.ts`)

**New Middleware/Guard:**
- Security guard: `src/common/security/<guard-name>.guard.ts`
- Feature-specific guard: `src/modules/<module>/guards/<guard-name>.guard.ts`
- Interceptor: `src/common/interceptors/<interceptor-name>.interceptor.ts`
- Middleware: `src/common/middleware/<middleware-name>.middleware.ts`

**New Database Migration (TypeORM):**
- Main DB (auth/audit): `src/database/migrations-main/<timestamp>-<description>.ts`
- Data DB (sessions/messages): `src/database/migrations/<timestamp>-<description>.ts`
- Postgres extensions: `database/migrations/<number>_<description>.sql`

**New React Component (Dashboard):**
- Page component: `dashboard/src/pages/<PageName>.tsx`
- Shared component: `dashboard/src/components/<ComponentName>.tsx`
- Hook: `dashboard/src/hooks/use<HookName>.ts`
- Service: `dashboard/src/services/<service-name>.ts`

**New SDK:**
- Client SDK: `sdk/<language>/<sdk-files>` (generated from OpenAPI spec via `scripts/export-openapi.ts`)

**New Docker Service:**
- Service definition: Add to `docker-compose.yml` services section
- Profile isolation: Use `profiles: ['optional']` for opt-in services
- Network: Attach to `openwa-network` for inter-service communication

## Special Directories

**`.planning/` - Codebase Analysis:**
- Purpose: GSD system output (codebase maps, onboarding docs, intel)
- Generated: Yes (by `/gsd-map-codebase`, `/gsd-onboard`)
- Committed: Yes (tracked for team onboarding)

**`data/` - Runtime Data:**
- Purpose: All mutable application state (databases, media, sessions, plugins)
- Generated: Yes (created by application at runtime)
- Committed: No (`.gitignore`d, backed up separately)

**`.github/workflows/` - CI/CD:**
- Purpose: GitHub Actions workflow definitions (test, build, deploy, security scans)
- Generated: No (hand-written)
- Committed: Yes

**`node_modules/` - Dependencies:**
- Purpose: Installed npm packages (backend + dashboard)
- Generated: Yes (via `npm install`)
- Committed: No (`.gitignore`d, reproducible via `package-lock.json`)

**`dashboard/dist/` - Frontend Build:**
- Purpose: Bundled SPA served by backend when `SERVE_DASHBOARD=true`
- Generated: Yes (via `npm run build:dashboard`)
- Committed: No (built in Docker image, excluded from repo)

**`test/__mocks__/` - Test Mocks:**
- Purpose: Mock implementations of external dependencies (e.g., `@whiskeysockets/baileys`)
- Generated: No (hand-written)
- Committed: Yes

**`scripts/` - Utility Scripts:**
- Purpose: Developer/CI utilities (OpenAPI export, database checks, health probes)
- Generated: No (hand-written TypeScript/bash)
- Committed: Yes

**`config/` - External Service Configs:**
- Purpose: Configuration files for Redis, Postgres, nginx, Prometheus (mounted into containers)
- Generated: No (hand-written YAML/conf)
- Committed: Yes

**`charts/openwa/` - Helm Chart:**
- Purpose: Kubernetes deployment manifests (templates, values, CRDs)
- Generated: No (hand-written)
- Committed: Yes

## Import Path Patterns

**Module imports:**
```typescript
// NestJS framework
import { Injectable, Controller, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

// Cross-module dependencies (via barrel exports or direct paths)
import { SessionService } from '../session/session.service';
import { WebhookModule } from '../webhook/webhook.module';

// Engine layer
import { IWhatsAppEngine } from '../../engine/interfaces/whatsapp-engine.interface';
import { EngineRegistry } from '../../engine/engine-registry.service';

// Common utilities
import { createLogger } from '../../common/services/logger.service';
import { isSafeSessionName } from '../../common/utils/path-safety';

// Core infrastructure
import { PluginLoaderService } from '../../core/plugins';
import { HookManager } from '../../core/hooks';
```

**Relative imports for co-located files:**
```typescript
// Within same module
import { SessionEngineLifecycle } from './session-engine-lifecycle.service';
import { Session } from './entities/session.entity';
import { CreateSessionDto } from './dto/create-session.dto';
```

## Migration Strategy

**TypeORM Migrations (Application Schemas):**
1. Generate: `npm run typeorm:generate -- -n MigrationName` (auto-generates from entity changes)
2. Manual: Create in `src/database/migrations/<timestamp>-<description>.ts`
3. Apply: Automatic on boot when `migrationsRun: true` (production default)
4. Rollback: Not supported by TypeORM (manual SQL rollback or restore from backup)

**SQL Migrations (Postgres Extensions):**
1. Create: Add `database/migrations/<number>_<description>.sql`
2. Apply: Run `database/scripts/run_migrations_docker.sh` or `psql < migration.sql`
3. Rollback: Manual via `database/rollbacks/<number>_rollback_<description>.sql`
4. Schema: Targets extension schemas (`knowledge`, `intake_staging`, `telegram`), not core `public` schema

**Data Migration:**
1. Export: Use `InfraController` export endpoint (`GET /api/infra/export/database`)
2. Transform: Custom script in `scripts/migrate-<description>.ts`
3. Import: Use `InfraController` import endpoint (`POST /api/infra/import/database`)

---

*Structure analysis: 2026-08-26*
