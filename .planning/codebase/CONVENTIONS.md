# Coding Conventions

**Analysis Date:** 2026-08-26

## Naming Patterns

**Files:**
- Controllers: `*.controller.ts` (e.g., `webhook.controller.ts`)
- Services: `*.service.ts` (e.g., `auth.service.ts`)
- DTOs: `*.dto.ts` (e.g., `create-webhook.dto.ts`)
- Entities: `*.entity.ts` (e.g., `api-key.entity.ts`)
- Spec tests: `*.spec.ts` (e.g., `changelog-sections.spec.ts`)
- E2E tests: `*.e2e-spec.ts` (e.g., `app.e2e-spec.ts`)
- JavaScript specs: `*.spec.js` (e.g., `postinstall.spec.js`)
- Config files: `*.config.ts` or `*.config.mjs` (e.g., `vitest.config.ts`, `eslint.config.mjs`)

**Functions:**
- camelCase for functions and methods
- Descriptive names: `resolveSeedApiKey()`, `bannerKeyLine()`, `applyGlobalValidation()`
- Helper functions exported at module level when reusable

**Variables:**
- camelCase for local variables and properties
- UPPER_SNAKE_CASE for constants: `VECTOR_SEARCH_TARGET_MS`, `MAX_CONDITIONS`, `WEBHOOK_EVENTS`
- Descriptive names: `displayKey`, `isNewKey`, `connection_pool`

**Types:**
- PascalCase for classes, interfaces, types, and enums
- DTO classes end with `Dto`: `CreateWebhookDto`, `UpdateWebhookDto`, `WebhookResponseDto`
- Entity classes end with `Entity` (implicit): `ApiKey`, `Webhook`, `Session`
- Enum values: UPPER_SNAKE_CASE for enum members: `ApiKeyRole.ADMIN`, `ApiKeyRole.OPERATOR`
- Interface prefix `I` for engine abstractions: `IWhatsAppEngine`

## Code Style

**Formatting:**
- Tool: Prettier 3.9.6
- Config: `.prettierrc` at project root
- Key settings:
  - `singleQuote: true`
  - `trailingComma: 'all'`
  - `printWidth: 120`
  - `tabWidth: 2`
  - `useTabs: false`
  - `semi: true`
  - `bracketSpacing: true`
  - `arrowParens: 'avoid'`
  - `endOfLine: 'auto'`
- Format command: `npm run format`
- Check command: `npm run format:check`

**Linting:**
- Tool: ESLint 10.8.1 with TypeScript ESLint
- Config: `eslint.config.mjs` (flat config)
- Extends: `@eslint/js`, `typescript-eslint/recommendedTypeChecked`, `eslint-plugin-prettier/recommended`
- Lint command: `npm run lint`
- Fix command: `npm run lint:fix`
- Language: Node.js + Jest globals, CommonJS source type

## Import Organization

**Order:**
1. External framework imports (`@nestjs/common`, `@nestjs/core`)
2. External library imports (`typeorm`, `crypto`, `express`)
3. Internal common/shared imports (`../../common/utils/*`, `../../common/services/*`)
4. Internal module imports (`./entities/*`, `./dto/*`, `./*.service`)
5. Type-only imports use `type` keyword: `import type { QueryDeepPartialEntity } from 'typeorm'`

**Path Aliases:**
- No path aliases detected (`@/*` not configured)
- Relative imports used throughout: `../../common/`, `../auth/`

**Example from `webhook.controller.ts`:**
```typescript
import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { WebhookService } from './webhook.service';
import { CreateWebhookDto, UpdateWebhookDto, WebhookResponseDto, WebhookTestResponseDto } from './dto';
import { RequireRole } from '../auth/decorators/auth.decorators';
import { ApiKeyRole } from '../auth/entities/api-key.entity';
```

## Error Handling

**Patterns:**
- Use NestJS built-in exceptions: `NotFoundException`, `ConflictException`, `UnauthorizedException`
- Throw exceptions at service layer, not controllers
- Descriptive error messages with context

**Example from `auth.service.ts`:**
```typescript
throw new NotFoundException(`API key with id '${id}' not found`);
throw new ConflictException('Cannot remove the last active admin key');
throw new UnauthorizedException('Invalid API key');
throw new UnauthorizedException('API key is revoked');
throw new UnauthorizedException('API key has expired');
```

**Process-level error handling:**
- Global unhandled rejection handler in `main.ts`
- Uncaught exception monitor routes to logger
- Fatal errors exit process with non-zero code

## Logging

**Framework:** Custom `LoggerService` in `src/common/services/logger.service`

**Patterns:**
- Create logger per module: `private readonly logger = createLogger('AuthService')`
- Log levels: `debug`, `log`, `warn`, `error`
- Structured logging with context objects
- Environment-controlled verbosity: `LOG_LEVEL` env var
- Banner-style logs use box drawing characters for visual separation

**Example:**
```typescript
this.logger.log('🟢 Welcome to OpenWA - WhatsApp API Gateway');
this.logger.warn('Could not save API key file', { error: String(err) });
bootstrapLogger.warn('NODE_ENV is not set: running with development defaults');
```

## Comments

**When to Comment:**
- Complex business logic requiring explanation
- Architecture decisions and constraints (e.g., controller → service boundary)
- Security considerations (e.g., HMAC key length floors)
- Drift prevention (why a test exists)
- Non-obvious TypeScript/library quirks

**JSDoc/TSDoc:**
- Used for public APIs and exported functions
- Documents parameters, return types, and examples
- Inline comments preferred for implementation details

**Example:**
```typescript
/**
 * Resolves the API key to seed on first boot (when no keys exist yet).
 * Precedence: an explicit `API_MASTER_KEY` always wins; otherwise a
 * cryptographically random `owa_k1_` key is generated — the secure default,
 * including in non-production. The legacy fixed `dev-admin-key` is used only when
 * a developer explicitly opts in with `ALLOW_DEV_API_KEY=true`, never by default.
 */
export function resolveSeedApiKey(): string { ... }
```

## Function Design

**Size:**
- Extract reusable logic into named functions
- Bootstrap functions broken into phases with clear names
- Service methods focused on single capability

**Parameters:**
- Use DTOs for complex inputs
- TypeScript strict types enforced
- Optional parameters typed with `?:` or union with `undefined`

**Return Values:**
- Explicit return types on all functions
- Async functions return `Promise<T>`
- DTOs for structured responses: `WebhookResponseDto.fromEntity(entity)`
- `null` for explicit absence, `undefined` for optional properties

## Module Design

**Exports:**
- Index files re-export public API: `export * from './webhook.dto'`
- Entities, DTOs, services, and controllers exported from module folders
- Helper functions exported at module level when reusable

**Barrel Files:**
- Used in `dto/` folders to consolidate exports
- Pattern: `dto/index.ts` exports all DTOs from the folder

## Architecture Rules (ESLint)

**Controller Constraints:**
- Controllers MUST NOT call `.getEngine()` directly
- Controllers MUST NOT import `IWhatsAppEngine` type
- Controllers MUST NOT import `EngineRegistry`
- Enforced by custom ESLint rules in `eslint.config.mjs`

**Rationale:** Keep session guards, error mapping, and business rules behind service boundary

**Example ESLint rule:**
```javascript
{
  selector: "CallExpression[callee.property.name='getEngine']",
  message: 'Controllers must not call getEngine(). Add a method to the capability service (e.g. GroupService) and call that instead.',
}
```

## TypeScript Configuration

**Compiler Options:**
- TypeScript ~6.0.3
- Module: CommonJS (production), resolvePackageJsonExports: false (tests)
- Strict type checking enabled via `typescript-eslint/recommendedTypeChecked`
- Path mapping via `tsconfig-paths` for test resolution

**ESLint Type Rules:**
- `@typescript-eslint/no-explicit-any`: off
- `@typescript-eslint/no-floating-promises`: warn
- `@typescript-eslint/no-unsafe-argument`: warn

## Validation Patterns

**Class Validator:**
- Use decorators on DTO classes: `@IsString()`, `@IsUrl()`, `@IsOptional()`, `@Min()`, `@Max()`
- Custom validators for domain logic: `@IsValidWebhookFilters()`, `@IsHeaderMap()`
- Transform decorators: `@ToStrictBoolean()`, `@ToStrictNumber()`
- Conditional validation: `@ValidateIf((o) => o.secret !== '')`

**Example:**
```typescript
@IsUrl({ require_tld: false })
url!: string;

@IsOptional()
@IsInt()
@Min(0)
@Max(5)
retryCount?: number;
```

## Database Conventions

**ORM:** TypeORM with dual connections (`main` database for API keys/audit, `data` database for sessions)

**Entities:**
- Use decorators: `@Entity()`, `@Column()`, `@PrimaryGeneratedColumn('uuid')`
- Column naming: camelCase in TypeScript, mapped to database via TypeORM
- Timestamps: `@CreateDateColumn()`, `@UpdateDateColumn()`
- Indexes: `@Index({ unique: true })` for unique constraints

**Example:**
```typescript
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  keyHash!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
```

---

*Convention analysis: 2026-08-26*
