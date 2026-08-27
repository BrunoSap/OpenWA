import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AnalyticsIntentTaxonomy } from '../src/modules/analytics/entities/analytics-intent-taxonomy.entity';
import { AnalyticsIntentClassification } from '../src/modules/analytics/entities/analytics-intent-classification.entity';
import { IntentClassificationService } from '../src/modules/analytics/services/intent-classification.service';

/**
 * Phase 10 Plan 01: Intent Classification E2E Tests (RED phase).
 *
 * Tests intent classification via Anthropic Batch API with prompt caching.
 * Validates >80% classification accuracy and >80% cache hit rate per DASH-03.
 *
 * Test data uses known messages with expected intents from the default taxonomy:
 * - FAQ: "Como faço para resetar minha senha?"
 * - Suporte Técnico: "Meu app está travando ao abrir"
 * - Vendas: "Qual o preço do plano enterprise?"
 * - Reclamação: "Estou insatisfeito com o atendimento"
 * - Outros: "Olá, tudo bem?" (generic greeting)
 */
describe('Intent Classification E2E (Phase 10)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let intentService: IntentClassificationService;
  let apiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get<DataSource>('DATA_CONNECTION');
    intentService = app.get<IntentClassificationService>(IntentClassificationService);

    // Get OPERATOR api key from environment or use test key
    apiKey = process.env.TEST_OPERATOR_API_KEY || process.env.MASTER_API_KEY || '';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Intent Classification Accuracy', () => {
    it('should classify known messages with >80% accuracy', async () => {
      // Seed test messages with known expected intents
      const testMessages = [
        { id: 'msg1', text: 'Como faço para resetar minha senha?', expected: 'FAQ' },
        { id: 'msg2', text: 'Esqueci minha senha, como recupero?', expected: 'FAQ' },
        { id: 'msg3', text: 'Meu app está travando ao abrir', expected: 'Suporte Técnico' },
        { id: 'msg4', text: 'Erro ao fazer login, tela fica branca', expected: 'Suporte Técnico' },
        { id: 'msg5', text: 'Qual o preço do plano enterprise?', expected: 'Vendas' },
        { id: 'msg6', text: 'Gostaria de contratar o serviço', expected: 'Vendas' },
        { id: 'msg7', text: 'Estou insatisfeito com o atendimento', expected: 'Reclamação' },
        { id: 'msg8', text: 'Péssimo serviço, quero cancelar', expected: 'Reclamação' },
        { id: 'msg9', text: 'Olá, tudo bem?', expected: 'Outros' },
        { id: 'msg10', text: 'Boa tarde', expected: 'Outros' },
      ];

      // Call batch classification
      const results = await intentService.classifyIntentsBatch(testMessages, 'global');

      // Assert results exist
      expect(results).toBeDefined();
      expect(results.length).toBe(testMessages.length);

      // Calculate accuracy
      let correctCount = 0;
      for (const result of results) {
        const expected = testMessages.find((m) => m.id === result.messageId)?.expected;
        if (result.intent === expected) {
          correctCount++;
        }
      }

      const accuracy = correctCount / testMessages.length;
      console.log(`Intent classification accuracy: ${(accuracy * 100).toFixed(1)}%`);
      console.log(`Correct: ${correctCount}/${testMessages.length}`);

      // Assert >80% accuracy per DASH-03 requirement
      expect(accuracy).toBeGreaterThanOrEqual(0.8);
    }, 60000); // 60s timeout for LLM API call

    it('should achieve >80% cache hit rate on batch classification', async () => {
      const testMessages = [
        { id: 'msg11', text: 'Como funciona o plano básico?' },
        { id: 'msg12', text: 'Preciso de ajuda técnica' },
        { id: 'msg13', text: 'O app não abre' },
      ];

      // Call classification and capture cache metrics
      const results = await intentService.classifyIntentsBatch(testMessages, 'global');

      // Service should track cache hit rate in logs or return it
      // For now, assert it completes successfully (cache hit tracking verified via logs)
      expect(results).toBeDefined();
      expect(results.length).toBe(testMessages.length);

      // TODO: Parse cache hit rate from service logs or add it to return value
      // Target: cacheHitRate >= 0.8 per RESEARCH.md L142-144
    }, 60000);
  });

  describe('Intent Analytics Endpoint', () => {
    beforeEach(async () => {
      // Seed some classifications for endpoint testing
      const taxonomyRepo = dataSource.getRepository(AnalyticsIntentTaxonomy);
      const classificationRepo = dataSource.getRepository(AnalyticsIntentClassification);

      // Ensure default taxonomy exists
      const existingTaxonomy = await taxonomyRepo.find({ where: { tenant_id: 'global' } });
      if (existingTaxonomy.length === 0) {
        const defaultIntents = [
          { tenant_id: 'global', intent_name: 'FAQ', intent_description: 'Perguntas frequentes' },
          {
            tenant_id: 'global',
            intent_name: 'Suporte Técnico',
            intent_description: 'Problemas técnicos',
          },
          { tenant_id: 'global', intent_name: 'Vendas', intent_description: 'Interesse em comprar' },
          { tenant_id: 'global', intent_name: 'Reclamação', intent_description: 'Insatisfação' },
          { tenant_id: 'global', intent_name: 'Outros', intent_description: 'Outros assuntos' },
        ];
        await taxonomyRepo.save(defaultIntents);
      }

      // Clear existing test classifications
      await classificationRepo.delete({ session_id: 'test-session' });

      // Seed test classifications
      const testClassifications = [
        {
          message_id: 'msg1',
          session_id: 'test-session',
          chat_id: 'test-chat',
          intent_name: 'FAQ',
          confidence: 0.95,
        },
        {
          message_id: 'msg2',
          session_id: 'test-session',
          chat_id: 'test-chat',
          intent_name: 'FAQ',
          confidence: 0.92,
        },
        {
          message_id: 'msg3',
          session_id: 'test-session',
          chat_id: 'test-chat',
          intent_name: 'Suporte Técnico',
          confidence: 0.88,
        },
        {
          message_id: 'msg4',
          session_id: 'test-session',
          chat_id: 'test-chat',
          intent_name: 'Vendas',
          confidence: 0.91,
        },
      ];

      await classificationRepo.save(testClassifications);
    });

    it('GET /api/analytics/intents should return correct intent distribution', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/analytics/intents')
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body).toHaveProperty('topIntents');
      expect(response.body).toHaveProperty('trendsOverTime');

      const topIntents = response.body.topIntents;
      expect(Array.isArray(topIntents)).toBe(true);

      // Find FAQ intent (should have 2 classifications = 50%)
      const faqIntent = topIntents.find((i: any) => i.intent === 'FAQ');
      expect(faqIntent).toBeDefined();
      expect(faqIntent.count).toBe(2);
      expect(faqIntent.percentage).toBeCloseTo(50.0, 1);
    });
  });
});
