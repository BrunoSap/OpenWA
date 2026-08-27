import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SatisfactionSurveyService } from './satisfaction-survey.service';
import { AnalyticsSatisfactionResponse } from '../entities/analytics-satisfaction-response.entity';
import { AnalyticsEvent } from '../entities/analytics-event.entity';

/**
 * Phase 10 Plan 03 Task 1: Unit tests for SatisfactionSurveyService (RED phase).
 *
 * Tests NPS/CSAT calculation formulas per RESEARCH.md L557-586 and correlation analytics L610-632.
 * These tests should FAIL initially (RED) until the service implementation is complete (GREEN).
 */
describe('SatisfactionSurveyService', () => {
  let service: SatisfactionSurveyService;
  let satisfactionRepo: Repository<AnalyticsSatisfactionResponse>;
  let eventsRepo: Repository<AnalyticsEvent>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SatisfactionSurveyService,
        {
          provide: getRepositoryToken(AnalyticsSatisfactionResponse, 'data'),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AnalyticsEvent, 'data'),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SatisfactionSurveyService>(SatisfactionSurveyService);
    satisfactionRepo = module.get<Repository<AnalyticsSatisfactionResponse>>(
      getRepositoryToken(AnalyticsSatisfactionResponse, 'data'),
    );
    eventsRepo = module.get<Repository<AnalyticsEvent>>(
      getRepositoryToken(AnalyticsEvent, 'data'),
    );
  });

  describe('calculateNPS', () => {
    it('should return correct NPS score for known example', () => {
      // Example from RESEARCH.md L570-572: [9,10,9,5,3,7,8,10]
      // Promoters (9-10): 4, Detractors (0-6): 2, Passives (7-8): 2, Total: 8
      // NPS = ((4 - 2) / 8) * 100 = 25
      const responses = [9, 10, 9, 5, 3, 7, 8, 10];
      const nps = service.calculateNPS(responses);
      expect(nps).toBe(25);
    });

    it('should return 0 for empty array', () => {
      const nps = service.calculateNPS([]);
      expect(nps).toBe(0);
    });

    it('should handle all promoters (score 100)', () => {
      const responses = [9, 10, 9, 10];
      const nps = service.calculateNPS(responses);
      expect(nps).toBe(100);
    });

    it('should handle all detractors (score -100)', () => {
      const responses = [0, 3, 5, 6];
      const nps = service.calculateNPS(responses);
      expect(nps).toBe(-100);
    });

    it('should exclude passives from calculation', () => {
      // 2 promoters (10, 9), 4 passives (7,8,7,8), 2 detractors (3, 5)
      // NPS = ((2 - 2) / 8) * 100 = 0
      const responses = [10, 9, 7, 8, 7, 8, 3, 5];
      const nps = service.calculateNPS(responses);
      expect(nps).toBe(0);
    });
  });

  describe('calculateCSAT', () => {
    it('should return correct CSAT percentage for known example', () => {
      // Example from RESEARCH.md L586: [5,4,5,3,4]
      // Average = 4.2, CSAT = (4.2 / 5) * 100 = 84.0
      const ratings = [5, 4, 5, 3, 4];
      const csat = service.calculateCSAT(ratings);
      expect(csat).toBe(84.0);
    });

    it('should return 0 for empty array', () => {
      const csat = service.calculateCSAT([]);
      expect(csat).toBe(0);
    });

    it('should return 100 for all perfect scores', () => {
      const ratings = [5, 5, 5, 5];
      const csat = service.calculateCSAT(ratings);
      expect(csat).toBe(100.0);
    });

    it('should return 20 for all minimum scores', () => {
      const ratings = [1, 1, 1, 1];
      const csat = service.calculateCSAT(ratings);
      expect(csat).toBe(20.0);
    });

    it('should round to 1 decimal place', () => {
      // Average = 3.33333, CSAT = 66.66666... → 66.7
      const ratings = [3, 3, 4];
      const csat = service.calculateCSAT(ratings);
      expect(csat).toBe(66.7);
    });
  });

  describe('getCorrelationByOutcome', () => {
    it('should show higher NPS for resolved conversations', async () => {
      // Seed mock data: resolved conversations have higher satisfaction
      const mockResponses = [
        { conversation_id: 'conv1', score: 9, survey_type: 'nps' }, // resolved
        { conversation_id: 'conv2', score: 8, survey_type: 'nps' }, // resolved
        { conversation_id: 'conv3', score: 5, survey_type: 'nps' }, // escalated
        { conversation_id: 'conv4', score: 6, survey_type: 'nps' }, // escalated
      ];

      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { outcome: 'resolved', avg_nps: 8.5, count: 2 },
          { outcome: 'escalated', avg_nps: 5.5, count: 2 },
        ]),
      };

      jest.spyOn(satisfactionRepo, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const startDate = new Date('2026-08-01');
      const endDate = new Date('2026-08-31');
      const correlation = await service.getCorrelationByOutcome(startDate, endDate);

      expect(correlation.resolvedNps).toBe(8.5);
      expect(correlation.escalatedNps).toBe(5.5);
      expect(correlation.delta).toBe(3.0);
    });

    it('should return 0 for outcomes with no responses', async () => {
      const mockQueryBuilder = {
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(satisfactionRepo, 'createQueryBuilder').mockReturnValue(mockQueryBuilder as any);

      const startDate = new Date('2026-08-01');
      const endDate = new Date('2026-08-31');
      const correlation = await service.getCorrelationByOutcome(startDate, endDate);

      expect(correlation.resolvedNps).toBe(0);
      expect(correlation.escalatedNps).toBe(0);
      expect(correlation.delta).toBe(0);
    });
  });
});
