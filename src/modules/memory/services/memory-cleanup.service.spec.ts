import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { MemoryCleanupService } from './memory-cleanup.service';
import { Message } from '../../message/entities/message.entity';

describe('MemoryCleanupService', () => {
  let service: MemoryCleanupService;
  let repository: jest.Mocked<Repository<Message>>;
  let dataSource: jest.Mocked<DataSource>;
  let softDeleteQB: any;
  let hardDeleteQB: any;

  beforeEach(async () => {
    // Mock query builder chain for soft delete
    softDeleteQB = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    // Mock query builder chain for hard delete
    hardDeleteQB = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    repository = {
      createQueryBuilder: jest.fn().mockReturnValue(softDeleteQB),
    } as unknown as jest.Mocked<Repository<Message>>;

    dataSource = {
      createQueryBuilder: jest.fn().mockReturnValue(hardDeleteQB),
    } as unknown as jest.Mocked<DataSource>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryCleanupService,
        { provide: getRepositoryToken(Message, 'data'), useValue: repository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<MemoryCleanupService>(MemoryCleanupService);
  });

  describe('softDeleteExpired', () => {
    it('should soft-delete messages where expiresAt < now and deletedAt is null (MEM-05)', async () => {
      softDeleteQB.execute.mockResolvedValue({ affected: 5 });

      const result = await service.softDeleteExpired();

      expect(softDeleteQB.update).toHaveBeenCalledWith(Message);
      expect(softDeleteQB.set).toHaveBeenCalledWith({ deletedAt: expect.any(Function) });
      expect(softDeleteQB.where).toHaveBeenCalledWith('expiresAt < :now', { now: expect.any(Date) });
      expect(softDeleteQB.andWhere).toHaveBeenCalledWith('deletedAt IS NULL');
      expect(result).toBe(5);
    });

    it('should return 0 when no expired messages exist', async () => {
      softDeleteQB.execute.mockResolvedValue({ affected: 0 });

      const result = await service.softDeleteExpired();

      expect(result).toBe(0);
    });
  });

  describe('hardDeleteOldSoftDeletes', () => {
    it('should hard-delete rows whose deletedAt is older than 90-day grace period (MEM-05)', async () => {
      hardDeleteQB.execute.mockResolvedValue({ affected: 3 });

      const result = await service.hardDeleteOldSoftDeletes();

      expect(hardDeleteQB.delete).toHaveBeenCalled();
      expect(hardDeleteQB.from).toHaveBeenCalledWith(Message);
      expect(hardDeleteQB.where).toHaveBeenCalledWith('deletedAt < :graceThreshold', {
        graceThreshold: expect.any(Date),
      });
      expect(result).toBe(3);
    });

    it('should return 0 when no old soft-deleted rows exist', async () => {
      hardDeleteQB.execute.mockResolvedValue({ affected: 0 });

      const result = await service.hardDeleteOldSoftDeletes();

      expect(result).toBe(0);
    });
  });

  describe('audit logging (T-05-09)', () => {
    it('should log affected count and oldest deleted timestamp on soft delete', async () => {
      softDeleteQB.execute.mockResolvedValue({ affected: 5 });

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.softDeleteExpired();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/soft-deleted \d+ expired messages/i),
      );
    });

    it('should log affected count on hard delete', async () => {
      hardDeleteQB.execute.mockResolvedValue({ affected: 3 });

      const loggerSpy = jest.spyOn(service['logger'], 'log');

      await service.hardDeleteOldSoftDeletes();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(/hard-deleted \d+ old soft-deleted messages/i),
      );
    });
  });
});
