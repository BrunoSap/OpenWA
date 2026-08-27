import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { Repository, FindManyOptions, FindOneOptions } from 'typeorm';
import { TenantScopedRepository } from './tenant-scoped-base.repository';

// Test entity
class TestEntity {
  id: string;
  tenantId: string;
  name: string;
}

// Concrete implementation for testing
class TestRepository extends TenantScopedRepository<TestEntity> {
  constructor(cls: ClsService, repo: Repository<TestEntity>) {
    super(cls, repo);
  }
}

describe('TenantScopedRepository', () => {
  let testRepository: TestRepository;
  let mockClsService: jest.Mocked<ClsService>;
  let mockRepository: jest.Mocked<Repository<TestEntity>>;

  beforeEach(async () => {
    // Mock ClsService
    mockClsService = {
      get: jest.fn(),
    } as any;

    // Mock TypeORM Repository
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ClsService,
          useValue: mockClsService,
        },
      ],
    }).compile();

    const cls = module.get<ClsService>(ClsService);
    testRepository = new TestRepository(cls, mockRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getTenantId', () => {
    it('should return tenantId from ClsService when present', () => {
      mockClsService.get.mockReturnValue('tenant-123');

      const result = testRepository['getTenantId']();

      expect(result).toBe('tenant-123');
      expect(mockClsService.get).toHaveBeenCalledWith('tenantId');
    });

    it('should throw UnauthorizedException when tenantId is missing', () => {
      mockClsService.get.mockReturnValue(undefined);

      expect(() => testRepository['getTenantId']()).toThrow(UnauthorizedException);
      expect(() => testRepository['getTenantId']()).toThrow(
        'Tenant context missing. Ensure API key authentication succeeded before this call.',
      );
    });
  });

  describe('find', () => {
    it('should auto-inject tenantId into WHERE clause', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const mockResults = [{ id: '1', tenantId: 'tenant-123', name: 'test' }];
      mockRepository.find.mockResolvedValue(mockResults as any);

      const result = await testRepository.find({ where: { name: 'test' } });

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          name: 'test',
        },
      });
      expect(result).toEqual(mockResults);
    });

    it('should work with empty options', async () => {
      mockClsService.get.mockReturnValue('tenant-456');
      mockRepository.find.mockResolvedValue([]);

      await testRepository.find();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-456',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should auto-inject tenantId into WHERE clause', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const mockResult = { id: '1', tenantId: 'tenant-123', name: 'test' };
      mockRepository.findOne.mockResolvedValue(mockResult as any);

      const result = await testRepository.findOne({ where: { id: '1' } });

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          id: '1',
        },
      });
      expect(result).toEqual(mockResult);
    });

    it('should return null when not found', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      mockRepository.findOne.mockResolvedValue(null);

      const result = await testRepository.findOne({ where: { id: 'nonexistent' } });

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find by id with tenant scoping', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const mockResult = { id: 'abc', tenantId: 'tenant-123', name: 'test' };
      mockRepository.findOne.mockResolvedValue(mockResult as any);

      const result = await testRepository.findById('abc');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          id: 'abc',
        },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('create', () => {
    it('should auto-inject tenantId when creating entity', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const inputData = { name: 'new-entity' };
      const createdEntity = { id: '1', tenantId: 'tenant-123', name: 'new-entity' };

      mockRepository.create.mockReturnValue(createdEntity as any);
      mockRepository.save.mockResolvedValue(createdEntity as any);

      const result = await testRepository.create(inputData);

      expect(mockRepository.create).toHaveBeenCalledWith({
        name: 'new-entity',
        tenantId: 'tenant-123',
      });
      expect(mockRepository.save).toHaveBeenCalledWith(createdEntity);
      expect(result).toEqual(createdEntity);
    });
  });

  describe('update', () => {
    it('should update entity within tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const existingEntity = { id: '1', tenantId: 'tenant-123', name: 'old-name' };
      const updatedEntity = { id: '1', tenantId: 'tenant-123', name: 'new-name' };

      mockRepository.findOne.mockResolvedValue(existingEntity as any);
      mockRepository.save.mockResolvedValue(updatedEntity as any);

      const result = await testRepository.update('1', { name: 'new-name' });

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: '1' },
      });
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result.name).toBe('new-name');
    });

    it('should throw error when entity not found in tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      mockRepository.findOne.mockResolvedValue(null);

      await expect(testRepository.update('nonexistent', { name: 'test' })).rejects.toThrow(
        'Entity with id nonexistent not found in current tenant scope',
      );
    });
  });

  describe('delete', () => {
    it('should delete entity within tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const entity = { id: '1', tenantId: 'tenant-123', name: 'test' };

      mockRepository.findOne.mockResolvedValue(entity as any);
      mockRepository.remove.mockResolvedValue(entity as any);

      await testRepository.delete('1');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-123', id: '1' },
      });
      expect(mockRepository.remove).toHaveBeenCalledWith(entity);
    });

    it('should throw error when entity not found in tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      mockRepository.findOne.mockResolvedValue(null);

      await expect(testRepository.delete('nonexistent')).rejects.toThrow(
        'Entity with id nonexistent not found in current tenant scope',
      );
    });
  });

  describe('findAllTenants (admin-only)', () => {
    it('should bypass tenant scoping and query all tenants', async () => {
      const mockResults = [
        { id: '1', tenantId: 'tenant-A', name: 'entity-a' },
        { id: '2', tenantId: 'tenant-B', name: 'entity-b' },
      ];
      mockRepository.find.mockResolvedValue(mockResults as any);

      const result = await testRepository.findAllTenants();

      // No tenantId in WHERE clause
      expect(mockRepository.find).toHaveBeenCalledWith(undefined);
      expect(result).toEqual(mockResults);
    });

    it('should accept options without adding tenantId filter', async () => {
      mockRepository.find.mockResolvedValue([]);

      await testRepository.findAllTenants({ where: { name: 'test' } });

      expect(mockRepository.find).toHaveBeenCalledWith({ where: { name: 'test' } });
    });
  });
});
