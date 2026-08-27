import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FunnelAnalyticsService } from './funnel-analytics.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

describe('FunnelAnalyticsService', () => {
  let service: FunnelAnalyticsService;
  let repository: Repository<AnalyticsEvent>;

  const mockRepository = {
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FunnelAnalyticsService,
        {
          provide: getRepositoryToken(AnalyticsEvent, 'data'),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<FunnelAnalyticsService>(FunnelAnalyticsService);
    repository = module.get<Repository<AnalyticsEvent>>(
      getRepositoryToken(AnalyticsEvent, 'data'),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('computeFunnelStats', () => {
    it('should compute drop-off rates correctly with seeded data', async () => {
      // Mock query builder chain
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn(),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      // Seed data: 100 initiated → 70 qualified → 50 data_collected → 40 exported → 20 converted
      // Expected drop-off rates:
      // initiated → qualified: 1 - (70/100) = 0.30 (30%)
      // qualified → data_collected: 1 - (50/70) = 0.285... (28.5%)
      // data_collected → exported: 1 - (40/50) = 0.20 (20%)
      // exported → converted: 1 - (20/40) = 0.50 (50%)
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { stage: 'initiated', users: '100', stage_order: 1 },
        { stage: 'qualified', users: '70', stage_order: 2 },
        { stage: 'data_collected', users: '50', stage_order: 3 },
        { stage: 'exported', users: '40', stage_order: 4 },
        { stage: 'converted', users: '20', stage_order: 5 },
      ]);

      const startDate = new Date('2026-08-01');
      const endDate = new Date('2026-08-31');

      const result = await service.computeFunnelStats(startDate, endDate);

      expect(result).toHaveLength(5);

      // Stage 1: initiated (no previous stage, so no drop-off)
      expect(result[0]).toMatchObject({
        stage: 'initiated',
        users: 100,
        dropOffRate: null,
        previousStageUsers: null,
      });

      // Stage 2: qualified
      expect(result[1]).toMatchObject({
        stage: 'qualified',
        users: 70,
        previousStageUsers: 100,
      });
      expect(result[1].dropOffRate).toBeCloseTo(0.30, 2);

      // Stage 3: data_collected
      expect(result[2]).toMatchObject({
        stage: 'data_collected',
        users: 50,
        previousStageUsers: 70,
      });
      expect(result[2].dropOffRate).toBeCloseTo(0.285, 2);

      // Stage 4: exported
      expect(result[3]).toMatchObject({
        stage: 'exported',
        users: 40,
        previousStageUsers: 50,
      });
      expect(result[3].dropOffRate).toBeCloseTo(0.20, 2);

      // Stage 5: converted
      expect(result[4]).toMatchObject({
        stage: 'converted',
        users: 20,
        previousStageUsers: 40,
      });
      expect(result[4].dropOffRate).toBeCloseTo(0.50, 2);
    });

    it('should filter by variantId when provided', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const startDate = new Date('2026-08-01');
      const endDate = new Date('2026-08-31');
      const variantId = 'variant_0';

      await service.computeFunnelStats(startDate, endDate, variantId);

      // Check that andWhere was called with variantId filter (it's the 3rd call after date filters)
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        "event.payload->>'variantId' = :variantId",
        { variantId },
      );
    });
  });

  describe('getConversionRecommendations', () => {
    it('should return recommendations when variant A has >10% better conversion than variant B', () => {
      const overallStats = {
        initiated: 200,
        qualified: 140,
        data_collected: 100,
        exported: 80,
        converted: 50,
        conversionRate: 0.25,
      };

      const byVariant = [
        {
          variantId: 'control',
          stages: [],
          conversionRate: 0.20,
        },
        {
          variantId: 'treatment',
          stages: [],
          conversionRate: 0.25,
        },
      ];

      const recommendations = service.getConversionRecommendations(overallStats, byVariant);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0]).toContain('treatment');
      expect(recommendations[0]).toContain('25%');
      expect(recommendations[0]).toContain('higher conversion');
    });

    it('should return empty array when variant delta is <10%', () => {
      const overallStats = {
        initiated: 200,
        qualified: 140,
        data_collected: 100,
        exported: 80,
        converted: 50,
        conversionRate: 0.22,
      };

      const byVariant = [
        {
          variantId: 'control',
          stages: [],
          conversionRate: 0.20,
        },
        {
          variantId: 'treatment',
          stages: [],
          conversionRate: 0.21,
        },
      ];

      const recommendations = service.getConversionRecommendations(overallStats, byVariant);

      expect(recommendations).toHaveLength(0);
    });
  });
});
