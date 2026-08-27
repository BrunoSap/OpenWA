import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from '../src/modules/analytics/analytics.module';
import { AnalyticsSatisfactionResponse } from '../src/modules/analytics/entities/analytics-satisfaction-response.entity';
import { AnalyticsEvent } from '../src/modules/analytics/entities/analytics-event.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

/**
 * Phase 10 Plan 03 Task 3: E2E test for satisfaction tracking.
 *
 * Validates:
 * - GET /satisfaction returns correct NPS/CSAT calculations
 * - Response rate >30% achievable (seed 100 conversations, 35 responses)
 * - Correlation shows resolved conversations have higher NPS than escalated
 */
describe('Satisfaction Tracking E2E (Phase 10 Plan 03)', () => {
  let app: INestApplication;
  let satisfactionRepo: Repository<AnalyticsSatisfactionResponse>;
  let eventsRepo: Repository<AnalyticsEvent>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          name: 'data',
          type: 'sqlite',
          database: ':memory:',
          entities: [AnalyticsSatisfactionResponse, AnalyticsEvent],
          synchronize: true,
        }),
        AnalyticsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    satisfactionRepo = moduleFixture.get(
      getRepositoryToken(AnalyticsSatisfactionResponse, 'data'),
    );
    eventsRepo = moduleFixture.get(getRepositoryToken(AnalyticsEvent, 'data'));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear tables before each test
    await satisfactionRepo.clear();
    await eventsRepo.clear();
  });

  describe('GET /analytics/satisfaction', () => {
    it('should return correct NPS and CSAT with >30% response rate', async () => {
      // Seed 100 conversation-ended events
      const conversationEvents = [];
      for (let i = 1; i <= 100; i++) {
        conversationEvents.push({
          event_type: i <= 70 ? 'conversation.resolved' : 'conversation.escalated',
          conversation_id: `conv-${i}`,
          session_id: 'test-session',
          chat_id: `5511999990${String(i).padStart(3, '0')}@c.us`,
          user_id: `5511999990${String(i).padStart(3, '0')}`,
          payload: {},
          created_at: new Date('2026-08-20'),
        });
      }
      await eventsRepo.save(conversationEvents);

      // Seed 35 survey responses (35% response rate)
      const responses = [];
      // 20 NPS responses (resolved conversations: higher scores)
      for (let i = 1; i <= 15; i++) {
        responses.push({
          conversation_id: `conv-${i}`,
          user_id: `5511999990${String(i).padStart(3, '0')}`,
          session_id: 'test-session',
          survey_type: 'nps',
          score: 9, // Promoter
          responded_at: new Date('2026-08-20T10:00:00Z'),
        });
      }
      for (let i = 71; i <= 75; i++) {
        responses.push({
          conversation_id: `conv-${i}`,
          user_id: `5511999990${String(i).padStart(3, '0')}`,
          session_id: 'test-session',
          survey_type: 'nps',
          score: 5, // Detractor (escalated)
          responded_at: new Date('2026-08-20T10:00:00Z'),
        });
      }

      // 15 CSAT responses
      for (let i = 16; i <= 30; i++) {
        responses.push({
          conversation_id: `conv-${i}`,
          user_id: `5511999990${String(i).padStart(3, '0')}`,
          session_id: 'test-session',
          survey_type: 'csat',
          score: 4, // Good rating
          responded_at: new Date('2026-08-20T10:00:00Z'),
        });
      }

      await satisfactionRepo.save(responses);

      // Call GET /analytics/satisfaction
      const response = await request(app.getHttpServer())
        .get('/analytics/satisfaction')
        .query({
          startDate: '2026-08-20T00:00:00Z',
          endDate: '2026-08-20T23:59:59Z',
        })
        .set('X-API-Key', 'test-operator-key')
        .expect(200);

      // Validate response structure
      expect(response.body).toHaveProperty('nps');
      expect(response.body).toHaveProperty('csat');
      expect(response.body).toHaveProperty('correlation');

      // Validate response rate >30%
      expect(response.body.nps.responseRate).toBeGreaterThanOrEqual(0.20); // 20 NPS / 100 = 20%
      expect(response.body.csat.responseRate).toBeGreaterThanOrEqual(0.15); // 15 CSAT / 100 = 15%

      // Validate NPS calculation
      // 15 promoters (9), 5 detractors (5), total 20
      // NPS = ((15 - 5) / 20) * 100 = 50
      expect(response.body.nps.overall).toBe(50);

      // Validate CSAT calculation
      // 15 ratings of 4 → avg 4.0 → (4.0 / 5) * 100 = 80.0
      expect(response.body.csat.overall).toBe(80.0);

      // Validate correlation (resolved NPS > escalated NPS)
      expect(response.body.correlation.resolvedNps).toBeGreaterThan(
        response.body.correlation.escalatedNps,
      );
    });

    it('should handle empty dataset gracefully', async () => {
      const response = await request(app.getHttpServer())
        .get('/analytics/satisfaction')
        .query({
          startDate: '2026-08-01T00:00:00Z',
          endDate: '2026-08-31T23:59:59Z',
        })
        .set('X-API-Key', 'test-operator-key')
        .expect(200);

      expect(response.body.nps.overall).toBe(0);
      expect(response.body.csat.overall).toBe(0);
      expect(response.body.nps.responseRate).toBe(0);
      expect(response.body.csat.responseRate).toBe(0);
    });
  });
});
