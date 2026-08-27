import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationMemoryService } from './conversation-memory.service';
import { Message, MessageDirection } from '../../message/entities/message.entity';
import { ConversationSummary } from '../entities/conversation-summary.entity';

describe('ConversationMemoryService', () => {
  let service: ConversationMemoryService;
  let messageRepo: Repository<Message>;
  let summaryRepo: Repository<ConversationSummary>;

  const mockMessageRepository = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockSummaryRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationMemoryService,
        {
          provide: getRepositoryToken(Message, 'data'),
          useValue: mockMessageRepository,
        },
        {
          provide: getRepositoryToken(ConversationSummary, 'data'),
          useValue: mockSummaryRepository,
        },
      ],
    }).compile();

    service = module.get<ConversationMemoryService>(ConversationMemoryService);
    messageRepo = module.get<Repository<Message>>(getRepositoryToken(Message, 'data'));
    summaryRepo = module.get<Repository<ConversationSummary>>(getRepositoryToken(ConversationSummary, 'data'));

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

  describe('buildLLMContext', () => {
    const createMockMessage = (overrides: Partial<Message> = {}): Message => ({
      id: 'msg-1',
      sessionId: 'session-1',
      waMessageId: 'wa-1',
      chatId: 'chat-1',
      from: 'user@example.com',
      to: 'bot@example.com',
      body: 'Test message',
      type: 'text',
      direction: MessageDirection.INCOMING,
      timestamp: Date.now(),
      metadata: {},
      status: 'sent' as any,
      createdAt: new Date(),
      userId: 'user@example.com',
      conversationId: 'chat-1:2026-08-27',
      ...overrides,
    } as Message);

    it('should return context with recent messages mapped to role/content/timestamp', async () => {
      // Arrange: 15 messages
      const mockMessages = Array(15).fill(null).map((_, i) =>
        createMockMessage({
          id: `msg-${i}`,
          body: `Message ${i}`,
          direction: i % 2 === 0 ? MessageDirection.INCOMING : MessageDirection.OUTGOING,
          createdAt: new Date(Date.now() - (15 - i) * 60000),
        })
      );
      mockMessageRepository.find.mockResolvedValue(mockMessages);
      mockMessageRepository.count.mockResolvedValue(15);

      // Act
      const result = await service.buildLLMContext('user@example.com', 20);

      // Assert
      expect(result.totalMessages).toBe(15);
      expect(result.recentMessages).toHaveLength(15);
      expect(result.recentMessages[0]).toEqual({
        role: 'user', // INCOMING -> 'user'
        content: 'Message 0',
        timestamp: expect.any(Date),
      });
      expect(result.recentMessages[1]).toEqual({
        role: 'assistant', // OUTGOING -> 'assistant'
        content: 'Message 1',
        timestamp: expect.any(Date),
      });
      expect(result.summary).toBeNull(); // Under window, no summary
    });

    it('should return null summary when total messages <= windowSize', async () => {
      // Arrange: 10 messages, window 20
      const mockMessages = Array(10).fill(null).map((_, i) =>
        createMockMessage({ id: `msg-${i}`, body: `Message ${i}` })
      );
      mockMessageRepository.find.mockResolvedValue(mockMessages);
      mockMessageRepository.count.mockResolvedValue(10);

      // Act
      const result = await service.buildLLMContext('user@example.com', 20);

      // Assert
      expect(result.totalMessages).toBe(10);
      expect(result.summary).toBeNull();
    });

    it('should return stored summary when total > windowSize and summary exists', async () => {
      // Arrange: 50 messages, window 20, summary exists
      const mockMessages = Array(20).fill(null).map((_, i) =>
        createMockMessage({ id: `msg-${i}`, body: `Recent ${i}` })
      );
      mockMessageRepository.find.mockResolvedValue(mockMessages);
      mockMessageRepository.count.mockResolvedValue(50);

      const mockSummary = {
        id: 'summary-1',
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27',
        text: 'This is the stored summary of older messages',
        messageCount: 30,
        updatedAt: new Date(),
      };
      mockSummaryRepository.findOne.mockResolvedValue(mockSummary as any);

      // Act
      const result = await service.buildLLMContext('user@example.com', 20);

      // Assert
      expect(result.totalMessages).toBe(50);
      expect(result.summary).toBe('This is the stored summary of older messages');
      expect(mockSummaryRepository.findOne).toHaveBeenCalledWith({
        where: { userId: 'user@example.com' },
        order: { updatedAt: 'DESC' },
      });
    });

    it('should return placeholder when total > windowSize but no summary exists yet', async () => {
      // Arrange: 50 messages, window 20, no summary
      const mockMessages = Array(20).fill(null).map((_, i) =>
        createMockMessage({ id: `msg-${i}`, body: `Recent ${i}` })
      );
      mockMessageRepository.find.mockResolvedValue(mockMessages);
      mockMessageRepository.count.mockResolvedValue(50);
      mockSummaryRepository.findOne.mockResolvedValue(null); // No summary yet

      // Act
      const result = await service.buildLLMContext('user@example.com', 20);

      // Assert
      expect(result.totalMessages).toBe(50);
      expect(result.summary).toBe('[30 older messages not yet summarized]');
    });

    it('should map INCOMING direction to user role', async () => {
      const mockMessages = [createMockMessage({ direction: MessageDirection.INCOMING })];
      mockMessageRepository.find.mockResolvedValue(mockMessages);
      mockMessageRepository.count.mockResolvedValue(1);

      const result = await service.buildLLMContext('user@example.com', 20);

      expect(result.recentMessages[0].role).toBe('user');
    });

    it('should map OUTGOING direction to assistant role', async () => {
      const mockMessages = [createMockMessage({ direction: MessageDirection.OUTGOING })];
      mockMessageRepository.find.mockResolvedValue(mockMessages);
      mockMessageRepository.count.mockResolvedValue(1);

      const result = await service.buildLLMContext('user@example.com', 20);

      expect(result.recentMessages[0].role).toBe('assistant');
    });
  });
});
