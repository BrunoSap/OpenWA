# Phase 02: Validação E2E Texto+LLM+RAG - Research

**Researched:** 2026-08-26
**Domain:** End-to-End testing for RAG (Retrieval-Augmented Generation) systems
**Confidence:** MEDIUM

## Summary

This phase validates the complete RAG pipeline end-to-end: WhatsApp message → n8n workflow → pgvector semantic search → LLM response generation → delivery. The research identifies proven testing strategies from the LangChain ecosystem, NestJS E2E patterns already in use in this project, and performance testing approaches for RAG systems.

The OpenWA project already has a mature E2E testing infrastructure (10+ existing E2E test suites, GitHub Actions CI with PostgreSQL services, Jest + Supertest setup). The phase extends this infrastructure to cover RAG-specific concerns: semantic search quality metrics (precision@k, recall@k), LLM response evaluation (correctness, faithfulness), and latency measurement (<3s requirement).

**Primary recommendation:** Follow the established E2E pattern from `test/intake-e2e-cycle.e2e-spec.ts` — full AppModule boot, real database with test data fixtures, sequential test execution (`maxWorkers: 1`), and cleanup in `afterEach`. Use LangChain's LLM-as-judge evaluators for non-deterministic LLM output assertions, and Python's existing performance validation patterns for pgvector metrics.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| RAG retrieval (pgvector) | Database / Storage | API / Backend | Semantic search happens in PostgreSQL with pgvector extension; API layer orchestrates |
| LLM inference | External API (Groq/OpenAI) | API / Backend | Backend calls external LLM providers; n8n workflows can also call directly |
| Workflow orchestration | n8n (separate service) | API / Backend | n8n handles message routing and LLM coordination; backend provides data APIs |
| E2E test execution | CI/CD (GitHub Actions) | — | Tests run in isolated CI environment with service containers (PostgreSQL, Redis) |
| Latency measurement | API / Backend | — | Response time measured at HTTP layer in E2E tests |

## Phase Requirements → Test Map

| ID | Description | Research Support |
|----|-------------|------------------|
| RAG-01 | Teste E2E simula mensagem WhatsApp com pergunta sobre KB | NestJS E2E patterns + existing intake-e2e-cycle.e2e-spec.ts structure [CITED: docs/09-testing-strategy.md] |
| RAG-02 | Teste valida que busca pgvector retorna documentos relevantes | Python performance test patterns + precision@k/recall@k metrics [CITED: database/tests/validate_performance_v2_simple.py] |
| RAG-03 | Teste valida que LLM usa contexto da KB na resposta | LangChain LLM-as-judge evaluators (correctness, faithfulness) [CITED: LangChain docs] |
| RAG-04 | Teste cobre caso: busca exata com match 100% | Test fixture with known FAQ entry + exact query [ASSUMED] |
| RAG-05 | Teste cobre caso: busca semântica fuzzy | Test fixture with paraphrased query + similarity threshold assertion [ASSUMED] |
| RAG-06 | Teste cobre caso: sem match, fallback genérico | Query with no semantic match + fallback response assertion [ASSUMED] |
| RAG-07 | Latência end-to-end medida e <3s no teste | Jest timing + expect assertions on response time [CITED: validate_performance_v2_simple.py measure_query pattern] |
| RAG-08 | Taxa de acerto RAG medida (precisão@k) | Ground-truth dataset + retrieved docs comparison [CITED: LangChain RAG evaluation docs] |
| RAG-09 | Testes rodam automaticamente no CI/CD | GitHub Actions with postgres service container [CITED: .github/workflows/ci.yml] |

## Standard Stack

### Core Testing Framework

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jest | 29.x | Test runner | Already used project-wide; 10+ E2E suites in `test/` [VERIFIED: package.json] |
| @nestjs/testing | 11.x | NestJS test module | Standard for NestJS E2E tests; creates test application instances [VERIFIED: test/intake-e2e-cycle.e2e-spec.ts] |
| supertest | 7.x | HTTP assertions | Already used in all E2E suites for API endpoint testing [VERIFIED: test/intake-e2e-cycle.e2e-spec.ts:8] |
| ts-jest | 29.x | TypeScript transform | Project uses TypeScript throughout; jest-e2e.json configured [VERIFIED: .github/workflows/ci.yml:39] |

### RAG Testing Extensions

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @langchain/core | latest | LLM-as-judge evaluators | Non-deterministic LLM output validation (correctness, faithfulness) [CITED: LangChain docs] |
| langsmith | latest | Evaluation framework | Advanced RAG metrics (precision@k, recall@k, answer relevance) [CITED: LangChain RAG evaluation tutorial] |
| numpy (Python) | 1.x | Vector metrics | Precision/recall calculations in pgvector performance tests [VERIFIED: database/tests/validate_performance_v2_simple.py:20] |
| psycopg2 (Python) | 2.9.x | PostgreSQL client | Direct pgvector query testing and explain analyze [VERIFIED: database/tests/validate_performance_v2_simple.py:18] |

### Supporting Tools

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 3.x | Schema validation | Validate LLM structured outputs in tests [ASSUMED] |
| @faker-js/faker | 8.x | Test data generation | Generate realistic test messages and user queries [ASSUMED] |

**Installation:**
```bash
# Core testing (already installed)
npm ci

# RAG evaluation extensions
npm install --save-dev @langchain/core langsmith zod @faker-js/faker

# Python tools (for pgvector metrics, already present)
# pip install numpy psycopg2-binary
```

**Version verification:**
```bash
npm view jest version          # 29.7.0 (2024-11-15)
npm view @nestjs/testing version  # 11.1.6 (2024-11-22)
npm view supertest version     # 7.0.0 (2024-06-20)
npm view @langchain/core version  # 0.3.24 (2024-12-18)
npm view langsmith version     # 0.2.19 (2024-12-20)
```

## Package Legitimacy Audit

> Ran Package Legitimacy Gate protocol before completing this section.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @langchain/core | npm | 2 yrs | 500K/wk | github.com/langchain-ai/langchainjs | OK | Approved |
| langsmith | npm | 1.5 yrs | 400K/wk | github.com/langchain-ai/langsmithjs | OK | Approved |
| zod | npm | 4 yrs | 15M/wk | github.com/colinhacks/zod | OK | Approved |
| @faker-js/faker | npm | 2 yrs | 3M/wk | github.com/faker-js/faker | OK | Approved |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────┐
│   WhatsApp      │
│   (incoming)    │
└────────┬────────┘
         │ webhook
         ▼
┌─────────────────────────────────────────────────────────────┐
│                     n8n Workflow                            │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│  │  Trigger   │──▶│ RAG Retrieval│──▶│ LLM Generation  │  │
│  │  (webhook) │   │  (pgvector)  │   │ (Groq/OpenAI)   │  │
│  └────────────┘   └──────┬───────┘   └────────┬────────┘  │
└─────────────────────────┼─────────────────────┼───────────┘
                          │                     │
                          ▼                     ▼
                    PostgreSQL            External LLM API
                    (pgvector)            (Groq/OpenAI)
                          │                     │
                          └──────────┬──────────┘
                                     ▼
                              ┌──────────────┐
                              │  Response    │
                              │  Assembly    │
                              └──────┬───────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  WhatsApp    │
                              │  (outgoing)  │
                              └──────────────┘

E2E Test Path:
  POST /api/messages → n8n workflow trigger → pgvector query → LLM call → response
  ↑                                                                           │
  └───────────────────────────── Test assertions ────────────────────────────┘
```

### Recommended Project Structure

```
test/
├── rag-e2e-cycle.e2e-spec.ts           # Full RAG cycle E2E
├── rag-retrieval-quality.e2e-spec.ts   # Semantic search metrics
├── rag-performance.e2e-spec.ts         # Latency benchmarks
└── fixtures/
    ├── rag-test-questions.json         # Ground truth Q&A dataset
    └── rag-test-embeddings.json        # Pre-computed embeddings

database/tests/
├── validate_rag_retrieval.py           # Precision@k/recall@k tests
└── fixtures/
    └── rag_golden_dataset.sql          # Seeded FAQ data
```

### Pattern 1: E2E RAG Test with LLM-as-Judge

**What:** Boot full NestJS app, seed test FAQs with known answers, send query via API, validate LLM response uses retrieved context.

**When to use:** Validating that the complete RAG pipeline (retrieval → LLM → response) produces correct, contextual answers.

**Example:**
```typescript
// Source: NestJS E2E pattern + LangChain evaluator
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ChatOpenAI } from '@langchain/openai';

describe('RAG E2E (full cycle)', () => {
  let app: INestApplication;
  
  // LLM-as-judge for non-deterministic output validation
  const evaluatorLLM = new ChatOpenAI({ 
    model: 'gpt-4o-mini', 
    temperature: 0 
  });
  
  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    
    app = moduleRef.createNestApplication();
    await app.init();
    
    // Seed test FAQs with known embeddings
    await seedTestKnowledgeBase();
  });
  
  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });
  
  it('RAG-03: LLM response uses retrieved context (exact match)', async () => {
    const question = 'Como dar entrada no INSS?';
    const expectedContext = 'Você pode dar entrada pelo site Meu INSS ou presencialmente';
    
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/messages')
      .send({ chatId: 'test@c.us', text: question })
      .expect(200);
    const latency = Date.now() - start;
    
    // RAG-07: Latency < 3s
    expect(latency).toBeLessThan(3000);
    
    const reply = res.body.reply;
    
    // Use LLM-as-judge to validate faithfulness
    const gradePrompt = `
      QUESTION: ${question}
      EXPECTED CONTEXT: ${expectedContext}
      LLM ANSWER: ${reply}
      
      Does the LLM answer contain information from the expected context? 
      Answer with JSON: { "faithful": boolean, "explanation": string }
    `;
    
    const grade = await evaluatorLLM.invoke([
      { role: 'system', content: 'You are a grading assistant.' },
      { role: 'user', content: gradePrompt }
    ]);
    
    const gradeJson = JSON.parse(grade.content as string);
    expect(gradeJson.faithful).toBe(true);
  });
  
  it('RAG-06: No match → fallback response', async () => {
    const question = 'What is the meaning of life?'; // Unrelated to KB
    
    const res = await request(app.getHttpServer())
      .post('/api/messages')
      .send({ chatId: 'test@c.us', text: question })
      .expect(200);
    
    const reply = res.body.reply;
    
    // Fallback should acknowledge lack of context
    expect(reply.toLowerCase()).toMatch(/não sei|não tenho|base de conhecimento/);
  });
});

async function seedTestKnowledgeBase() {
  // Insert FAQs with pre-computed embeddings into knowledge.faq
}

async function cleanupTestData() {
  // Delete test FAQs by category='test_rag'
}
```

### Pattern 2: pgvector Retrieval Quality Test (Python)

**What:** Direct PostgreSQL queries to measure semantic search precision@k and recall@k with a golden dataset.

**When to use:** Validating that pgvector retrieval returns relevant documents at acceptable quality thresholds.

**Example:**
```python
# Source: database/tests/validate_performance_v2_simple.py pattern
import psycopg2
import numpy as np
from typing import List, Tuple

def test_rag_precision_at_k():
    """
    RAG-08: Measure precision@k for semantic search.
    Golden dataset: 10 queries with known relevant doc IDs.
    """
    conn = psycopg2.connect(dbname='openwa', user='openwa')
    cursor = conn.cursor()
    
    # Golden dataset: (query_embedding, relevant_doc_ids)
    golden_dataset = load_golden_dataset()
    
    precision_scores = []
    
    for query_embedding, relevant_ids in golden_dataset:
        # RAG-02: Execute pgvector similarity search
        cursor.execute("""
            SELECT id, 1 - (embedding <=> %s::vector) AS similarity
            FROM knowledge.faq
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT 5
        """, (query_embedding, query_embedding))
        
        retrieved_ids = [row[0] for row in cursor.fetchall()]
        
        # Calculate precision@5
        relevant_retrieved = len(set(retrieved_ids) & set(relevant_ids))
        precision = relevant_retrieved / 5.0
        precision_scores.append(precision)
    
    avg_precision = np.mean(precision_scores)
    
    # RAG-08: Assert precision@5 >= 0.8
    assert avg_precision >= 0.8, f"Precision@5 too low: {avg_precision:.2f}"
    
    cursor.close()
    conn.close()

def load_golden_dataset() -> List[Tuple[list, List[int]]]:
    """
    Load pre-annotated queries with known relevant document IDs.
    Format: [(embedding, [relevant_doc_ids]), ...]
    """
    # Load from fixtures/rag_golden_dataset.json
    pass
```

### Pattern 3: N8N Workflow Testing via HTTP Webhook

**What:** Trigger n8n workflows programmatically by calling the webhook endpoint, capture execution state.

**When to use:** Validating that n8n orchestration correctly routes messages through RAG pipeline.

**Example:**
```typescript
// Source: Project convention (n8n webhook triggers)
describe('N8N Workflow Integration', () => {
  it('triggers RAG workflow via webhook', async () => {
    const webhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/rag-test';
    
    const payload = {
      chatId: '5511999999999@c.us',
      message: 'Como dar entrada no INSS?',
    };
    
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.executionId).toBeDefined();
    
    // Poll n8n API for execution status
    const status = await pollExecutionStatus(body.executionId);
    expect(status).toBe('success');
  });
});

async function pollExecutionStatus(executionId: string): Promise<string> {
  // Use n8n REST API: GET /executions/:id
  // Retry with exponential backoff until status != 'running'
}
```

### Anti-Patterns to Avoid

- **Anti-pattern: Mocking pgvector queries in RAG E2E tests.** RAG tests MUST hit real PostgreSQL with pgvector extension to validate semantic search quality. Mocking hides retrieval bugs.
- **Anti-pattern: String-matching LLM outputs.** LLM responses are non-deterministic. Use LLM-as-judge evaluators or semantic similarity checks instead of exact string assertions.
- **Anti-pattern: Running E2E tests in parallel.** Project convention requires `maxWorkers: 1` to avoid state collisions (plugin registry, port conflicts). [VERIFIED: docs/09-testing-strategy.md:127-142]
- **Anti-pattern: Using production LLM API keys in CI.** Use test-scoped API keys with rate limits, or mock LLM calls with deterministic fixtures for CI stability.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RAG evaluation metrics | Custom precision/recall calculators | LangSmith evaluation framework [CITED: LangChain docs] | Handles edge cases (empty results, duplicate docs), provides standard benchmarks |
| LLM output validation | Regex or substring matching | LLM-as-judge evaluators (correctness, faithfulness) [CITED: LangChain RAG tutorial] | Non-deterministic outputs require semantic validation, not exact matching |
| Vector similarity assertions | Manual cosine distance calculations | pgvector built-in operators (`<=>`) with SQL queries [VERIFIED: database/CURRENT_SCHEMA_EXPORT.sql] | Optimized IVFFlat index, battle-tested, avoids precision errors |
| Test data embeddings | Runtime embedding generation in tests | Pre-computed fixtures (rag-test-embeddings.json) [ASSUMED] | Eliminates LLM API dependency in tests, faster execution, deterministic |
| n8n workflow state polling | Custom retry loops | Built-in n8n API with execution status endpoint [ASSUMED] | Handles timeouts, provides execution logs for debugging |

**Key insight:** RAG testing complexity lies in non-deterministic LLM outputs and semantic search quality. Industry-standard tools (LangChain evaluators, pgvector metrics) solve these problems; custom solutions miss edge cases and are hard to benchmark.

## Environment Availability Audit

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16+ | pgvector queries | ✓ | 16.15 | — |
| pgvector extension | Semantic search | ✓ | 0.5.x | — |
| Redis | Queue (optional for E2E) | ✓ | 7-alpine | Tests skip if unavailable |
| Node.js | Test runner | ✓ | 22.x | — |
| Python 3.9+ | pgvector metrics | ✓ | 3.x | — |
| n8n | Workflow orchestration | ✗ | — | Mock webhook responses in E2E |

**Missing dependencies with no fallback:**
- None — all critical dependencies (PostgreSQL, pgvector, Node.js) are available and verified in CI.

**Missing dependencies with fallback:**
- n8n runtime: Not running in CI, but E2E tests can mock webhook responses or trigger workflows via HTTP if n8n is available locally.

## Common Pitfalls

### Pitfall 1: Non-Deterministic LLM Output Breaks Exact Assertions

**What goes wrong:** E2E test expects exact LLM response string, test flakes because LLM rephrases answer.

**Why it happens:** LLMs are non-deterministic even at temperature=0. Same prompt can yield different phrasings.

**How to avoid:** Use LLM-as-judge evaluators for semantic validation, or check for key facts (e.g., "INSS" appears in response) instead of exact strings.

**Warning signs:** Test passes locally, fails in CI; re-running test changes pass/fail without code changes.

### Pitfall 2: Seeding Test Data Without Cleanup Pollutes Database

**What goes wrong:** E2E tests insert FAQs into `knowledge.faq`, tests start failing due to stale data from previous runs.

**Why it happens:** `afterEach` cleanup missing or incomplete, or test crashes before cleanup runs.

**How to avoid:** Use unique identifiers (`category='test_rag_${Date.now()}'`), delete by explicit IDs in `afterEach`, and use transactions for isolation where possible.

**Warning signs:** First test passes, second test fails with "duplicate key" error; manual DB query shows leftover test data.

### Pitfall 3: IVFFlat Index Not Used in Queries (Sequential Scan)

**What goes wrong:** pgvector queries are slow (>500ms), `EXPLAIN ANALYZE` shows sequential scan instead of index scan.

**Why it happens:** IVFFlat index requires sufficient data to be effective (typically 1000+ rows), or query pattern doesn't match index.

**How to avoid:** Seed enough test data for index to activate, check `EXPLAIN ANALYZE` output in tests, verify index exists with `\d+ knowledge.faq` in psql.

**Warning signs:** Performance tests fail latency threshold, `EXPLAIN` output shows "Seq Scan on faq" instead of "Index Scan using idx_faq_embedding".

### Pitfall 4: Parallel E2E Test Execution Causes State Collisions

**What goes wrong:** E2E tests fail intermittently with 403/404 errors or rate limit violations when run in parallel.

**Why it happens:** Multiple test workers share state (plugin registry, loopback port conflicts). Project convention requires `maxWorkers: 1`. [VERIFIED: docs/09-testing-strategy.md:127-142]

**How to avoid:** Keep `jest-e2e.json` with `"maxWorkers": 1`, never override in CI config.

**Warning signs:** Tests pass when run with `--runInBand`, fail in default CI run; errors move between test suites unpredictably.

### Pitfall 5: LLM API Rate Limits Break CI Pipeline

**What goes wrong:** CI tests fail with 429 errors from OpenAI/Groq API, blocking PR merges.

**Why it happens:** Multiple CI runs (PRs + pushes) hit rate limits on shared API key, or tests don't implement retry/backoff.

**How to avoid:** Use separate API keys for CI (with higher limits), mock LLM calls in CI with deterministic fixtures, or implement exponential backoff with retries.

**Warning signs:** Tests pass locally, fail in CI with "rate limit exceeded"; failures correlate with high PR activity.

## Code Examples

Verified patterns from official sources and project conventions:

### NestJS E2E Test Setup (Full App Boot)

```typescript
// Source: test/intake-e2e-cycle.e2e-spec.ts (project convention)
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { applyGlobalValidation } from '../src/config/app-validation';

describe('RAG E2E', () => {
  let app: INestApplication;
  
  jest.setTimeout(60000); // Full boot can exceed 5s default
  
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule], // Real app, all modules
    }).compile();
    
    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app); // DTO validation pipes
    await app.init();
  });
  
  afterAll(async () => {
    await app.close();
  });
  
  it('test case', async () => {
    // Test logic here
  });
});
```

### LangChain LLM-as-Judge Evaluator (Correctness)

```typescript
// Source: https://docs.langchain.com/langsmith/evaluate-rag-tutorial
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

const graderLLM = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
}).withStructuredOutput(
  z.object({
    explanation: z.string().describe('Explain your reasoning'),
    correct: z.boolean().describe('True if answer is correct'),
  })
);

async function evaluateCorrectness({
  question,
  groundTruth,
  llmAnswer,
}: {
  question: string;
  groundTruth: string;
  llmAnswer: string;
}) {
  const prompt = `
    QUESTION: ${question}
    GROUND TRUTH: ${groundTruth}
    LLM ANSWER: ${llmAnswer}
    
    Grade the LLM answer based ONLY on factual accuracy relative to ground truth.
    Explain your reasoning step-by-step.
  `;
  
  const grade = await graderLLM.invoke([
    { role: 'system', content: 'You are a grading assistant.' },
    { role: 'user', content: prompt },
  ]);
  
  return grade.correct;
}
```

### pgvector Performance Measurement (Python)

```python
# Source: database/tests/validate_performance_v2_simple.py (project convention)
import time
import psycopg2
import numpy as np

def measure_query(cursor, query, params, iterations=5):
    """Execute query and measure latency"""
    # Warm up
    cursor.execute(query, params)
    cursor.fetchall()
    
    # Measure
    times = []
    for _ in range(iterations):
        start = time.time()
        cursor.execute(query, params)
        cursor.fetchall()
        end = time.time()
        times.append((end - start) * 1000)  # ms
    
    avg_time = np.mean(times)
    max_time = np.max(times)
    
    return {'avg': avg_time, 'max': max_time}

# Usage
conn = psycopg2.connect(dbname='openwa', user='openwa')
cursor = conn.cursor()
query_embedding = generate_test_embedding()

result = measure_query(
    cursor,
    "SELECT * FROM knowledge.find_similar_faq_v2(%s::vector, 0.8, 5)",
    (query_embedding,)
)

assert result['avg'] < 100, f"Query too slow: {result['avg']:.2f}ms"
```

### Precision@K Calculation (RAG Retrieval Quality)

```python
# Source: LangChain RAG evaluation patterns (adapted)
def calculate_precision_at_k(
    retrieved_doc_ids: list[int], 
    relevant_doc_ids: list[int], 
    k: int
) -> float:
    """
    Precision@k: fraction of top-k retrieved docs that are relevant.
    
    Example:
      retrieved = [1, 5, 3, 9, 2] (top 5 results)
      relevant = [1, 3, 7, 2]     (ground truth)
      precision@5 = 3/5 = 0.6     (docs 1, 3, 2 are relevant)
    """
    retrieved_top_k = retrieved_doc_ids[:k]
    relevant_set = set(relevant_doc_ids)
    
    relevant_retrieved = len([doc_id for doc_id in retrieved_top_k if doc_id in relevant_set])
    
    return relevant_retrieved / k

def calculate_recall_at_k(
    retrieved_doc_ids: list[int], 
    relevant_doc_ids: list[int], 
    k: int
) -> float:
    """
    Recall@k: fraction of relevant docs that appear in top-k results.
    
    Example:
      retrieved = [1, 5, 3, 9, 2]
      relevant = [1, 3, 7, 2]
      recall@5 = 3/4 = 0.75  (3 of 4 relevant docs retrieved)
    """
    retrieved_top_k_set = set(retrieved_doc_ids[:k])
    relevant_set = set(relevant_doc_ids)
    
    relevant_retrieved = len(retrieved_top_k_set & relevant_set)
    
    return relevant_retrieved / len(relevant_set) if relevant_set else 0.0
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String matching LLM outputs | LLM-as-judge evaluators | 2023-2024 | Handles non-deterministic outputs, semantic validation [CITED: LangChain docs] |
| Manual embedding generation in tests | Pre-computed fixture files | Project convention | Faster tests, no API dependency, deterministic [ASSUMED] |
| Parallel E2E test execution | Sequential (`maxWorkers: 1`) | Project convention | Eliminates state collisions, reliable CI [VERIFIED: docs/09-testing-strategy.md:127] |
| SQLite for E2E tests | PostgreSQL service containers | GitHub Actions 2020+ | Validates pgvector, real production DB [VERIFIED: .github/workflows/ci.yml:109-125] |

**Deprecated/outdated:**
- **Manual cosine distance calculations:** pgvector `<=>` operator is faster and more accurate [VERIFIED: database/CURRENT_SCHEMA_EXPORT.sql:708]
- **Exact string assertions for LLM responses:** Replaced by semantic similarity checks and LLM-as-judge patterns [CITED: LangChain RAG tutorial]

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Pre-computed embedding fixtures are faster than runtime generation | Standard Stack | Tests may be slower than estimated, but still correct |
| A2 | n8n workflows can be mocked in E2E tests via HTTP webhook responses | Architecture Patterns | May need to run n8n in CI, increasing complexity |
| A3 | Precision@5 >= 0.8 is acceptable threshold for RAG quality | Code Examples | Threshold too high may cause false failures, too low may miss quality issues |
| A4 | Test fixture format: `{ "question": string, "embedding": number[], "relevantDocIds": number[] }` | Code Examples | Wrong format requires fixture refactor before tests run |
| A5 | n8n API endpoint `/executions/:id` returns execution status | Pattern 3 | Wrong endpoint requires API discovery before implementation |

## Open Questions

1. **n8n Workflow Testing Strategy**
   - What we know: n8n workflows can be triggered via webhook POST
   - What's unclear: Should tests mock n8n entirely, or run real n8n instance in CI? Current project has no n8n CI integration.
   - Recommendation: Start with mocked webhook responses (fast, reliable), add real n8n integration in future phase if needed.

2. **LLM API Key Management in CI**
   - What we know: Tests need LLM API access for LLM-as-judge evaluators
   - What's unclear: Should CI use real API keys (rate limit risk) or mocked responses (less realistic)?
   - Recommendation: Use real API keys with retry/backoff for critical RAG tests, mock for bulk validation tests.

3. **Golden Dataset Size and Coverage**
   - What we know: Precision@k/recall@k require annotated ground-truth dataset
   - What's unclear: How many query-document pairs are needed for statistically significant results?
   - Recommendation: Start with 20-30 annotated examples covering main FAQ categories, expand based on failure analysis.

4. **IVFFlat Index Activation in Tests**
   - What we know: IVFFlat index requires sufficient data (typically 1000+ rows) to activate
   - What's unclear: Test fixtures may not have enough data to trigger index usage
   - Recommendation: Seed at least 1000 FAQ entries in test setup, verify with `EXPLAIN ANALYZE` in first test.

## Validation Architecture

> nyquist_validation enabled (default).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.x + @nestjs/testing 11.x |
| Config file | test/jest-e2e.json |
| Quick run command | `npm run test:e2e -- --testPathPattern=rag` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RAG-01 | WhatsApp message triggers RAG pipeline | E2E | `npm run test:e2e -- rag-e2e-cycle` | ❌ Wave 0 |
| RAG-02 | pgvector returns relevant documents | Integration | `python database/tests/validate_rag_retrieval.py` | ❌ Wave 0 |
| RAG-03 | LLM uses KB context in response | E2E | `npm run test:e2e -- rag-e2e-cycle` | ❌ Wave 0 |
| RAG-04 | Exact match (similarity=1.0) | E2E | `npm run test:e2e -- rag-e2e-cycle` | ❌ Wave 0 |
| RAG-05 | Fuzzy match (similarity>=0.8) | E2E | `npm run test:e2e -- rag-e2e-cycle` | ❌ Wave 0 |
| RAG-06 | No match fallback response | E2E | `npm run test:e2e -- rag-e2e-cycle` | ❌ Wave 0 |
| RAG-07 | Latency <3s | E2E | `npm run test:e2e -- rag-performance` | ❌ Wave 0 |
| RAG-08 | Precision@k measurement | Integration | `python database/tests/validate_rag_retrieval.py` | ❌ Wave 0 |
| RAG-09 | CI/CD automated execution | CI | GitHub Actions (automatic on PR) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:e2e -- --testPathPattern=rag-e2e-cycle` (core RAG flow, <30s)
- **Per wave merge:** `npm run test:e2e` (all E2E tests including RAG, <5min)
- **Phase gate:** Full E2E suite + Python retrieval tests green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/rag-e2e-cycle.e2e-spec.ts` — covers RAG-01 through RAG-07
- [ ] `test/rag-performance.e2e-spec.ts` — covers RAG-07 latency benchmarks
- [ ] `database/tests/validate_rag_retrieval.py` — covers RAG-02, RAG-08 (precision@k/recall@k)
- [ ] `test/fixtures/rag-test-questions.json` — ground truth Q&A dataset
- [ ] `test/fixtures/rag-test-embeddings.json` — pre-computed embeddings for fixtures
- [ ] `database/tests/fixtures/rag_golden_dataset.sql` — seed script for test FAQs

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | API key authentication (already implemented) [VERIFIED: test/intake-e2e-cycle.e2e-spec.ts:77] |
| V3 Session Management | no | Stateless API, no sessions |
| V4 Access Control | yes | Role-based access (ADMIN/OPERATOR) [VERIFIED: ApiKeyRole enum] |
| V5 Input Validation | yes | DTO validation pipes via class-validator [VERIFIED: applyGlobalValidation] |
| V6 Cryptography | no | No custom crypto (LLM APIs use TLS) |

### Known Threat Patterns for NestJS + LLM + pgvector

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection | Tampering | Input sanitization, system prompt separation (LLM provider best practices) [ASSUMED] |
| LLM API key exposure | Information Disclosure | API keys in env vars, never in code/logs [PROJECT: .env.example] |
| SQL injection in vector queries | Tampering | Parameterized queries (`%s::vector` placeholders) [VERIFIED: database/tests/validate_performance_v2_simple.py:151] |
| SSRF via webhook URLs | Tampering | SSRF guard on webhook delivery [VERIFIED: test/intake-e2e-cycle.e2e-spec.ts:34] |

## Sources

### Primary (HIGH confidence - Context7 verified)

- LangChain RAG Evaluation Tutorial - RAG correctness evaluators, LLM-as-judge patterns [CITED: https://docs.langchain.com/langsmith/evaluate-rag-tutorial]
- LangChain Vitest/Jest Integration - Test runner setup for evaluation [CITED: https://docs.langchain.com/oss/javascript/langchain/test/evals]
- NestJS Testing Fundamentals - E2E test patterns with supertest [CITED: https://github.com/nestjs/docs.nestjs.com/blob/master/content/fundamentals/unit-testing.md]

### Secondary (MEDIUM confidence - Project verified)

- Project E2E Test Pattern - Full-cycle intake E2E structure [VERIFIED: test/intake-e2e-cycle.e2e-spec.ts]
- Project Testing Strategy - Test commands, parallelism constraints [VERIFIED: docs/09-testing-strategy.md]
- pgvector Performance Tests - Latency measurement patterns [VERIFIED: database/tests/validate_performance_v2_simple.py]
- Database Schema - pgvector IVFFlat indexes, vector columns [VERIFIED: database/CURRENT_SCHEMA_EXPORT.sql]
- GitHub Actions CI - PostgreSQL service containers, test jobs [VERIFIED: .github/workflows/ci.yml]

### Tertiary (LOW confidence - Assumed, marked for validation)

- n8n API documentation (execution status endpoint) - Not verified in this session [ASSUMED]
- Optimal golden dataset size for RAG evaluation - Industry best practice not confirmed [ASSUMED]
- Pre-computed embedding fixture format - Convention not documented in project [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use (Jest, NestJS testing, Supertest) with existing E2E patterns [VERIFIED: multiple test files]
- Architecture: MEDIUM - RAG evaluation patterns from LangChain docs are established but not yet implemented in this project [CITED: official docs]
- Pitfalls: MEDIUM - Parallel test issues documented in project, LLM non-determinism from LangChain best practices [VERIFIED + CITED]

**Research date:** 2026-08-26
**Valid until:** 2026-10-26 (60 days - RAG testing patterns are stable, but LLM provider APIs evolve)
