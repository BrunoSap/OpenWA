import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { Repository } from 'typeorm';
import { UsageService } from './usage.service';
import { AnalyticsEvent } from '../analytics/entities/analytics-event.entity';
import { TenantService } from '../tenant/tenant.service';
import { Tenant } from '../tenant/tenant.entity';

describe('UsageService', () => {
  let service: UsageService;
  let analyticsEventRepository: jest.Mocked<Repository<AnalyticsEvent>>;
  let tenantService: jest.Mocked<TenantService>;
  let clsService: jest.Mocked<ClsService>;

  const mockTenant: Partial<Tenant> = {
    id: 'tenant-123',
    name: 'Test Tenant',
    stripeCustomerId: 'cus_test123',
    plan: 'pro',
  };

  beforeEach(async () => {
    const mockAnalyticsRepo = {
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockTenantService = {
      findById: jest.fn(),
    };

    const mockClsService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsageService,
        {
          provide: getRepositoryToken(AnalyticsEvent, 'dataConnection'),
          useValue: mockAnalyticsRepo,
        },
        {
          provide: TenantService,
          useValue: mockTenantService,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    service = module.get<UsageService>(UsageService);
    analyticsEventRepository = module.get(getRepositoryToken(AnalyticsEvent, 'dataConnection'));
    tenantService = module.get(TenantService);
    clsService = module.get(ClsService);

    // Set environment variable for tests
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('trackMessageSent', () => {
    it('should create analytics event with tenant_id', async () => {
      clsService.get.mockReturnValue('tenant-123');
      tenantService.findById.mockResolvedValue(mockTenant as Tenant);

      const mockEvent = { id: 'event-1', tenant_id: 'tenant-123', event_type: 'message.sent' };
      analyticsEventRepository.create.mockReturnValue(mockEvent as any);
      analyticsEventRepository.save.mockResolvedValue(mockEvent as any);

      await service.trackMessageSent('msg-456', { sessionId: 'session-1', to: '+1234567890' });

      expect(analyticsEventRepository.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-123',
        event_type: 'message.sent',
        payload: {
          messageId: 'msg-456',
          sessionId: 'session-1',
          to: '+1234567890',
        },
        created_at: expect.any(Date),
      });
      expect(analyticsEventRepository.save).toHaveBeenCalledWith(mockEvent);
    });

    it('should skip tracking when no tenantId in CLS context', async () => {
      clsService.get.mockReturnValue(undefined);

      await service.trackMessageSent('msg-456');

      expect(analyticsEventRepository.create).not.toHaveBeenCalled();
      expect(analyticsEventRepository.save).not.toHaveBeenCalled();
    });

    it('should not throw when analytics event save fails', async () => {
      clsService.get.mockReturnValue('tenant-123');
      tenantService.findById.mockResolvedValue(mockTenant as Tenant);
      analyticsEventRepository.create.mockReturnValue({} as any);
      analyticsEventRepository.save.mockRejectedValue(new Error('DB error'));

      await expect(service.trackMessageSent('msg-456')).resolves.not.toThrow();
    });
  });

  describe('getCurrentMonthUsage', () => {
    it('should aggregate usage for current month', async () => {
      const mockResult = { messages: '10', tokens: '5000', cost: '0.05' };
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(mockResult),
      };
      analyticsEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getCurrentMonthUsage('tenant-123');

      expect(result).toEqual({
        messages: 10,
        tokens: 5000,
        cost: 0.05,
      });
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('event.tenant_id = :tenantId', { tenantId: 'tenant-123' });
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith("event.event_type = 'message.sent'");
    });

    it('should return zeros when no usage data exists', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
      };
      analyticsEventRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder as any);

      const result = await service.getCurrentMonthUsage('tenant-123');

      expect(result).toEqual({
        messages: 0,
        tokens: 0,
        cost: 0,
      });
    });
  });
});
