---
phase: 05-long-term-memory
plan: 01
subsystem: memory
tags: [tracer, schema, migration, conversation-memory, persistence]
dependency_graph:
  requires: []
  provides: [conversation-memory-schema, memory-module, write-path-population]
  affects: [message-entity, message-service, data-connection-schema]
tech_stack:
  added: [ConversationMemoryService, MemoryModule]
  patterns: [soft-delete-via-decorator, composite-index-recall, daily-conversation-threading]
key_files:
  created:
    - src/database/migrations/1786400000000-AddConversationMemoryFields.ts
    - src/modules/memory/memory.module.ts
    - src/modules/memory/services/conversation-memory.service.ts
    - src/modules/memory/services/conversation-memory.service.spec.ts
    - test/memory-tracer.e2e-spec.ts
  modified:
    - src/modules/message/entities/message.entity.ts
    - src/modules/message/message.service.ts
    - src/app.module.ts
    - src/database/data-source.ts
decisions:
  - decision: "Use daily UTC date in conversationId (chatId:YYYY-MM-DD) for thread boundaries"
    rationale: "Simple, deterministic grouping aligned with RESEARCH Open Question 2; future plans can split/merge threads"
    alternatives: ["Message-count windows", "Inactivity-based sessions"]
  - decision: "userId from author ?? from (author for groups, from for 1:1)"
    rationale: "Stable sender identity — author distinguishes group participants, from covers 1:1 and outgoing echoes"
    alternatives: ["Always use from", "Separate group_author column"]
  - decision: "@DeleteDateColumn for soft-delete instead of manual deletedAt filtering"
    rationale: "TypeORM decorator auto-adds WHERE deletedAt IS NULL to find() queries — zero manual filter boilerplate, consistent across services"
    alternatives: ["Manual deletedAt IS NULL in every query", "Global query scope"]
  - decision: "Hard-cap recall limit at 1000 (MAX_RECALL constant)"
    rationale: "T-05-03 DoS mitigation — clamp before querying to prevent unbounded result sets"
    alternatives: ["No cap (trust caller)", "Database-level row limit"]
metrics:
  duration_minutes: 6.5
  completed_date: 2026-08-27
  tasks_completed: 3
  commits: 3
  files_created: 5
  files_modified: 4
status: complete
actuals:
  tokens: 6079
  tasks: 3
  commits: 3
---

# Phase 05 Plan 01: Conversation Memory Tracer Summary

Long-term memory tracer: schema migration + ConversationMemoryService.getRecentMessages + write-path population + E2E persist→recall proof

## What Was Built

A **tracer slice** for long-term memory: one message persists end-to-end (write path → PostgreSQL/SQLite → recall query) with conversation grouping, on the thinnest path through every layer Phase 5 touches. Proves the architecture (schema migration on the shared `messages` table, new `memory` module wired on the named `'data'` connection, write-path population, index-backed recall) with one real happy path before Plan 02 expands summarization/API and Plan 03 adds retention.

### Schema Migration (Task 1)

**AddConversationMemoryFields1786400000000** migration adds four nullable columns to the `messages` table:

- **conversationId** (varchar): Daily conversation grouping key `${chatId}:${YYYY-MM-DD}` in UTC
- **userId** (varchar): Sender identity for scoping recall queries (author for groups, from for 1:1)
- **deletedAt** (datetime): Soft-delete timestamp via TypeORM @DeleteDateColumn
- **expiresAt** (datetime): Retention expiry timestamp (Plan 03 purge target)

Plus two composite indexes backing recall queries:

- **(userId, createdAt)**: `ConversationMemoryService.getRecentMessages` by user
- **(conversationId, createdAt)**: Thread-scoped recall (future expansion)

**Dialect-aware migration**: Uses `datetime` column type (portable to both better-sqlite3 and postgres), guards column additions via `hasColumn()` checks (ADD COLUMN IF NOT EXISTS is not portable to older SQLite), and sets `LOCAL statement_timeout=0` on postgres before creating indexes over the hot messages table (prevents timeout abort during boot migration).

**Message entity updated**: Added four new optional fields with @Column/@DeleteDateColumn decorators, plus two @Index declarations matching the migration.

### Memory Module + Service (Task 2)

**MemoryModule** wires the ConversationMemoryService with the Message repository on the named 'data' connection (mirrors IntakeModule pattern). Service is exported for future plans (API endpoints, summarization).

**ConversationMemoryService.getRecentMessages(userId, limit=50)**:

- Queries messages WHERE userId matches, ordered by createdAt DESC
- Clamps limit to hard max (1000) before querying (T-05-03 DoS mitigation)
- Empty/undefined userId returns [] immediately (T-05-02: never all rows)
- Soft-deleted rows auto-excluded via @DeleteDateColumn (no manual `deletedAt IS NULL` filter needed)
- Hits the (userId, createdAt) composite index from migration

**Entity glob registration**: Added `src/modules/memory/**/*.entity{.ts,.js}` to BOTH `app.module.ts` 'data' entities array AND `data-source.ts` dataEntities so `@InjectRepository` resolves at runtime and `migration:generate` sees future memory entities.

**Unit tests** verify: DESC ordering, limit clamping (5000→1000), empty userId guard, default limit (50), and that soft-deleted rows are excluded without manual filtering.

### Write-Path Population (Task 3)

**MessageService.saveIncomingMessage** updated to populate memory fields before persist:

- **userId** = `data.author ?? data.from` (author for group messages where author exists, else from)
- **conversationId** = `${data.chatId}:${new Date().toISOString().slice(0,10)}` (chatId + UTC date)
- **expiresAt/deletedAt** remain unset (Plan 03 owns retention)

### Tracer E2E (Task 3)

**test/memory-tracer.e2e-spec.ts** proves the full persist→recall cycle:

1. Boot AppModule (both data sources, all modules including MemoryModule)
2. Resolve MessageService and ConversationMemoryService from Nest container
3. Call `saveIncomingMessage()` with synthetic incoming message
4. Assert message persisted with correct userId and conversationId
5. Re-resolve ConversationMemoryService (proves cross-service-instance recall, not in-memory state)
6. Call `getRecentMessages(userId)` and assert recalled message matches persisted body/fields

**Test coverage**: Both 1:1 messages (userId=from) and group messages (userId=author) scenarios.

## Deviations from Plan

**None** — plan executed exactly as written.

## Threat Mitigations Applied

All three STRIDE threats from the plan's threat_model were mitigated:

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-05-01 | Use parameterized queries only | TypeORM repository `find({ where })` — userId never interpolated into SQL |
| T-05-02 | Scope queries by caller-supplied userId | Empty userId returns [] early, never executes `find()` without WHERE clause |
| T-05-03 | Clamp limit to hard max | `Math.min(limit, 1000)` before querying; constant `MAX_RECALL = 1000` |

No additional threats discovered during implementation.

## Known Stubs

**None** — this plan adds schema and recall service only; no UI/API layer yet. Plan 02 will add the memory API endpoints and summarization; Plan 03 will add retention purge.

## Test Results

### Migration Applied

```
✓ npm run typeorm -- migration:run -d src/database/data-source.ts
  Migration AddConversationMemoryFields1786400000000 has been executed successfully.
✓ npm run typeorm -- migration:show -d src/database/data-source.ts
  [X] 32 AddConversationMemoryFields1786400000000
```

### Unit Tests

```
✓ npm test -- --testPathPatterns=conversation-memory.service.spec
  Test Suites: 1 passed, 1 total
  Tests:       7 passed, 7 total
```

All seven behaviors verified:
- Returns messages for userId ordered DESC
- Clamps limit above 1000 to MAX_RECALL
- Uses default limit 50 when not provided
- Returns [] for empty userId
- Returns [] for undefined userId
- Excludes soft-deleted rows (via @DeleteDateColumn)

### E2E Tests

```
✓ npm run test:e2e -- --testPathPatterns='memory-tracer\.e2e-spec\.ts$' --runInBand
  Test Suites: 1 passed, 1 total
  Tests:       2 passed, 2 total
  Time:        2.931 s
```

Both scenarios pass:
- 1:1 message: persisted → recalled with userId=from, correct conversationId
- Group message: persisted → recalled with userId=author (not group JID)

### Build

```
✓ npm run build
  Successfully compiled
```

## Commit History

| Task | Commit | Summary |
|------|--------|---------|
| 1 (tracer) | 2a18a7e4 | feat(05-01): add conversation memory schema (userId, conversationId, deletedAt, expiresAt) |
| 2 (auto+tdd) | 36aca44a | test(05-01): add ConversationMemoryService with getRecentMessages |
| 3 (auto+tdd) | 2a9caf6b | feat(05-01): populate memory fields on write path + tracer E2E persist→recall |

## Key Outcomes

1. **Incoming messages persist with conversationId+userId (MEM-01)** — verified by tracer E2E asserting saved message has both fields populated
2. **Messages are recalled newest-first via getRecentMessages (MEM-02)** — verified by unit tests (DESC ordering) and E2E (recalled message matches persisted body)
3. **Cross-session persistence** — tracer E2E re-resolves service after persist, proving recall works against a freshly-resolved instance (not in-memory state)
4. **Schema changes ship as dialect-aware migration** — migration applies cleanly on sqlite dev DB, uses portable column types (datetime), guards adds via hasColumn
5. **Memory module wired on 'data' connection** — entity glob registered in BOTH app.module.ts and data-source.ts so @InjectRepository resolves and migration:generate sees future entities

## Next Steps (Blocked Until This Completes)

- **Plan 02 (Wave 2)**: Memory API endpoints + conversation summarization
- **Plan 03 (Wave 3)**: Retention policy + purge job for expired messages

## Self-Check: PASSED

✓ Migration file created: `src/database/migrations/1786400000000-AddConversationMemoryFields.ts`  
✓ Memory service created: `src/modules/memory/services/conversation-memory.service.ts`  
✓ Tracer E2E created: `test/memory-tracer.e2e-spec.ts`  
✓ Commit 2a18a7e4 exists: `git log --oneline --all | grep 2a18a7e4` → found  
✓ Commit 36aca44a exists: `git log --oneline --all | grep 36aca44a` → found  
✓ Commit 2a9caf6b exists: `git log --oneline --all | grep 2a9caf6b` → found  

All files and commits present.
