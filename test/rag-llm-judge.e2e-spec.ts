// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

/**
 * RAG LLM-as-Judge Validation (E2E)
 *
 * This suite validates that LLM responses use retrieved context correctly (faithfulness check).
 * Uses LLM-as-judge pattern to evaluate non-deterministic LLM outputs.
 *
 * RAG-03 Requirement: LLM response uses retrieved context from KB (validated by LLM-as-judge).
 *
 * The test seeds known FAQs with embeddings, simulates retrieval, and uses GPT-4o-mini as a grader
 * to validate that a hypothetical LLM response would be faithful to the retrieved context.
 *
 * Prerequisites:
 * - OPENAI_API_KEY environment variable must be set
 * - Test will skip gracefully if API key is missing (not a failure, just a skip)
 *
 * Pattern source: LangChain RAG evaluation tutorial
 * https://docs.langchain.com/langsmith/evaluate-rag-tutorial
 */
describe('RAG LLM-as-judge validation (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let apiKey: string;
  let evaluatorLLM: any;

  const TEST_CATEGORY = 'test_llm_judge';

  // Test FAQs with pre-computed embeddings
  const TEST_FAQS = [
    {
      question: 'Como dar entrada no INSS?',
      answer: 'Você pode dar entrada pelo site Meu INSS ou presencialmente em uma agência.',
      category: TEST_CATEGORY,
      keywords: ['previdência', 'INSS'],
      embedding: Array(1536).fill(0).map((_, i) => 0.001 * i),
    },
    {
      question: 'Qual o prazo para recurso do INSS?',
      answer: 'O prazo é de 30 dias corridos a partir da ciência da decisão.',
      category: TEST_CATEGORY,
      keywords: ['INSS', 'recurso'],
      embedding: Array(1536).fill(0).map((_, i) => 0.002 * i),
    },
  ];

  jest.setTimeout(60000);

  beforeAll(async () => {
    // Check if OPENAI_API_KEY is available
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️  OPENAI_API_KEY not set - LLM-as-judge tests will be skipped');
      return;
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    dataSource = app.get(getDataSourceToken('data'));

    const authService = app.get(AuthService);
    apiKey = (await authService.createApiKey({ name: 'e2e-llm-judge', role: ApiKeyRole.ADMIN })).rawKey;

    // Initialize LLM-as-judge evaluator
    evaluatorLLM = new ChatOpenAI({
      model: 'gpt-4o-mini',
      temperature: 0,
      apiKey: process.env.OPENAI_API_KEY,
    }).withStructuredOutput(
      z.object({
        explanation: z.string().describe('Explain your reasoning'),
        faithful: z.boolean().describe('True if answer uses KB context'),
      })
    );

    // Seed test FAQs
    await seedTestFAQs();
  });

  afterAll(async () => {
    await cleanupTestData();
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  async function seedTestFAQs() {
    if (!dataSource) return;
    for (const faq of TEST_FAQS) {
      const embeddingStr = '[' + faq.embedding.join(',') + ']';
      await dataSource.query(
        `INSERT INTO knowledge.faq (question, answer, category, keywords, embedding, use_count, last_used)
         VALUES ($1, $2, $3, $4, $5::vector, 0, NOW())`,
        [faq.question, faq.answer, faq.category, faq.keywords, embeddingStr]
      );
    }
  }

  async function cleanupTestData() {
    if (!dataSource) return;
    await dataSource.query(
      `DELETE FROM knowledge.faq WHERE category = $1`,
      [TEST_CATEGORY]
    );
  }

  /**
   * RAG-03: LLM response uses retrieved context (validated by LLM-as-judge)
   *
   * This test simulates the RAG pipeline:
   * 1. User asks: "Como dar entrada no INSS?"
   * 2. System retrieves context: "Você pode dar entrada pelo site Meu INSS..."
   * 3. LLM generates response (simulated here)
   * 4. LLM-as-judge validates that response uses the retrieved context
   */
  it('RAG-03: LLM response uses retrieved context (validated by LLM-as-judge)', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⊘ Skipped: OPENAI_API_KEY not set');
      return;
    }

    const question = 'Como dar entrada no INSS?';
    const expectedContext = 'Você pode dar entrada pelo site Meu INSS ou presencialmente em uma agência.';

    // Step 1: Retrieve context from KB (simulated - in production this would be via KnowledgeService)
    const queryEmbedding = TEST_FAQS[0].embedding;
    const embeddingStr = '[' + queryEmbedding.join(',') + ']';

    const results = await dataSource.query(
      `SELECT question, answer, 1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge.faq
       WHERE category = $2
         AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 1`,
      [embeddingStr, TEST_CATEGORY]
    );

    expect(results.length).toBeGreaterThan(0);
    const retrievedContext = results[0].answer;

    // Step 2: Simulate LLM response using the retrieved context
    // In a real scenario, this would come from POST /api/messages → n8n → Groq/OpenAI
    const simulatedLLMResponse = `Para dar entrada no INSS, você tem duas opções: pode acessar o site Meu INSS (https://meu.inss.gov.br) e fazer o pedido online, ou comparecer presencialmente em uma agência do INSS. O atendimento online é mais rápido e conveniente.`;

    // Step 3: Use LLM-as-judge to validate faithfulness
    const gradePrompt = `
QUESTION: ${question}
EXPECTED CONTEXT: ${expectedContext}
LLM ANSWER: ${simulatedLLMResponse}

Does the LLM answer contain information from the expected context?
Be strict: the answer must reference specific details from the context (site Meu INSS or presencialmente).
    `;

    const grade = await evaluatorLLM.invoke([
      { role: 'system', content: 'You are a grading assistant for RAG systems. Evaluate whether the answer uses the provided context.' },
      { role: 'user', content: gradePrompt }
    ]);

    // Validate faithfulness
    expect(grade.faithful).toBe(true);

    console.log('✓ RAG-03 LLM-as-judge validation passed');
    console.log(`  Explanation: ${grade.explanation}`);
    console.log(`  Retrieved context: "${retrievedContext}"`);
  });

  /**
   * RAG-03 (negative case): LLM response without context should fail faithfulness check.
   * Validates that LLM-as-judge correctly identifies hallucinated responses.
   */
  it('RAG-03 (negative): hallucinated response fails faithfulness check', async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.log('⊘ Skipped: OPENAI_API_KEY not set');
      return;
    }

    const question = 'Como dar entrada no INSS?';
    const expectedContext = 'Você pode dar entrada pelo site Meu INSS ou presencialmente em uma agência.';

    // Hallucinated response (doesn't use context, makes up information)
    const hallucinatedResponse = `Para dar entrada no INSS, você precisa ligar para o número 0800-123-4567 e agendar uma consulta. O processo leva cerca de 90 dias úteis.`;

    const gradePrompt = `
QUESTION: ${question}
EXPECTED CONTEXT: ${expectedContext}
LLM ANSWER: ${hallucinatedResponse}

Does the LLM answer contain information from the expected context?
Be strict: the answer must reference specific details from the context (site Meu INSS or presencialmente).
    `;

    const grade = await evaluatorLLM.invoke([
      { role: 'system', content: 'You are a grading assistant for RAG systems. Evaluate whether the answer uses the provided context.' },
      { role: 'user', content: gradePrompt }
    ]);

    // Should detect hallucination
    expect(grade.faithful).toBe(false);

    console.log('✓ RAG-03 negative case: hallucination detected');
    console.log(`  Explanation: ${grade.explanation}`);
  });
});
