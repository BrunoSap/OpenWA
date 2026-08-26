---
phase: 03-valida-o-e2e-udio-stt
plan: 03
subsystem: testing
tags: [n8n, workflow, github-actions, ci-cd, stt, shape-validation]

# Dependency graph
requires:
  - phase: 03-01
    provides: Audio STT E2E tracer suite with Groq Whisper integration
  - phase: 03-02
    provides: Expanded STT test cases (EN, noisy, fallback)
provides:
  - Workflow shape validation (WhatsApp-Audio-Transcription.json structure)
  - GitHub Actions CI pipeline for Audio STT tests
  - Automated secret scanning in workflow JSON
affects: [ci-cd, deployment, workflow-validation]

# Actuals (#2632) — same estimateTokens scale (chars/4 over realized diff)
actuals:
  tokens: 2565    # 10258 chars / 4
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: 
    - Workflow shape validation (JSON parse + structural assertions + secret grep)
    - CI pipeline pattern for STT tests (postgres+redis services, migrations, graceful skips)

key-files:
  created:
    - test/audio-workflow-shape.e2e-spec.ts
    - .github/workflows/audio-stt-e2e.yml
  modified: []

key-decisions:
  - "Reused Phase 2 RAG E2E CI pattern (postgres/redis services, migration setup) for consistency"
  - "Shape test guards T-03-01 via negative regex patterns for secret prefixes (sk-, gsk_, Bearer)"
  - "All GitHub Actions pinned by SHA for supply-chain security"
  - "Tests skip gracefully when GROQ_API_KEY absent (documented in workflow comment)"

patterns-established:
  - "Shape validation pattern: JSON parse in beforeAll, multiple focused assertions, negative grep for secrets"
  - "CI workflow pattern: path-based triggers, service containers, env injection via secrets, artifact upload"

requirements-completed: [STT-01, STT-02, STT-03, STT-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Workflow shape validation suite (WhatsApp-Audio-Transcription.json structural assertions)"
    requirement: STT-01
    verification:
      - kind: e2e
        ref: "test/audio-workflow-shape.e2e-spec.ts#7 assertions (JSON valid, webhook, transcription node, LLM, HTTP send, no secrets)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GitHub Actions CI workflow for Audio STT tests"
    requirement: STT-03
    verification:
      - kind: integration
        ref: ".github/workflows/audio-stt-e2e.yml validated (YAML syntax, required keys present)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Secret scanning guards T-03-01 (no literal API keys in workflow JSON)"
    requirement: STT-04
    verification:
      - kind: e2e
        ref: "test/audio-workflow-shape.e2e-spec.ts#contains NO literal secrets test"
        status: pass
    human_judgment: false

# Metrics
duration: 2min
completed: 2026-08-26
status: complete
---

# Phase 03 Plan 03: Workflow Shape + CI Summary

**n8n audio workflow validated (webhook, transcription, LLM, no secrets) + GitHub Actions CI pipeline for STT E2E tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-08-26T22:05:23Z
- **Completed:** 2026-08-26T22:07:26Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- Workflow shape validation suite guards structural correctness and T-03-01 (secret leakage)
- CI pipeline integrates all STT tests (tracer, cases, fallback, shape) into GitHub Actions
- All GitHub Actions pinned by SHA for supply-chain security (mirrors Phase 2 pattern)

## Task Commits

Each task was committed atomically:

1. **Task 1: Teste de shape do workflow n8n de áudio** - `9c1e178e` (test)
   - Created `test/audio-workflow-shape.e2e-spec.ts`
   - 7 assertions: JSON valid, webhook present, transcription node, LLM chain, HTTP send, no literal secrets, event validation
   - Pattern reused from `intake-workflow-shape.e2e-spec.ts`

2. **Task 2: GitHub Actions workflow para as suites STT** - `467fc4c3` (chore)
   - Created `.github/workflows/audio-stt-e2e.yml`
   - Triggers on PR/push for audio test paths
   - Reuses postgres+redis services, runs migrations
   - Injects GROQ_API_KEY/OPENAI_API_KEY via secrets
   - Documented graceful skip behavior when keys absent

**Plan metadata:** (pending in final commit)

## Files Created/Modified

### Created
- `test/audio-workflow-shape.e2e-spec.ts` - Validates WhatsApp-Audio-Transcription.json structure (webhook, transcription processing, LLM chain, HTTP send to /messages/send-text, no literal secrets)
- `.github/workflows/audio-stt-e2e.yml` - CI pipeline for Audio STT E2E tests (triggers on audio test file changes, runs all STT suites with API key injection)

### Modified
- None

## Decisions Made

**1. Reused Phase 2 RAG E2E CI pattern**
- **Rationale:** Consistency across CI workflows, proven postgres+redis service setup, migration scaffolding already validated

**2. Shape test guards T-03-01 via negative regex for secret prefixes**
- **Rationale:** Prevents accidental commit of literal API keys (sk-, gsk_, Bearer tokens) in workflow JSON; enforces $env references only

**3. All GitHub Actions pinned by SHA**
- **Rationale:** Supply-chain security best practice (prevents tag-rewrite attacks); mirrors rag-e2e.yml pattern

**4. Graceful skip when GROQ_API_KEY absent**
- **Rationale:** CI runs in forks without secrets; shape tests and fallback tests run deterministically always; transcription tests skip with console.warn

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both tasks completed on first attempt with all verifications passing.

## User Setup Required

None - no external service configuration required. CI workflow consumes existing GitHub secrets (GROQ_API_KEY, OPENAI_API_KEY) already configured in Phase 3 Plan 01.

## Next Phase Readiness

**Phase 3 complete** - all deliverables shipped:
- ✅ Audio STT E2E tracer (03-01)
- ✅ Expanded test cases: EN clean, PT/EN noisy, fallback (03-02)
- ✅ Workflow shape validation (03-03)
- ✅ GitHub Actions CI integration (03-03)

**Blockers:** None

**Next milestone:** Project ready for Phase 4 (pending roadmap definition) or audit/ship gate.

## Self-Check: PASSED

**Files created:**
- ✓ FOUND: test/audio-workflow-shape.e2e-spec.ts
- ✓ FOUND: .github/workflows/audio-stt-e2e.yml

**Commits verified:**
- ✓ FOUND: 9c1e178e (Task 1 - workflow shape test)
- ✓ FOUND: 467fc4c3 (Task 2 - CI workflow)

All claimed files exist and all commit hashes are present in git history.

---
*Phase: 03-valida-o-e2e-udio-stt*
*Completed: 2026-08-26*
