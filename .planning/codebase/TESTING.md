# Testing Patterns

**Analysis Date:** 2026-08-26

## Test Framework

**Runner:**
- Jest 30.4.2 (unit/integration tests)
- Vitest (SDK JavaScript tests)
- Node.js `node:test` (script tests)

**Assertion Library:**
- Jest built-in matchers
- Node.js `assert/strict` (for script tests)

**Run Commands:**
```bash
npm test                    # Run all unit tests (src/**/*.spec.ts)
npm run test:scripts        # Run script tests (node:test)
npm run test:docs           # Run documentation validation tests
npm run test:watch          # Watch mode
npm run test:cov            # With coverage
npm run test:e2e            # E2E tests
npm run test:debug          # Debug mode
```

## Test File Organization

**Location:**
- **Co-located:** Unit tests live alongside source files in `src/`
- **Separate:** E2E tests in dedicated `test/` directory
- **SDK tests:** Separate in `sdk/javascript/test/`
- **Script tests:** Co-located with scripts in `scripts/`
- **Python tests:** In `database/tests/`

**Naming:**
- Unit tests: `*.spec.ts` (e.g., `changelog-sections.spec.ts`)
- E2E tests: `*.e2e-spec.ts` (e.g., `app.e2e-spec.ts`)
- Script tests: `*.spec.js` or `*.spec.mjs`
- SDK tests: `*.test.ts` (e.g., `client.test.ts`)

**Structure:**
```
src/
├── modules/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   ├── auth.service.spec.ts (if exists)
│   │   └── ...
├── database/
│   ├── docs-schema-accuracy.spec.ts
│   └── ...
test/
├── app.e2e-spec.ts
├── session-scope.e2e-spec.ts
└── ...
scripts/
├── postinstall.js
├── postinstall.spec.js
└── ...
```

## Test Structure

**Suite Organization (Jest):**
```typescript
describe('CHANGELOG release sections', () => {
  // Test suite for a specific feature or module
  
  it('gives every release at most one heading of each kind', () => {
    // Individual test case
    const blocks = releases();
    expect(blocks.size).toBeGreaterThan(10);
    expect(duplicated).toEqual([]);
  });
});
```

**Suite Organization (Vitest SDK tests):**
```typescript
import { describe, expect, it } from 'vitest';

describe('OpenWAClient', () => {
  it('requires baseUrl and apiKey', () => {
    expect(() => new OpenWAClient({ baseUrl: '', apiKey: 'x' })).toThrow();
    expect(() => new OpenWAClient({ baseUrl: 'http://x', apiKey: '' })).toThrow();
  });

  it('sends the API key as X-API-Key and JSON content type', async () => {
    const t = new MockTransport().on('GET', '/api/sessions', { body: [] });
    await client(t).sessions.list();
    expect(t.lastCall!.headers['x-api-key']).toBe('owa_k1_test');
  });
});
```

**Suite Organization (Node.js test):**
```javascript
const test = require('node:test');
const assert = require('node:assert/strict');

test('planSteps: empty root plans nothing', () => {
  assert.deepEqual(planSteps(makeRoot()), []);
});

test('run: nothing to do exits 0 and never spawns', () => {
  const { calls, spawn } = fakeSpawn([OK]);
  assert.equal(run(makeRoot(), spawn), 0);
  assert.equal(calls.length, 0);
});
```

**E2E Test Structure:**
```typescript
describe('App smoke (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Setup: create test module and initialize app
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();
  });

  afterAll(async () => {
    // Teardown: close app and clean up
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  it('GET /api/health is public and returns ok', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(res => {
        const body = res.body as { status?: string };
        if (body.status !== 'ok') throw new Error(`unexpected health body`);
      });
  });
});
```

**Patterns:**
- `describe()` blocks group related tests
- `beforeAll()`/`afterAll()` for suite-level setup/teardown
- `it()` or `test()` for individual test cases
- Async tests return promises or use `async/await`

## Mocking

**Framework:** Jest built-in mocks

**Patterns:**
```typescript
// Mock entire modules (ESM compatibility)
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

// Mock specific dependencies in tests
const t = new MockTransport().on('GET', '/api/sessions', { body: [] });
const client = new OpenWAClient({
  baseUrl: 'http://localhost:2785',
  apiKey: 'owa_k1_test',
  fetch: t.asFetch(),
});
```

**What to Mock:**
- External ESM modules that can't be loaded in CommonJS tests (`archiver`)
- HTTP fetch calls (via `MockTransport` helper)
- WhatsApp engine dependencies (`@whiskeysockets/baileys`)
- Proxy agents (`https-proxy-agent`, `socks-proxy-agent`)

**What NOT to Mock:**
- NestJS module system (use `Test.createTestingModule()` for real DI)
- Database entities (use in-memory SQLite for unit tests)
- Internal services (test real implementations)

**Mock Configuration (package.json):**
```json
"moduleNameMapper": {
  "^@whiskeysockets/baileys$": "<rootDir>/../test/__mocks__/@whiskeysockets/baileys.ts",
  "^archiver$": "<rootDir>/../test/__mocks__/archiver.ts",
  "^https-proxy-agent$": "<rootDir>/../test/__mocks__/https-proxy-agent.ts"
}
```

## Fixtures and Factories

**Test Data (Script tests):**
```javascript
/** Bare temp dir optionally holding a dashboard/ and/or the patch scripts. */
function makeRoot({
  dashboard = false,
  patcher = false,
  previewPatcher = false,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openwa-postinstall-'));
  if (dashboard) fs.mkdirSync(path.join(root, 'dashboard'));
  if (patcher) {
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.writeFileSync(path.join(root, 'scripts', 'patch-wwebjs-201832.js'), '// stub\n');
  }
  return root;
}
```

**Test Data (SDK tests):**
```typescript
function client(transport: MockTransport): OpenWAClient {
  return new OpenWAClient({
    baseUrl: 'http://localhost:2785',
    apiKey: 'owa_k1_test',
    fetch: transport.asFetch(),
  });
}
```

**Test Data (Python tests - AAA pattern):**
```python
def generate_embedding_batched(batch_size=1536):
    """
    Generate embedding with memory-efficient batching
    FIXED: No longer creates 10k+ 1536-dim arrays in tight loop
    """
    return np.random.rand(batch_size).astype(np.float32).tolist()

@contextmanager
def test_transaction(conn):
    """
    Context manager for test isolation via transactions.
    Automatically rolls back after test, preventing data pollution.
    """
    try:
        yield conn
    finally:
        conn.rollback()
```

**Location:**
- Helper functions co-located in test files
- Shared mocks in `test/__mocks__/` directory

## Coverage

**Requirements:**
- Target: 87% statements, 89% functions, 90% lines, 87% statements
- Configured in `package.json` under `jest.coverageThreshold`

**View Coverage:**
```bash
npm run test:cov
```

**Coverage Path Ignores:**
- `/node_modules/`
- Documentation validation tests (`.spec.ts` files that validate docs)
- Migration drift tests

**Coverage Configuration (package.json):**
```json
"coverageThreshold": {
  "global": {
    "branches": 87,
    "functions": 89,
    "lines": 90,
    "statements": 87
  }
}
```

## Test Types

**Unit Tests:**
- Scope: Individual functions, services, utilities
- Location: `src/**/*.spec.ts`
- Approach: Test single units in isolation with mocks
- Example: `changelog-sections.spec.ts`, `postinstall.spec.js`

**Integration Tests:**
- Scope: Multiple modules working together
- Location: `src/**/*.spec.ts` (mixed with unit tests)
- Approach: Use real NestJS DI, in-memory SQLite
- Example: Testing service + repository + entity together

**E2E Tests:**
- Scope: Full application with HTTP requests
- Location: `test/*.e2e-spec.ts`
- Framework: Jest with Supertest
- Config: `test/jest-e2e.json`
- Approach: Boot real app, make HTTP requests, assert responses
- Setup: `test/setup-e2e.ts`, teardown: `test/teardown-e2e.ts`
- Max workers: 1 (sequential execution to avoid port conflicts)

**Documentation Validation Tests:**
- Scope: Verify docs match implementation
- Pattern: Parse documentation files and compare against code
- Example: `docs-schema-accuracy.spec.ts` validates database schema docs
- Run separately: `npm run test:docs`

**Contract Tests:**
- Scope: Verify API schemas match implementation
- Example: OpenAPI spec validation, SDK route coverage
- Scripts: `check-sdk-routes.mjs`, `check-contract-shapes.mjs`

## Common Patterns

**Async Testing:**
```typescript
it('sends the API key as X-API-Key', async () => {
  const t = new MockTransport().on('GET', '/api/sessions', { body: [] });
  await client(t).sessions.list();
  expect(t.lastCall!.headers['x-api-key']).toBe('owa_k1_test');
});

// Or return promise directly
it('GET /api/health is public', () => {
  return request(app.getHttpServer())
    .get('/api/health')
    .expect(200);
});
```

**Error Testing:**
```typescript
it('requires baseUrl and apiKey', () => {
  expect(() => new OpenWAClient({ baseUrl: '', apiKey: 'x' })).toThrow();
  expect(() => new OpenWAClient({ baseUrl: 'http://x', apiKey: '' })).toThrow();
});

it('maps a 404 to OpenWANotFoundError', async () => {
  const t = new MockTransport().on('GET', '/api/sessions/missing', {
    status: 404,
    body: { statusCode: 404, message: 'Session not found', error: 'Not Found' },
  });
  await expect(client(t).sessions.get('missing')).rejects.toBeInstanceOf(OpenWANotFoundError);
  await expect(client(t).sessions.get('missing')).rejects.toMatchObject({ status: 404 });
});
```

**Type-safe Assertions:**
```typescript
it('GET /api/health returns ok', () => {
  return request(app.getHttpServer())
    .get('/api/health')
    .expect(200)
    .expect(res => {
      const body = res.body as { status?: string };
      if (body.status !== 'ok') throw new Error(`unexpected health body`);
    });
});
```

**Parameterized Tests:**
```typescript
it('maps each status code to its typed error subclass', async () => {
  const cases: Array<[number, new (...a: never[]) => OpenWAApiError]> = [
    [401, OpenWAAuthError],
    [403, OpenWAForbiddenError],
    [404, OpenWANotFoundError],
    [409, OpenWAConflictError],
    [429, OpenWARateLimitError],
    [501, OpenWANotImplementedError],
  ];
  for (const [status, cls] of cases) {
    const t = new MockTransport().on('GET', '/api/sessions', {
      status,
      body: { statusCode: status, message: 'x', error: 'E' },
    });
    await expect(client(t).sessions.list()).rejects.toBeInstanceOf(cls);
  }
});
```

**Python AAA Pattern (Arrange-Act-Assert):**
```python
def test_vector_search_performance():
    """Test 1: Vector search with proper AAA structure"""
    # Arrange
    conn = get_connection()
    with test_transaction(conn):
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        embedding = generate_embedding_batched()
        
        # Act
        result = measure_query(
            cursor,
            "SELECT * FROM vectors ORDER BY embedding <-> %s LIMIT 10",
            (embedding,)
        )
        
        # Assert
        assert result['avg_ms'] < VECTOR_SEARCH_TARGET_MS, \
            f"Vector search too slow: {result['avg_ms']}ms > {VECTOR_SEARCH_TARGET_MS}ms"
```

## Test Configuration

**Jest (Main Config - package.json):**
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": {
    "^.+\\.(t|j)s$": ["ts-jest", {
      "tsconfig": {
        "module": "CommonJS",
        "moduleResolution": "node",
        "resolvePackageJsonExports": false
      }
    }]
  },
  "testEnvironment": "node",
  "coverageDirectory": "../coverage"
}
```

**Jest E2E Config (test/jest-e2e.json):**
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "setupFiles": ["<rootDir>/setup-e2e.ts"],
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "maxWorkers": 1,
  "globalTeardown": "<rootDir>/teardown-e2e.ts"
}
```

**Vitest Config (sdk/javascript/vitest.config.ts):**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
  },
});
```

## Test Isolation

**Transaction-based (Python):**
- Use context managers to wrap tests in transactions
- Automatic rollback after test completes
- Prevents data pollution between tests

**In-memory Database (TypeScript):**
- SQLite in-memory (`:memory:`) for unit tests
- Fast, isolated, no cleanup needed
- TypeORM synchronize for schema creation

**Test Fixtures:**
- Create temporary directories for file system tests
- Clean up in teardown
- Use Node.js `fs.mkdtempSync()` for isolation

## Special Test Patterns

**Documentation Drift Prevention:**
```typescript
describe('docs/05 documents the real column names', () => {
  it('validates database schema docs match entities', async () => {
    const ds = new DataSource({ 
      type: 'better-sqlite3', 
      database: ':memory:', 
      entities: globs, 
      synchronize: true 
    });
    await ds.initialize();
    // Compare documented schema vs actual TypeORM metadata
  });
});
```

**Architecture Guard Tests:**
- ESLint rules enforced via tests
- Controllers cannot call engine directly
- Enforced at build time and CI

**Performance Tests (Python):**
```python
# Performance threshold constants (ms)
VECTOR_SEARCH_TARGET_MS = 100
COMPOUND_INDEX_TARGET_MS = 100
CLIENT_SUMMARY_TARGET_MS = 200

def measure_query(cursor, query, params=None, explain=True, iterations=5):
    """Execute query and measure performance"""
    # Warm up
    cursor.execute(query, params)
    cursor.fetchall()
    
    # Measure
    timings = []
    for _ in range(iterations):
        start = time.time()
        cursor.execute(query, params)
        cursor.fetchall()
        timings.append((time.time() - start) * 1000)
    
    return {
        'avg_ms': np.mean(timings),
        'p95_ms': np.percentile(timings, 95)
    }
```

---

*Testing analysis: 2026-08-26*
