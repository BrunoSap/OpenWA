import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { AuthService } from './auth.service';
import { ApiKey, ApiKeyRole } from './entities/api-key.entity';
import { CreateApiKeyDto } from './dto';
import { ApiKeyUsageTracker } from './api-key-usage-tracker.service';

describe('AuthService - API Key Tenant Scoping', () => {
  let service: AuthService;
  let mockApiKeyRepository: jest.Mocked<Repository<ApiKey>>;
  let mockClsService: jest.Mocked<ClsService>;

  beforeEach(async () => {
    mockApiKeyRepository = {
      create: jest.fn(),
      save: jest.fn(),
      count: jest.fn(),
      findOne: jest.fn(),
    } as any;

    mockClsService = {
      get: jest.fn(),
    } as any;

    const mockUsageTracker = {
      flushOnShutdown: jest.fn(),
    };

    const mockModuleRef = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(ApiKey, 'main'),
          useValue: mockApiKeyRepository,
        },
        {
          provide: ClsService,
          useValue: mockClsService,
        },
        {
          provide: ApiKeyUsageTracker,
          useValue: mockUsageTracker,
        },
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createApiKey with tenant scoping', () => {
    it('should stamp tenantId from ClsService when creating API key', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const createdKey = {
        id: 'key-1',
        name: 'Test Key',
        role: ApiKeyRole.OPERATOR,
        tenantId: 'tenant-123',
      };
      mockApiKeyRepository.create.mockReturnValue(createdKey as any);
      mockApiKeyRepository.save.mockResolvedValue(createdKey as any);

      const dto: CreateApiKeyDto = {
        name: 'Test Key',
        role: ApiKeyRole.OPERATOR,
      };

      const result = await service.createApiKey(dto);

      expect(mockClsService.get).toHaveBeenCalledWith('tenantId');
      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Key',
          role: ApiKeyRole.OPERATOR,
          tenantId: 'tenant-123',
        }),
      );
      expect(result.apiKey.tenantId).toBe('tenant-123');
    });

    it('should set tenantId to null when no tenant context', async () => {
      mockClsService.get.mockReturnValue(undefined);
      const createdKey = {
        id: 'key-1',
        name: 'Bootstrap Key',
        role: ApiKeyRole.ADMIN,
        tenantId: null,
      };
      mockApiKeyRepository.create.mockReturnValue(createdKey as any);
      mockApiKeyRepository.save.mockResolvedValue(createdKey as any);

      const dto: CreateApiKeyDto = {
        name: 'Bootstrap Key',
        role: ApiKeyRole.ADMIN,
      };

      await service.createApiKey(dto);

      expect(mockApiKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: null,
        }),
      );
    });

    it('should create keys for different tenants with different tenantIds', async () => {
      // First key for tenant A
      mockClsService.get.mockReturnValue('tenant-A');
      const keyA = {
        id: 'key-a',
        name: 'Key A',
        role: ApiKeyRole.OPERATOR,
        tenantId: 'tenant-A',
      };
      mockApiKeyRepository.create.mockReturnValue(keyA as any);
      mockApiKeyRepository.save.mockResolvedValue(keyA as any);

      const resultA = await service.createApiKey({ name: 'Key A', role: ApiKeyRole.OPERATOR });
      expect(resultA.apiKey.tenantId).toBe('tenant-A');

      // Second key for tenant B
      mockClsService.get.mockReturnValue('tenant-B');
      const keyB = {
        id: 'key-b',
        name: 'Key B',
        role: ApiKeyRole.OPERATOR,
        tenantId: 'tenant-B',
      };
      mockApiKeyRepository.create.mockReturnValue(keyB as any);
      mockApiKeyRepository.save.mockResolvedValue(keyB as any);

      const resultB = await service.createApiKey({ name: 'Key B', role: ApiKeyRole.OPERATOR });
      expect(resultB.apiKey.tenantId).toBe('tenant-B');
    });
  });
});
