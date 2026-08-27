import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ABTestingService } from './ab-testing.service';
import { AnalyticsABExperiment } from '../entities/analytics-ab-experiment.entity';

describe('ABTestingService', () => {
  let service: ABTestingService;
  let repository: Repository<AnalyticsABExperiment>;

  const mockRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ABTestingService,
        {
          provide: getRepositoryToken(AnalyticsABExperiment, 'data'),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ABTestingService>(ABTestingService);
    repository = module.get<Repository<AnalyticsABExperiment>>(
      getRepositoryToken(AnalyticsABExperiment, 'data'),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignVariant', () => {
    it('should return same variant for same user+experiment combination across multiple calls', () => {
      const userId = 'user-123';
      const experimentId = 'intake-flow-v2';
      const variantCount = 2;

      const results: string[] = [];
      for (let i = 0; i < 10; i++) {
        const variant = service.assignVariant(userId, experimentId, variantCount);
        results.push(variant);
      }

      // All 10 calls should return the same variant
      const uniqueVariants = new Set(results);
      expect(uniqueVariants.size).toBe(1);
      expect(results[0]).toMatch(/^variant_[0-1]$/);
    });

    it('should produce uniform variant distribution across many users', () => {
      const experimentId = 'intake-flow-v2';
      const variantCount = 2;
      const userCount = 1000;

      const variantCounts: Record<string, number> = {};

      for (let i = 0; i < userCount; i++) {
        const userId = `user-${i}`;
        const variant = service.assignVariant(userId, experimentId, variantCount);
        variantCounts[variant] = (variantCounts[variant] || 0) + 1;
      }

      // Each variant should have roughly equal distribution (500 ± 5% = 475-525)
      for (const [variant, count] of Object.entries(variantCounts)) {
        const expectedCount = userCount / variantCount;
        const deviation = Math.abs(count - expectedCount) / expectedCount;
        expect(deviation).toBeLessThan(0.05); // <5% deviation
      }

      // Verify both variants exist
      expect(Object.keys(variantCounts).length).toBe(2);
    });

    it('should return different variants for different users', () => {
      const experimentId = 'intake-flow-v2';
      const variantCount = 2;

      const variants = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const userId = `user-${i}`;
        const variant = service.assignVariant(userId, experimentId, variantCount);
        variants.add(variant);
      }

      // With 20 users and 2 variants, we should see both variants
      expect(variants.size).toBeGreaterThan(1);
    });
  });

  describe('getActiveExperiment', () => {
    it('should return experiment config for active experiment', async () => {
      const experiment: AnalyticsABExperiment = {
        id: 1,
        experiment_id: 'intake-flow-v2',
        name: 'Simplify Qualification Questions',
        description: 'Test simplified vs detailed qualification flow',
        variant_count: 2,
        variant_names: ['control', 'simplified_questions'],
        start_date: new Date('2026-08-20'),
        end_date: null,
        active: true,
        created_at: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(experiment);

      const result = await service.getActiveExperiment('intake-flow-v2');

      expect(result).toEqual(experiment);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { experiment_id: 'intake-flow-v2', active: true },
      });
    });

    it('should return null for inactive experiment', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getActiveExperiment('non-existent-experiment');

      expect(result).toBeNull();
    });
  });
});
