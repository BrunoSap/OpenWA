import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationMemoryService } from './conversation-memory.service';
import { Message } from '../../message/entities/message.entity';

describe('ConversationMemoryService', () => {
  let service: ConversationMemoryService;
  let messageRepo: Repository<Message>;

  const mockMessageRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationMemoryService,
        {
          provide: getRepositoryToken(Message, 'data'),
          useValue: mockMessageRepository,
        },
      ],
    }).compile();

    service = module.get<ConversationMemoryService>(ConversationMemoryService);
    messageRepo = module.get<Repository<Message>>(getRepositoryToken(Message, 'data'));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getRecentMessages', () => {
    it('should return messages for a userId ordered by createdAt DESC', async () => {
      const mockMessages = [
        { id: '2', userId: 'user1', body: 'second', createdAt: new Date('2024-01-02') },
        { id: '1', userId: 'user1', body: 'first', createdAt: new Date('2024-01-01') },
      ] as Message[];

      mockMessageRepository.find.mockResolvedValue(mockMessages);

      const result = await service.getRecentMessages('user1', 50);

      expect(result).toEqual(mockMessages);
      expect(mockMessageRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });

    it('should clamp limit above 1000 to MAX_RECALL (1000)', async () => {
      mockMessageRepository.find.mockResolvedValue([]);

      await service.getRecentMessages('user1', 5000);

      expect(mockMessageRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        order: { createdAt: 'DESC' },
        take: 1000, // clamped from 5000
      });
    });

    it('should use default limit of 50 when not provided', async () => {
      mockMessageRepository.find.mockResolvedValue([]);

      await service.getRecentMessages('user1');

      expect(mockMessageRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user1' },
        order: { createdAt: 'DESC' },
        take: 50,
      });
    });

    it('should return empty array for empty userId', async () => {
      const result = await service.getRecentMessages('');

      expect(result).toEqual([]);
      expect(mockMessageRepository.find).not.toHaveBeenCalled();
    });

    it('should return empty array for undefined userId', async () => {
      const result = await service.getRecentMessages(undefined as any);

      expect(result).toEqual([]);
      expect(mockMessageRepository.find).not.toHaveBeenCalled();
    });

    it('should exclude soft-deleted rows (TypeORM @DeleteDateColumn auto-filters)', async () => {
      // TypeORM's @DeleteDateColumn automatically adds WHERE deletedAt IS NULL to find() queries,
      // so this test verifies the service doesn't need to manually pass a deletedAt filter.
      mockMessageRepository.find.mockResolvedValue([]);

      await service.getRecentMessages('user1', 10);

      const callArgs = mockMessageRepository.find.mock.calls[0][0];
      // Verify we're NOT manually filtering deletedAt (TypeORM handles it via decorator)
      expect(callArgs.where).not.toHaveProperty('deletedAt');
      expect(callArgs).toEqual({
        where: { userId: 'user1' },
        order: { createdAt: 'DESC' },
        take: 10,
      });
    });
  });
});
