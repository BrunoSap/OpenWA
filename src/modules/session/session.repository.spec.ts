import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { Repository } from 'typeorm';
import { SessionRepository } from './session.repository';
import { Session, SessionStatus } from './entities/session.entity';

describe('SessionRepository', () => {
  let sessionRepository: SessionRepository;
  let mockClsService: jest.Mocked<ClsService>;
  let mockRepository: jest.Mocked<Repository<Session>>;

  beforeEach(async () => {
    mockClsService = {
      get: jest.fn(),
    } as any;

    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionRepository,
        {
          provide: ClsService,
          useValue: mockClsService,
        },
        {
          provide: getRepositoryToken(Session, 'data'),
          useValue: mockRepository,
        },
      ],
    }).compile();

    sessionRepository = module.get<SessionRepository>(SessionRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByName', () => {
    it('should find session by name within tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const mockSession = {
        id: '1',
        name: 'test-session',
        tenantId: 'tenant-123',
        status: SessionStatus.READY,
      };
      mockRepository.findOne.mockResolvedValue(mockSession as any);

      const result = await sessionRepository.findByName('test-session');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          name: 'test-session',
        },
      });
      expect(result).toEqual(mockSession);
    });

    it('should return null when session not found in tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      mockRepository.findOne.mockResolvedValue(null);

      const result = await sessionRepository.findByName('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findActive', () => {
    it('should find all READY sessions within tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const mockSessions = [
        { id: '1', name: 'session-1', tenantId: 'tenant-123', status: SessionStatus.READY },
        { id: '2', name: 'session-2', tenantId: 'tenant-123', status: SessionStatus.READY },
      ];
      mockRepository.find.mockResolvedValue(mockSessions as any);

      const result = await sessionRepository.findActive();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          status: SessionStatus.READY,
        },
      });
      expect(result).toEqual(mockSessions);
    });

    it('should return empty array when no active sessions', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      mockRepository.find.mockResolvedValue([]);

      const result = await sessionRepository.findActive();

      expect(result).toEqual([]);
    });
  });

  describe('findByStatus', () => {
    it('should find sessions by status within tenant scope', async () => {
      mockClsService.get.mockReturnValue('tenant-123');
      const mockSessions = [
        { id: '1', name: 'session-1', tenantId: 'tenant-123', status: SessionStatus.STOPPED },
      ];
      mockRepository.find.mockResolvedValue(mockSessions as any);

      const result = await sessionRepository.findByStatus(SessionStatus.STOPPED);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-123',
          status: SessionStatus.STOPPED,
        },
      });
      expect(result).toEqual(mockSessions);
    });
  });

  describe('tenant isolation', () => {
    it('should not return sessions from different tenant', async () => {
      // Tenant A context
      mockClsService.get.mockReturnValue('tenant-A');
      mockRepository.find.mockResolvedValue([
        { id: '1', name: 'session-a', tenantId: 'tenant-A', status: SessionStatus.READY },
      ] as any);

      const resultA = await sessionRepository.findActive();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-A',
          status: SessionStatus.READY,
        },
      });
      expect(resultA).toHaveLength(1);
      expect(resultA[0].tenantId).toBe('tenant-A');

      // Tenant B context
      mockClsService.get.mockReturnValue('tenant-B');
      mockRepository.find.mockResolvedValue([
        { id: '2', name: 'session-b', tenantId: 'tenant-B', status: SessionStatus.READY },
      ] as any);

      const resultB = await sessionRepository.findActive();

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          tenantId: 'tenant-B',
          status: SessionStatus.READY,
        },
      });
      expect(resultB).toHaveLength(1);
      expect(resultB[0].tenantId).toBe('tenant-B');
    });
  });
});
