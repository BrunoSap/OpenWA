import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { BillingService } from '../billing/billing.service';
import { Tenant } from './tenant.entity';
import { ApiKey, ApiKeyRole } from '../auth/entities/api-key.entity';
import { Session, SessionStatus } from '../session/entities/session.entity';
import { SignupDto } from './dto/signup.dto';

describe('TenantProvisioningService', () => {
  let service: TenantProvisioningService;
  let mockDataSource: any;
  let mockBillingService: any;
  let mockConfigService: any;
  let mockEntityManager: any;

  beforeEach(async () => {
    // Mock entity manager for transaction
    mockEntityManager = {
      findOne: jest.fn(),
      create: jest.fn((entity, data) => data),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    // Mock DataSource with transaction
    mockDataSource = {
      transaction: jest.fn((callback) => callback(mockEntityManager)),
      manager: {
        update: jest.fn(),
      },
    };

    // Mock BillingService
    mockBillingService = {
      createCustomer: jest.fn().mockResolvedValue('cus_test123'),
    };

    // Mock ConfigService
    mockConfigService = {
      get: jest.fn((key) => {
        if (key === 'BASE_URL') return 'http://localhost:2785';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantProvisioningService,
        { provide: 'mainDataSource', useValue: mockDataSource },
        { provide: BillingService, useValue: mockBillingService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<TenantProvisioningService>(TenantProvisioningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('provisionTenant', () => {
    it('should create tenant + API key + session in single transaction', async () => {
      const dto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
        plan: 'free',
      };

      mockEntityManager.findOne.mockResolvedValue(null); // No slug collision

      const result = await service.provisionTenant(dto);

      // Verify transaction was used
      expect(mockDataSource.transaction).toHaveBeenCalled();

      // Verify tenant created
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({
          name: 'Test Corp',
          slug: 'test-corp',
          billingEmail: 'test@example.com',
          plan: 'free',
          quotaMessages: 100,
          rateLimitPerMinute: 10,
        }),
      );

      // Verify API key created
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        ApiKey,
        expect.objectContaining({
          name: 'Admin Key (auto-generated)',
          role: ApiKeyRole.ADMIN,
        }),
      );

      // Verify session created
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        Session,
        expect.objectContaining({
          name: 'default',
          status: SessionStatus.CREATED,
        }),
      );

      // Verify save called 3 times (tenant, API key, session)
      expect(mockEntityManager.save).toHaveBeenCalledTimes(3);

      // Verify response structure
      expect(result).toHaveProperty('tenant');
      expect(result).toHaveProperty('adminKey');
      expect(result).toHaveProperty('setupUrl');
      expect(result.adminKey).toMatch(/^owa_k1_[a-f0-9]{64}$/);
      expect(result.setupUrl).toBe('http://localhost:2785/onboarding/undefined');
    });

    it('should append random suffix on slug collision', async () => {
      const dto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
      };

      // Simulate existing tenant with same slug
      mockEntityManager.findOne.mockResolvedValue({ id: 'existing-id', slug: 'test-corp' });

      const result = await service.provisionTenant(dto);

      // Verify slug has random suffix
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({
          slug: expect.stringMatching(/^test-corp-[a-f0-9]{8}$/),
        }),
      );
    });

    it('should call BillingService.createCustomer async (fire-and-forget)', async () => {
      const dto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
      };

      mockEntityManager.findOne.mockResolvedValue(null);

      await service.provisionTenant(dto);

      // Billing service called async (may not have executed yet due to void)
      // Just verify it doesn't throw or block
      expect(mockBillingService.createCustomer).toHaveBeenCalledWith(
        undefined, // tenantId from created entity (mocked)
        'test@example.com',
        'Test Corp',
      );
    });

    it('should default to free plan if not specified', async () => {
      const dto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
        // plan not specified
      };

      mockEntityManager.findOne.mockResolvedValue(null);

      await service.provisionTenant(dto);

      expect(mockEntityManager.create).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({
          plan: 'free',
          quotaMessages: 100,
          rateLimitPerMinute: 10,
        }),
      );
    });

    it('should apply correct quotas for pro plan', async () => {
      const dto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
        plan: 'pro',
      };

      mockEntityManager.findOne.mockResolvedValue(null);

      await service.provisionTenant(dto);

      expect(mockEntityManager.create).toHaveBeenCalledWith(
        Tenant,
        expect.objectContaining({
          plan: 'pro',
          quotaMessages: 10000,
          rateLimitPerMinute: 300,
        }),
      );
    });
  });
});
