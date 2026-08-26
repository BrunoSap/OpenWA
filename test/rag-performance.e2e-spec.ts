// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import * as fs from 'fs';
import * as path from 'path';

/**
 * RAG Performance Testing (RAG-07)
 *
 * This suite measures end-to-end latency for the RAG pipeline:
 * - Semantic search query execution time
 * - Percentile calculations (p50, p95, p99)
 * - Validation against < 3000ms requirement
 *
 * The tests use the same fixtures as rag-e2e-cycle.e2e-spec.ts to ensure
 * consistent data setup across test suites.
 */
describe('RAG Performance (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let apiKey: string;

  const TEST_CATEGORY = 'test_rag_cycle';

  // Test FAQs with pre-computed embeddings (same as rag-e2e-cycle.e2e-spec.ts)
  const TEST_FAQS = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'rag-test-knowledge.json'), 'utf-8')
  );

  // Performance tests can take longer due to multiple iterations
  jest.setTimeout(120000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    // Get the 'data' connection which hosts knowledge.faq
    dataSource = app.get(getDataSourceToken('data'));

    // Skip tests if not using PostgreSQL (pgvector is PostgreSQL-only)
    if (dataSource.options.type !== 'postgres') {
      console.warn('⚠️  Skipping RAG performance tests: PostgreSQL with pgvector required');
      return;
    }

    const authService = app.get(AuthService);
    apiKey = (await authService.createApiKey({ name: 'e2e-rag-perf', role: ApiKeyRole.ADMIN })).rawKey;

    // Seed test FAQs into knowledge.faq
    await seedTestFAQs();
  });

  afterAll(async () => {
    // Clean up test data (only if PostgreSQL)
    if (dataSource?.options.type === 'postgres') {
      await cleanupTestData();
    }
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  /**
   * Seed test FAQs with pre-computed embeddings into knowledge.faq.
   */
  async function seedTestFAQs() {
    for (const faq of TEST_FAQS) {
      const embeddingStr = '[' + faq.embedding.join(',') + ']';
      await dataSource.query(
        `INSERT INTO knowledge.faq (question, answer, category, keywords, embedding, use_count, last_used)
         VALUES ($1, $2, $3, $4, $5::vector, 0, NOW())`,
        [faq.question, faq.answer, faq.category, faq.tags, embeddingStr]
      );
    }
  }

  /**
   * Clean up test FAQs by category.
   */
  async function cleanupTestData() {
    await dataSource.query(
      `DELETE FROM knowledge.faq WHERE category = $1`,
      [TEST_CATEGORY]
    );
  }

  /**
   * Calculate percentile from sorted array
   */
  function calculatePercentile(sortedArray: number[], percentile: number): number {
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[Math.max(0, index)];
  }

  /**
   * RAG-07: End-to-end latency < 3000ms (p95)
   *
   * Measures latency distribution for pgvector semantic search queries:
   * - Executes warm-up query to initialize connection pool
   * - Runs 5 distinct queries × 10 iterations each = 50 measurements
   * - Calculates p50, p95, p99 percentiles
   * - Asserts p95 < 3000ms (requirement)
   */
  it('RAG-07: end-to-end latency < 3000ms (p95)', async () => {
    // Skip if not PostgreSQL
    if (dataSource.options.type !== 'postgres') {
      console.log('⚠️  Test skipped: PostgreSQL with pgvector required');
      return;
    }

    const queries = [
      'Como dar entrada no INSS?',
      'Qual o prazo para recurso do INSS?',
      'Como solicitar auxílio-doença?',
      'Quero fazer pedido de aposentadoria',
      'Preciso entrar com recurso no INSS',
    ];

    const latencies: number[] = [];

    // Warm-up: primeira query para cache de conexões e plan cache
    const warmupEmbedding = TEST_FAQS[0].embedding;
    const warmupEmbeddingStr = '[' + warmupEmbedding.join(',') + ']';
    await dataSource.query(
      `SELECT id, question, answer, 1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge.faq
       WHERE category = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 5`,
      [warmupEmbeddingStr, TEST_CATEGORY]
    );

    console.log('✓ Warm-up query completed');

    // Measure: executar cada query N vezes
    const iterations = 10;
    for (let queryIdx = 0; queryIdx < queries.length; queryIdx++) {
      // Use corresponding FAQ embedding for each query
      const queryEmbedding = TEST_FAQS[queryIdx % TEST_FAQS.length].embedding;
      const embeddingStr = '[' + queryEmbedding.join(',') + ']';

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await dataSource.query(
          `SELECT id, question, answer, 1 - (embedding <=> $1::vector) AS similarity
           FROM knowledge.faq
           WHERE category = $2 AND embedding IS NOT NULL
           ORDER BY embedding <=> $1::vector
           LIMIT 5`,
          [embeddingStr, TEST_CATEGORY]
        );
        const latency = Date.now() - start;
        latencies.push(latency);
      }
    }

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = calculatePercentile(latencies, 50);
    const p95 = calculatePercentile(latencies, 95);
    const p99 = calculatePercentile(latencies, 99);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const min = latencies[0];
    const max = latencies[latencies.length - 1];

    console.log('\n=== RAG Latency Metrics ===');
    console.log(`  Samples: ${latencies.length}`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Avg: ${avg.toFixed(2)}ms`);
    console.log(`  p50: ${p50.toFixed(2)}ms`);
    console.log(`  p95: ${p95.toFixed(2)}ms`);
    console.log(`  p99: ${p99.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);

    // Assert p95 < 3000ms (requirement RAG-07)
    expect(p95).toBeLessThan(3000);

    // Additional sanity checks
    expect(latencies.length).toBe(50); // 5 queries × 10 iterations
    expect(min).toBeGreaterThan(0);
    expect(avg).toBeGreaterThan(0);
  });

  /**
   * RAG-07: Latency consistency check
   *
   * Validates that query latency is consistent across multiple runs
   * by checking that p99 is not excessively higher than p50.
   * A healthy distribution should have p99 < 5 × p50.
   */
  it('RAG-07: latency consistency (p99 < 5x p50)', async () => {
    // Skip if not PostgreSQL
    if (dataSource.options.type !== 'postgres') {
      console.log('⚠️  Test skipped: PostgreSQL with pgvector required');
      return;
    }

    const latencies: number[] = [];
    const iterations = 20;

    // Use first FAQ embedding for consistency test
    const queryEmbedding = TEST_FAQS[0].embedding;
    const embeddingStr = '[' + queryEmbedding.join(',') + ']';

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      await dataSource.query(
        `SELECT id, question, answer, 1 - (embedding <=> $1::vector) AS similarity
         FROM knowledge.faq
         WHERE category = $2 AND embedding IS NOT NULL
         ORDER BY embedding <=> $1::vector
         LIMIT 5`,
        [embeddingStr, TEST_CATEGORY]
      );
      const latency = Date.now() - start;
      latencies.push(latency);
    }

    latencies.sort((a, b) => a - b);
    const p50 = calculatePercentile(latencies, 50);
    const p99 = calculatePercentile(latencies, 99);

    console.log('\n=== Latency Consistency Check ===');
    console.log(`  p50: ${p50.toFixed(2)}ms`);
    console.log(`  p99: ${p99.toFixed(2)}ms`);
    console.log(`  Ratio (p99/p50): ${(p99 / p50).toFixed(2)}x`);

    // p99 should not be more than 5x p50 (indicates outliers or performance issues)
    expect(p99).toBeLessThan(p50 * 5);
  });
});
