import { Test, TestingModule } from '@nestjs/testing';
import { MemoryController } from './memory.controller';
import { ConversationMemoryService } from './services/conversation-memory.service';
import { Message, MessageDirection } from '../message/entities/message.entity';

describe('MemoryController', () => {
  let controller: MemoryController;
  let memoryService: jest.Mocked<ConversationMemoryService>;

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

  beforeEach(async () => {
    const mockMemoryService = {
      getUserHistory: jest.fn(),
      buildLLMContext: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MemoryController],
      providers: [
        {
          provide: ConversationMemoryService,
          useValue: mockMemoryService,
        },
      ],
    }).compile();

    controller = module.get<MemoryController>(MemoryController);
    memoryService = module.get(ConversationMemoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET history', () => {
    it('should return paginated messages scoped by userId', async () => {
      // Arrange
      const mockMessages = [
        createMockMessage({ id: 'msg-1', userId: 'user1', body: 'Message 1' }),
        createMockMessage({ id: 'msg-2', userId: 'user1', body: 'Message 2' }),
      ];
      memoryService.getUserHistory.mockResolvedValue({
        messages: mockMessages,
        total: 2,
      });

      // Act
      const result = await controller.getHistory('user1', { take: 50, skip: 0 });

      // Assert
      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(memoryService.getUserHistory).toHaveBeenCalledWith('user1', {
        skip: 0,
        take: 50,
      });
    });

    it('should clamp take to max 100', async () => {
      // Arrange
      memoryService.getUserHistory.mockResolvedValue({ messages: [], total: 0 });

      // Act
      await controller.getHistory('user1', { take: 200, skip: 0 });

      // Assert: service called with clamped value
      expect(memoryService.getUserHistory).toHaveBeenCalledWith('user1', {
        skip: 0,
        take: 100, // clamped from 200
      });
    });

    it('should use default take=50, skip=0 when not provided', async () => {
      // Arrange
      memoryService.getUserHistory.mockResolvedValue({ messages: [], total: 0 });

      // Act
      await controller.getHistory('user1', {});

      // Assert
      expect(memoryService.getUserHistory).toHaveBeenCalledWith('user1', {
        skip: 0,
        take: 50,
      });
    });

    it('should only return messages for the requested userId (no cross-user leakage)', async () => {
      // Arrange: service returns only user1's messages
      const user1Messages = [
        createMockMessage({ id: 'msg-1', userId: 'user1', body: 'User1 message' }),
      ];
      memoryService.getUserHistory.mockResolvedValue({
        messages: user1Messages,
        total: 1,
      });

      // Act
      const result = await controller.getHistory('user1', { take: 50, skip: 0 });

      // Assert: all returned messages belong to user1
      expect(result.messages.every((msg) => msg.userId === 'user1')).toBe(true);
      expect(memoryService.getUserHistory).toHaveBeenCalledWith('user1', expect.any(Object));
    });
  });

  describe('GET context', () => {
    it('should return buildLLMContext payload for userId', async () => {
      // Arrange
      const mockContext = {
        summary: 'Summary of older messages',
        recentMessages: [
          { role: 'user' as const, content: 'Hello', timestamp: new Date() },
          { role: 'assistant' as const, content: 'Hi there', timestamp: new Date() },
        ],
        totalMessages: 50,
      };
      memoryService.buildLLMContext.mockResolvedValue(mockContext);

      // Act
      const result = await controller.getContext('user1');

      // Assert
      expect(result).toEqual(mockContext);
      expect(memoryService.buildLLMContext).toHaveBeenCalledWith('user1');
    });

    it('should return null summary when under window', async () => {
      // Arrange
      const mockContext = {
        summary: null,
        recentMessages: [
          { role: 'user' as const, content: 'Hello', timestamp: new Date() },
        ],
        totalMessages: 10,
      };
      memoryService.buildLLMContext.mockResolvedValue(mockContext);

      // Act
      const result = await controller.getContext('user1');

      // Assert
      expect(result.summary).toBeNull();
      expect(result.totalMessages).toBe(10);
    });
  });
});
