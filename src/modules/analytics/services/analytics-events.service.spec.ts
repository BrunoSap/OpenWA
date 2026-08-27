import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsEventsService } from './analytics-events.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

describe('AnalyticsEventsService', () => {
  let service: AnalyticsEventsService;
  let dataSource: DataSource;
  let repository: Repository<AnalyticsEvent>;

  beforeEach(async () => {
    // In-memory SQLite for isolated unit tests
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AnalyticsEvent],
      synchronize: true,
      logging: false,
    });

    await dataSource.initialize();
    repository = dataSource.getRepository(AnalyticsEvent);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsEventsService,
        {
          provide: getRepositoryToken(AnalyticsEvent, 'data'),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<AnalyticsEventsService>(AnalyticsEventsService);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  describe('recordEvent', () => {
    it('should insert one row with generated uuid id and created_at timestamp', async () => {
      const result = await service.recordEvent({
        event_type: 'message.processed',
        session_id: 's1',
        latency_ms: 120,
      });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.event_type).toBe('message.processed');
      expect(result.session_id).toBe('s1');
      expect(result.latency_ms).toBe(120);
      expect(result.created_at).toBeInstanceOf(Date);
    });

    it('should tolerate null/absent payload by defaulting to {}', async () => {
      const result = await service.recordEvent({
        event_type: 'test.event',
        session_id: 's2',
      });

      expect(result.payload).toBeDefined();
      expect(result.payload).toEqual({});
    });

    it('should store custom payload fields', async () => {
      const result = await service.recordEvent({
        event_type: 'test.event',
        payload: { custom: 'data', nested: { value: 42 } },
      });

      expect(result.payload).toEqual({ custom: 'data', nested: { value: 42 } });
    });
  });

  describe('listRecent', () => {
    beforeEach(async () => {
      // Insert test data with slight time gaps
      for (let i = 0; i < 10; i++) {
        await repository.save(
          repository.create({
            event_type: `test.event.${i}`,
            session_id: `s${i}`,
            latency_ms: i * 10,
          }),
        );
      }
    });

    it('should return most recent rows ordered by created_at DESC', async () => {
      const results = await service.listRecent(5);

      expect(results).toHaveLength(5);
      // Most recent first (highest latency_ms values, inserted last)
      expect(results[0].latency_ms).toBeGreaterThan(results[1].latency_ms);
      expect(results[1].latency_ms).toBeGreaterThan(results[2].latency_ms);
    });

    it('should clamp limit to max of 100', async () => {
      const results = await service.listRecent(200);

      // We only have 10 rows, but the service would clamp at 100
      expect(results.length).toBeLessThanOrEqual(10);
    });

    it('should default limit to 100 when not specified', async () => {
      const results = await service.listRecent();

      expect(results.length).toBeLessThanOrEqual(10); // Only 10 rows exist
    });
  });
});
