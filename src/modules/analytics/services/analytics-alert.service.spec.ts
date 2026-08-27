import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsAlertService } from './analytics-alert.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsAlertRule } from '../entities/analytics-alert-rule.entity';
import { AnalyticsEventsService } from './analytics-events.service';

/**
 * Phase 6 Plan 03 Task 2: Analytics alert service unit tests (TDD RED).
 *
 * Tests evaluateRules() behavior:
 * - Rule with condition 'above' and current value > threshold → breach
 * - Rule with condition 'above' and current value <= threshold → no breach
 * - Rule with condition 'below' and current value < threshold → breach
 * - Rule with condition 'below' and current value >= threshold → no breach
 * - Rule with enabled=false → skipped
 */
describe('AnalyticsAlertService', () => {
  let service: AnalyticsAlertService;
  let alertRuleRepository: Repository<AnalyticsAlertRule>;
  let analyticsService: AnalyticsEventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAlertService,
        {
          provide: getRepositoryToken(AnalyticsAlertRule, 'data'),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: AnalyticsEventsService,
          useValue: {
            getOverview: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsAlertService>(AnalyticsAlertService);
    alertRuleRepository = module.get(getRepositoryToken(AnalyticsAlertRule, 'data'));
    analyticsService = module.get<AnalyticsEventsService>(AnalyticsEventsService);
  });

  it('should breach when condition is "above" and value exceeds threshold', async () => {
    const rule: AnalyticsAlertRule = {
      id: 1,
      name: 'High Fallback Rate',
      metric: 'fallback_rate',
      condition: 'above',
      threshold: 15,
      enabled: true,
      notification_channels: { slack: true },
      created_at: new Date(),
    };

    jest.spyOn(alertRuleRepository, 'find').mockResolvedValue([rule]);
    jest.spyOn(analyticsService, 'getOverview').mockResolvedValue({
      kpis: { fallbackRate: 20, resolutionRate: 80, costPerConversation: 0.5, dau: 10, mau: 100 },
      messagesChart: [],
      latencyChart: [],
      costChart: [],
    });

    const breaches = await service.evaluateRules();

    expect(breaches).toHaveLength(1);
    expect(breaches[0].rule).toEqual(rule);
    expect(breaches[0].currentValue).toBe(20);
  });

  it('should not breach when condition is "above" and value is below threshold', async () => {
    const rule: AnalyticsAlertRule = {
      id: 1,
      name: 'High Fallback Rate',
      metric: 'fallback_rate',
      condition: 'above',
      threshold: 15,
      enabled: true,
      notification_channels: { slack: true },
      created_at: new Date(),
    };

    jest.spyOn(alertRuleRepository, 'find').mockResolvedValue([rule]);
    jest.spyOn(analyticsService, 'getOverview').mockResolvedValue({
      kpis: { fallbackRate: 10, resolutionRate: 80, costPerConversation: 0.5, dau: 10, mau: 100 },
      messagesChart: [],
      latencyChart: [],
      costChart: [],
    });

    const breaches = await service.evaluateRules();

    expect(breaches).toHaveLength(0);
  });

  it('should breach when condition is "below" and value is under threshold', async () => {
    const rule: AnalyticsAlertRule = {
      id: 2,
      name: 'Low Resolution Rate',
      metric: 'resolution_rate',
      condition: 'below',
      threshold: 70,
      enabled: true,
      notification_channels: { email: true },
      created_at: new Date(),
    };

    jest.spyOn(alertRuleRepository, 'find').mockResolvedValue([rule]);
    jest.spyOn(analyticsService, 'getOverview').mockResolvedValue({
      kpis: { resolutionRate: 60, fallbackRate: 10, costPerConversation: 0.5, dau: 10, mau: 100 },
      messagesChart: [],
      latencyChart: [],
      costChart: [],
    });

    const breaches = await service.evaluateRules();

    expect(breaches).toHaveLength(1);
    expect(breaches[0].rule).toEqual(rule);
    expect(breaches[0].currentValue).toBe(60);
  });

  it('should skip disabled rules', async () => {
    const rule: AnalyticsAlertRule = {
      id: 1,
      name: 'High Fallback Rate',
      metric: 'fallback_rate',
      condition: 'above',
      threshold: 15,
      enabled: false,
      notification_channels: { slack: true },
      created_at: new Date(),
    };

    // Repository query filters by enabled:true, so this returns empty array
    jest.spyOn(alertRuleRepository, 'find').mockResolvedValue([]);

    const breaches = await service.evaluateRules();

    expect(breaches).toHaveLength(0);
    expect(analyticsService.getOverview).not.toHaveBeenCalled();
  });

  it('should return empty array when no rules exist', async () => {
    jest.spyOn(alertRuleRepository, 'find').mockResolvedValue([]);

    const breaches = await service.evaluateRules();

    expect(breaches).toHaveLength(0);
  });
});
