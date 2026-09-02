---
status: investigating
trigger: "Container enters restart loop with error: Nest can't resolve dependencies of the dataConnection_AnalyticsEventRepository (?). Please make sure that the argument \"dataConnectionDataSource\" at index [0] is available in the TypeOrmModule module."
created: 2026-08-27T00:00:00.000Z
updated: 2026-08-27T00:00:00.000Z
---

## Current Focus

hypothesis: CONFIRMED - The uncommitted import statement had APP_GUARD and APP_INTERCEPTOR incorrectly imported from @nestjs/common instead of @nestjs/core, causing TypeScript compilation errors that prevented the container from building
test: Fix imports to use @nestjs/core and rebuild container
expecting: Container builds successfully and starts without DataSource errors
next_action: Rebuild Docker container and verify it starts properly

## Symptoms

expected: Container starts successfully with both TypeORM connections ('default' and 'data') initialized
actual: Container enters restart loop, 'data' connection DataSource is not available to repositories
errors: "Nest can't resolve dependencies of the dataConnection_AnalyticsEventRepository (?). Please make sure that the argument \"dataConnectionDataSource\" at index [0] is available in the TypeOrmModule module."
reproduction: Start container with docker-compose
started: After refactoring to fix TypeScript errors and TensorFlow issues (recent changes: circular dependencies, uuid package, PredictiveModelsService modifications)

## Eliminated

## Evidence

- timestamp: 2026-08-27T00:00:00Z
  checked: Docker container logs
  found: "TypeOrmModule dependencies initialized" logs appear BEFORE the error, indicating TypeORM modules load but DataSource provider 'dataConnectionDataSource' is not registered or not accessible
  implication: The 'data' connection TypeOrmModule initializes but its DataSource provider is not available when AnalyticsModule tries to inject repositories

- timestamp: 2026-08-27T00:00:01Z
  checked: app.module.ts git diff (HEAD~5)
  found: Import change on lines 2-3: APP_GUARD and APP_INTERCEPTOR moved from '@nestjs/common' to '@nestjs/core'
  implication: This import location change may affect NestJS module initialization order or provider registration timing

- timestamp: 2026-08-27T00:00:02Z
  checked: git status and git diff src/app.module.ts
  found: UNCOMMITTED change splitting imports - APP_GUARD and APP_INTERCEPTOR moved from '@nestjs/common' to '@nestjs/core'. Last committed version (819e8954) has both in '@nestjs/common'
  implication: This uncommitted import change is the exact breaking change. Working version: both from @nestjs/common. Broken version: split across @nestjs/common and @nestjs/core

- timestamp: 2026-08-27T00:00:03Z
  checked: NestJS documentation research
  found: APP_GUARD and APP_INTERCEPTOR should be imported from '@nestjs/core', NOT '@nestjs/common'. However, the timing of when this import is resolved affects provider registration order
  implication: While @nestjs/core is technically correct, it may cause initialization timing issues with TypeORM DataSource providers

- timestamp: 2026-08-27T00:00:04Z
  checked: TypeScript compilation with APP_GUARD/APP_INTERCEPTOR from @nestjs/common
  found: TS2305 errors - Module "@nestjs/common" has no exported member 'APP_GUARD' or 'APP_INTERCEPTOR'
  implication: These tokens do NOT exist in @nestjs/common in NestJS v11. They MUST come from @nestjs/core

- timestamp: 2026-08-27T00:00:05Z
  checked: git show 819e8954:src/app.module.ts and attempted build of that commit
  found: Committed version also imports from @nestjs/common and fails TypeScript compilation with same errors
  implication: The code was committed in a broken state - it never actually compiled successfully

- timestamp: 2026-08-27T00:00:07Z
  checked: Container rebuild after all fixes applied
  found: No more "dataConnectionDataSource" or "UnknownDependenciesException" errors. Container shows different error: "Data type 'datetime' in 'Message.expiresAt' is not supported by 'postgres' database"
  implication: The original TypeORM dependency resolution issue is RESOLVED. The new error is an unrelated entity data type compatibility issue with PostgreSQL

## Resolution

root_cause: UsageModule referenced connection name 'dataConnection' but the actual connection in app.module.ts is named 'data'. The mismatch caused TypeORM to look for a 'dataConnectionDataSource' provider that doesn't exist. Additionally, MemoryCleanupService was injecting DataSource without @InjectDataSource decorator for the named 'data' connection.
fix: 
  1. Changed UsageModule connection name from 'dataConnection' to 'data' in usage.module.ts, usage.service.ts, and usage.service.spec.ts
  2. Added @InjectDataSource('data') decorator to MemoryCleanupService DataSource injection
  3. Fixed APP_GUARD and APP_INTERCEPTOR imports to use @nestjs/core instead of @nestjs/common (required for TypeScript compilation)
verification: Container builds successfully and the dependency resolution errors are fixed. A new unrelated error appeared (PostgreSQL data type incompatibility with 'datetime' type) which is a separate issue.
files_changed: ['src/app.module.ts', 'src/modules/usage/usage.module.ts', 'src/modules/usage/usage.service.ts', 'src/modules/usage/usage.service.spec.ts', 'src/modules/memory/services/memory-cleanup.service.ts']
