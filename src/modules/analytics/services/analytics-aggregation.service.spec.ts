import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsAggregationService } from './analytics-aggregation.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { AnalyticsAggregate } from '../entities/analytics-aggregate.entity';

describe('AnalyticsAggregationService', () => {
  let service: AnalyticsAggregationService;
  let eventRepository: Repository<AnalyticsEvent>;
  let aggregateRepository: Repository<AnalyticsAggregate>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAggregationService,
        {
          provide: getRepositoryToken(AnalyticsEvent, 'data'),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AnalyticsAggregate, 'data'),
          useValue: {
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsAggregationService>(AnalyticsAggregationService);
    eventRepository = module.get(getRepositoryToken(AnalyticsEvent, 'data'));
    aggregateRepository = module.get(getRepositoryToken(AnalyticsAggregate, 'data'));
  });

  describe('computeAggregates', () => {
    it('should compute aggregates for one session with correct counts', async () => {
      const start = new Date('2026-08-27T00:00:00Z');
      const end = new Date('2026-08-27T23:59:59Z');

      // Seed events: 3 conversations_started, 2 resolved, 5 messages, 2 fallbacks
      const mockEvents: Partial<AnalyticsEvent>[] = [
        { event_type: 'conversation.started', session_id: 'session1', created_at: start },
        { event_type: 'conversation.started', session_id: 'session1', created_at: start },
        { event_type: 'conversation.started', session_id: 'session1', created_at: start },
        { event_type: 'conversation.resolved', session_id: 'session1', created_at: start },
        { event_type: 'conversation.resolved', session_id: 'session1', created_at: start },
        { event_type: 'message.processed', session_id: 'session1', latency_ms: 100, created_at: start },
        { event_type: 'message.processed', session_id: 'session1', latency_ms: 200, created_at: start },
        { event_type: 'message.processed', session_id: 'session1', latency_ms: 300, created_at: start },
        { event_type: 'message.processed', session_id: 'session1', latency_ms: 400, created_at: start },
        { event_type: 'message.processed', session_id: 'session1', latency_ms: 500, created_at: start },
        { event_type: 'fallback.triggered', session_id: 'session1', created_at: start },
        { event_type: 'fallback.triggered', session_id: 'session1', created_at: start },
        { event_type: 'llm.called', session_id: 'session1', tokens_used: 1000, cost_usd: 0.5, created_at: start },
        { event_type: 'llm.called', session_id: 'session1', tokens_used: 500, cost_usd: 0.25, created_at: start },
      ];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents as AnalyticsEvent[]);

      const result = await service.computeAggregates(start, end, 'day');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        session_id: 'session1',
        conversations_started: 3,
        conversations_resolved: 2,
        messages_processed: 5,
        fallbacks_triggered: 2,
        tokens_total: 1500,
        cost_total_usd: 0.75,
      });

      // Percentiles: [100, 200, 300, 400, 500] -> p50=300, p95=480, p99=496
      expect(result[0].latency_p50_ms).toBe(300);
      expect(result[0].latency_p95_ms).toBe(480);
      expect(result[0].latency_p99_ms).toBe(496);

      // Resolution rate: 2/3 * 100 = 66.67
      expect(result[0].resolution_rate).toBeCloseTo(66.67, 2);

      // Fallback rate: 2/5 * 100 = 40.00
      expect(result[0].fallback_rate).toBeCloseTo(40.0, 2);
    });

    it('should return null resolution_rate when conversations_started is 0', async () => {
      const start = new Date('2026-08-27T00:00:00Z');
      const end = new Date('2026-08-27T23:59:59Z');

      // No conversation.started events
      const mockEvents: Partial<AnalyticsEvent>[] = [
        { event_type: 'message.processed', session_id: 'session1', created_at: start },
      ];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents as AnalyticsEvent[]);

      const result = await service.computeAggregates(start, end, 'day');

      expect(result).toHaveLength(1);
      expect(result[0].resolution_rate).toBeUndefined();
    });

    it('should handle multiple sessions separately', async () => {
      const start = new Date('2026-08-27T00:00:00Z');
      const end = new Date('2026-08-27T23:59:59Z');

      const mockEvents: Partial<AnalyticsEvent>[] = [
        { event_type: 'conversation.started', session_id: 'session1', created_at: start },
        { event_type: 'conversation.started', session_id: 'session2', created_at: start },
        { event_type: 'conversation.resolved', session_id: 'session1', created_at: start },
      ];

      jest.spyOn(eventRepository, 'find').mockResolvedValue(mockEvents as AnalyticsEvent[]);

      const result = await service.computeAggregates(start, end, 'day');

      expect(result).toHaveLength(2);
      const session1 = result.find((r) => r.session_id === 'session1');
      const session2 = result.find((r) => r.session_id === 'session2');

      expect(session1?.conversations_started).toBe(1);
      expect(session1?.conversations_resolved).toBe(1);
      expect(session2?.conversations_started).toBe(1);
      expect(session2?.conversations_resolved).toBe(0);
    });

    it('should handle empty event set', async () => {
      const start = new Date('2026-08-27T00:00:00Z');
      const end = new Date('2026-08-27T23:59:59Z');

      jest.spyOn(eventRepository, 'find').mockResolvedValue([]);

      const result = await service.computeAggregates(start, end, 'day');

      expect(result).toEqual([]);
    });
  });
});
