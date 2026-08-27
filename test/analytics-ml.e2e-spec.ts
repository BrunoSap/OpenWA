import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AnalyticsEvent } from '../src/modules/analytics/entities/analytics-event.entity';
import { MLModelVersion } from '../src/modules/analytics/entities/ml-model-version.entity';

describe('Predictive Analytics E2E (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let operatorApiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get data source
    dataSource = app.get<DataSource>('DataConnection');

    // Get operator API key from environment
    operatorApiKey = process.env.TEST_OPERATOR_API_KEY || 'test-operator-key';
  });

  afterAll(async () => {
    await app.close();
  });

  describe('ML Model Training', () => {
    it('should train outcome model and achieve >70% accuracy', async () => {
      // Seed 200 conversations with distinct feature patterns
      const analyticsEventRepo = dataSource.getRepository(AnalyticsEvent);

      // 100 escalated conversations (high fallback, low latency, negative sentiment)
      for (let i = 0; i < 100; i++) {
        const convId = `conv-escalated-${i}`;

        // Message events (high count for escalated)
        for (let j = 0; j < 8; j++) {
          await analyticsEventRepo.save({
            event_type: 'message.processed',
            conversation_id: convId,
            session_id: 'test-session',
            chat_id: `user-${i}@c.us`,
            user_id: `user-${i}`,
            latency_ms: 500 + Math.random() * 500, // Low latency (500-1000ms)
            payload: { user_message_length: 100 + Math.random() * 50 },
            created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          });
        }

        // Fallback events (high count)
        for (let j = 0; j < 4; j++) {
          await analyticsEventRepo.save({
            event_type: 'fallback.triggered',
            conversation_id: convId,
            session_id: 'test-session',
            chat_id: `user-${i}@c.us`,
            user_id: `user-${i}`,
            created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          });
        }

        // LLM calls
        for (let j = 0; j < 3; j++) {
          await analyticsEventRepo.save({
            event_type: 'llm.called',
            conversation_id: convId,
            session_id: 'test-session',
            chat_id: `user-${i}@c.us`,
            user_id: `user-${i}`,
            created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          });
        }

        // Escalated event
        await analyticsEventRepo.save({
          event_type: 'conversation.escalated',
          conversation_id: convId,
          session_id: 'test-session',
          chat_id: `user-${i}@c.us`,
          user_id: `user-${i}`,
          created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        });
      }

      // 100 resolved conversations (low fallback, high latency, positive sentiment)
      for (let i = 0; i < 100; i++) {
        const convId = `conv-resolved-${i}`;

        // Message events (lower count for resolved)
        for (let j = 0; j < 4; j++) {
          await analyticsEventRepo.save({
            event_type: 'message.processed',
            conversation_id: convId,
            session_id: 'test-session',
            chat_id: `user-resolved-${i}@c.us`,
            user_id: `user-resolved-${i}`,
            latency_ms: 2000 + Math.random() * 1000, // High latency (2000-3000ms)
            payload: { user_message_length: 50 + Math.random() * 30 },
            created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          });
        }

        // Fallback events (low count)
        for (let j = 0; j < 1; j++) {
          await analyticsEventRepo.save({
            event_type: 'fallback.triggered',
            conversation_id: convId,
            session_id: 'test-session',
            chat_id: `user-resolved-${i}@c.us`,
            user_id: `user-resolved-${i}`,
            created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          });
        }

        // LLM calls (higher count)
        for (let j = 0; j < 6; j++) {
          await analyticsEventRepo.save({
            event_type: 'llm.called',
            conversation_id: convId,
            session_id: 'test-session',
            chat_id: `user-resolved-${i}@c.us`,
            user_id: `user-resolved-${i}`,
            created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          });
        }

        // Resolved event (no escalation)
        await analyticsEventRepo.save({
          event_type: 'conversation.resolved',
          conversation_id: convId,
          session_id: 'test-session',
          chat_id: `user-resolved-${i}@c.us`,
          user_id: `user-resolved-${i}`,
          created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        });
      }

      // Trigger training job manually (simulate BullMQ processor)
      const response = await request(app.getHttpServer())
        .post('/analytics/train/outcome-model')
        .set('X-API-Key', operatorApiKey)
        .expect(201);

      // Verify model version created with accuracy >= 0.70
      const mlModelVersionRepo = dataSource.getRepository(MLModelVersion);
      const latestModel = await mlModelVersionRepo.findOne({
        where: { model_name: 'outcome-model', active: true },
        order: { created_at: 'DESC' },
      });

      expect(latestModel).toBeDefined();
      expect(latestModel.accuracy).toBeGreaterThanOrEqual(0.70);
      expect(latestModel.dataset_size).toBeGreaterThanOrEqual(100);
    }, 120000); // 2 minute timeout for training
  });

  describe('POST /analytics/predict/outcome', () => {
    it('should predict outcome for active conversation with high escalation features', async () => {
      // Seed conversation with high escalation risk (high fallback, low latency)
      const analyticsEventRepo = dataSource.getRepository(AnalyticsEvent);
      const convId = 'conv-test-high-risk';

      // 10 messages with low latency
      for (let i = 0; i < 10; i++) {
        await analyticsEventRepo.save({
          event_type: 'message.processed',
          conversation_id: convId,
          session_id: 'test-session',
          chat_id: 'test-user@c.us',
          user_id: 'test-user',
          latency_ms: 600,
          payload: { user_message_length: 120 },
          created_at: new Date(Date.now() - (10 - i) * 60 * 1000),
        });
      }

      // 5 fallbacks (high)
      for (let i = 0; i < 5; i++) {
        await analyticsEventRepo.save({
          event_type: 'fallback.triggered',
          conversation_id: convId,
          session_id: 'test-session',
          chat_id: 'test-user@c.us',
          user_id: 'test-user',
          created_at: new Date(Date.now() - (5 - i) * 120 * 1000),
        });
      }

      // Call prediction endpoint
      const response = await request(app.getHttpServer())
        .post('/analytics/predict/outcome')
        .set('X-API-Key', operatorApiKey)
        .send({ conversationId: convId })
        .expect(200);

      // Verify prediction structure
      expect(response.body.conversationId).toBe(convId);
      expect(response.body.prediction).toBeDefined();
      expect(response.body.prediction.willEscalate).toBeDefined();
      expect(typeof response.body.prediction.probability).toBe('number');
      expect(response.body.prediction.confidence).toMatch(/^(low|medium|high)$/);
      expect(response.body.recommendation).toBeDefined();

      // With high fallback count, expect high probability of escalation
      expect(response.body.prediction.probability).toBeGreaterThan(0.5);
    });
  });

  describe('GET /analytics/anomalies', () => {
    it('should detect anomaly from unusual fallback spike', async () => {
      // Seed normal hourly aggregates (fallback_rate ~5%)
      const analyticsEventRepo = dataSource.getRepository(AnalyticsEvent);
      const now = new Date();

      // 23 normal hours
      for (let i = 1; i <= 23; i++) {
        const hour = new Date(now.getTime() - i * 60 * 60 * 1000);

        // 100 messages per hour
        for (let j = 0; j < 100; j++) {
          await analyticsEventRepo.save({
            event_type: 'message.processed',
            conversation_id: `conv-normal-${i}-${j}`,
            session_id: 'test-session',
            chat_id: `user-${j}@c.us`,
            user_id: `user-${j}`,
            created_at: hour,
          });
        }

        // 5 fallbacks per hour (~5% rate)
        for (let j = 0; j < 5; j++) {
          await analyticsEventRepo.save({
            event_type: 'fallback.triggered',
            conversation_id: `conv-normal-${i}-${j}`,
            session_id: 'test-session',
            chat_id: `user-${j}@c.us`,
            user_id: `user-${j}`,
            created_at: hour,
          });
        }
      }

      // 1 spike hour (fallback_rate 25%)
      const spikeHour = new Date(now.getTime() - 60 * 60 * 1000);
      for (let j = 0; j < 100; j++) {
        await analyticsEventRepo.save({
          event_type: 'message.processed',
          conversation_id: `conv-spike-${j}`,
          session_id: 'test-session',
          chat_id: `user-${j}@c.us`,
          user_id: `user-${j}`,
          created_at: spikeHour,
        });
      }

      for (let j = 0; j < 25; j++) {
        await analyticsEventRepo.save({
          event_type: 'fallback.triggered',
          conversation_id: `conv-spike-${j}`,
          session_id: 'test-session',
          chat_id: `user-${j}@c.us`,
          user_id: `user-${j}`,
          created_at: spikeHour,
        });
      }

      // Call anomalies endpoint
      const response = await request(app.getHttpServer())
        .get('/analytics/anomalies?hours=24')
        .set('X-API-Key', operatorApiKey)
        .expect(200);

      // Verify anomalies structure
      expect(response.body.anomalies).toBeDefined();
      expect(Array.isArray(response.body.anomalies)).toBe(true);

      // Verify at least one anomaly detected for spike hour
      const anomaly = response.body.anomalies.find((a) => a.isAnomaly === true);
      expect(anomaly).toBeDefined();
      expect(anomaly.metric).toBeDefined();
      expect(anomaly.score).toBeGreaterThan(0);
    });
  });
});
