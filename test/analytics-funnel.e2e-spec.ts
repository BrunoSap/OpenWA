import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from '../src/modules/analytics/analytics.module';
import { AnalyticsEvent } from '../src/modules/analytics/entities/analytics-event.entity';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

/**
 * Phase 10 Plan 02 Task 3: E2E tests for funnel analytics and A/B experiments (DASH-04).
 *
 * Tests funnel stage tracking accuracy, A/B variant consistency, and conversion recommendations.
 */
describe('Funnel Analytics E2E', () => {
  let app: INestApplication;
  let eventRepository: Repository<AnalyticsEvent>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [AnalyticsEvent],
          synchronize: true,
        }),
        AnalyticsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    eventRepository = moduleFixture.get<Repository<AnalyticsEvent>>(
      getRepositoryToken(AnalyticsEvent, 'data'),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /analytics/funnel', () => {
    it('should track funnel stages and compute drop-off rates', async () => {
      // Seed funnel events: 100 initiated → 70 qualified → 50 data_collected → 40 exported → 20 converted
      const baseDate = new Date('2026-08-15');

      for (let i = 0; i < 100; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-${i}`,
          session_id: 'test-session',
          chat_id: `chat-${i}`,
          payload: { stage: 'initiated', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      for (let i = 0; i < 70; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-${i}`,
          session_id: 'test-session',
          chat_id: `chat-${i}`,
          payload: { stage: 'qualified', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      for (let i = 0; i < 50; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-${i}`,
          session_id: 'test-session',
          chat_id: `chat-${i}`,
          payload: { stage: 'data_collected', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      for (let i = 0; i < 40; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-${i}`,
          session_id: 'test-session',
          chat_id: `chat-${i}`,
          payload: { stage: 'exported', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      for (let i = 0; i < 20; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-${i}`,
          session_id: 'test-session',
          chat_id: `chat-${i}`,
          payload: { stage: 'converted', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      const response = await request(app.getHttpServer())
        .get('/analytics/funnel')
        .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
        .expect(200);

      expect(response.body.overallConversion).toMatchObject({
        initiated: 100,
        qualified: 70,
        data_collected: 50,
        exported: 40,
        converted: 20,
      });

      expect(response.body.overallConversion.conversionRate).toBeCloseTo(0.20, 2);
    });

    it('should show A/B variant stats with different conversion rates', async () => {
      // Clear previous data
      await eventRepository.clear();

      const baseDate = new Date('2026-08-15');

      // Variant 0 (control): 100 → 20 (20% conversion)
      for (let i = 0; i < 100; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-control-${i}`,
          session_id: 'test-session',
          chat_id: `chat-control-${i}`,
          payload: { stage: 'initiated', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      for (let i = 0; i < 20; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-control-${i}`,
          session_id: 'test-session',
          chat_id: `chat-control-${i}`,
          payload: { stage: 'converted', variantId: 'variant_0' },
          created_at: baseDate,
        });
      }

      // Variant 1 (treatment): 100 → 30 (30% conversion - 50% better)
      for (let i = 0; i < 100; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-treatment-${i}`,
          session_id: 'test-session',
          chat_id: `chat-treatment-${i}`,
          payload: { stage: 'initiated', variantId: 'variant_1' },
          created_at: baseDate,
        });
      }

      for (let i = 0; i < 30; i++) {
        await eventRepository.save({
          event_type: 'funnel.stage_entered',
          user_id: `user-treatment-${i}`,
          session_id: 'test-session',
          chat_id: `chat-treatment-${i}`,
          payload: { stage: 'converted', variantId: 'variant_1' },
          created_at: baseDate,
        });
      }

      const response = await request(app.getHttpServer())
        .get('/analytics/funnel')
        .query({ startDate: '2026-08-01', endDate: '2026-08-31' })
        .expect(200);

      expect(response.body.byVariant).toHaveLength(2);

      const control = response.body.byVariant.find((v: any) => v.variantId === 'variant_0');
      const treatment = response.body.byVariant.find((v: any) => v.variantId === 'variant_1');

      expect(control.conversionRate).toBeCloseTo(0.20, 2);
      expect(treatment.conversionRate).toBeCloseTo(0.30, 2);

      // Should have recommendation since treatment is 50% better
      expect(response.body.recommendations.length).toBeGreaterThan(0);
      expect(response.body.recommendations[0]).toContain('variant_1');
      expect(response.body.recommendations[0]).toContain('higher conversion');
    });
  });

  describe('POST /analytics/experiments', () => {
    it('should create A/B experiment with validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/analytics/experiments')
        .send({
          experiment_id: 'intake-flow-v3',
          name: 'Test Simplified Flow',
          description: 'Testing simplified intake questions',
          variant_count: 2,
          variant_names: ['control', 'simplified'],
          start_date: '2026-08-20T00:00:00Z',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        experiment_id: 'intake-flow-v3',
        name: 'Test Simplified Flow',
        variant_count: 2,
        active: true,
      });
    });

    it('should reject experiment with start_date >= end_date', async () => {
      await request(app.getHttpServer())
        .post('/analytics/experiments')
        .send({
          experiment_id: 'invalid-experiment',
          name: 'Invalid Experiment',
          variant_count: 2,
          start_date: '2026-08-20T00:00:00Z',
          end_date: '2026-08-15T00:00:00Z', // Before start_date
        })
        .expect(500); // Error thrown
    });

    it('should reject experiment with variant_count < 2', async () => {
      await request(app.getHttpServer())
        .post('/analytics/experiments')
        .send({
          experiment_id: 'invalid-variant-count',
          name: 'Invalid Variant Count',
          variant_count: 1, // Less than 2
          start_date: '2026-08-20T00:00:00Z',
        })
        .expect(400); // Validation error
    });
  });
});
