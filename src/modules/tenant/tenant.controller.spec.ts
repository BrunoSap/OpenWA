import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller';
import { TenantService } from './tenant.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { SignupDto } from './dto/signup.dto';
import { CreateTenantDto } from './dto/create-tenant.dto';

describe('TenantController', () => {
  let controller: TenantController;
  let mockTenantService: any;
  let mockProvisioningService: any;

  beforeEach(async () => {
    mockTenantService = {
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    mockProvisioningService = {
      provisionTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        { provide: TenantService, useValue: mockTenantService },
        { provide: TenantProvisioningService, useValue: mockProvisioningService },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signup', () => {
    it('should call provisioningService.provisionTenant', async () => {
      const dto: SignupDto = {
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Corp',
        plan: 'free',
      };

      const mockResult = {
        tenant: { id: 'tenant-id', name: 'Test Corp', slug: 'test-corp' },
        adminKey: 'owa_k1_test123',
        setupUrl: 'http://localhost:2785/onboarding/tenant-id',
      };

      mockProvisioningService.provisionTenant.mockResolvedValue(mockResult);

      const result = await controller.signup(dto);

      expect(mockProvisioningService.provisionTenant).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockResult);
      expect(result.adminKey).toBe('owa_k1_test123');
    });
  });

  describe('getTenant', () => {
    it('should call tenantService.findById', async () => {
      const tenantId = 'tenant-id';
      const mockTenant = { id: tenantId, name: 'Test Corp', slug: 'test-corp' };

      mockTenantService.findById.mockResolvedValue(mockTenant);

      const result = await controller.getTenant(tenantId);

      expect(mockTenantService.findById).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual(mockTenant);
    });
  });

  describe('createTenant', () => {
    it('should call tenantService.create', async () => {
      const dto: CreateTenantDto = {
        name: 'Test Corp',
        slug: 'test-corp',
        billingEmail: 'test@example.com',
      };

      const mockTenant = { id: 'tenant-id', ...dto };
      mockTenantService.create.mockResolvedValue(mockTenant);

      const result = await controller.createTenant(dto);

      expect(mockTenantService.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockTenant);
    });
  });

  describe('updateTenant', () => {
    it('should call tenantService.update', async () => {
      const tenantId = 'tenant-id';
      const dto = { name: 'Updated Corp' };
      const mockTenant = { id: tenantId, name: 'Updated Corp', slug: 'test-corp' };

      mockTenantService.update.mockResolvedValue(mockTenant);

      const result = await controller.updateTenant(tenantId, dto);

      expect(mockTenantService.update).toHaveBeenCalledWith(tenantId, dto);
      expect(result).toEqual(mockTenant);
    });
  });
});
