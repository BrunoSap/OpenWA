import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemorySummarizationService } from './memory-summarization.service';
import { Message, MessageDirection } from '../../message/entities/message.entity';
import { ConversationSummary } from '../entities/conversation-summary.entity';

describe('MemorySummarizationService', () => {
  let service: MemorySummarizationService;
  let messageRepo: jest.Mocked<Repository<Message>>;
  let summaryRepo: jest.Mocked<Repository<ConversationSummary>>;

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
    const messageRepoMock = {
      find: jest.fn(),
      count: jest.fn(),
    };

    const summaryRepoMock = {
      findOne: jest.fn(),
      upsert: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemorySummarizationService,
        {
          provide: getRepositoryToken(Message, 'data'),
          useValue: messageRepoMock,
        },
        {
          provide: getRepositoryToken(ConversationSummary, 'data'),
          useValue: summaryRepoMock,
        },
      ],
    }).compile();

    service = module.get<MemorySummarizationService>(MemorySummarizationService);
    messageRepo = module.get(getRepositoryToken(Message, 'data'));
    summaryRepo = module.get(getRepositoryToken(ConversationSummary, 'data'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('summarize', () => {
    it('should skip when fewer than 10 older messages exist', async () => {
      // Arrange: 9 total messages (below threshold for older messages beyond window of 20)
      // Since window is 20, and we need 10 older, we need at least 30 total
      // With 9 total, all are in window, so 0 older messages -> skip
      messageRepo.find.mockResolvedValue(Array(9).fill(null).map((_, i) =>
        createMockMessage({ id: `msg-${i}`, body: `Message ${i}`, userId: 'user@example.com' })
      ));

      // Act
      const result = await service.summarize({
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27'
      });

      // Assert
      expect(result.skipped).toBe(true);
      expect(summaryRepo.upsert).not.toHaveBeenCalled();
    });

    it('should produce and upsert summary when >=10 older messages exist', async () => {
      // Arrange: 30 total messages (20 in window + 10 older = meets threshold)
      const allMessages = Array(30).fill(null).map((_, i) =>
        createMockMessage({
          id: `msg-${i}`,
          body: `Message ${i}`,
          userId: 'user@example.com',
          createdAt: new Date(Date.now() - (30 - i) * 60000), // Spread over time, newest first
        })
      );
      messageRepo.find.mockResolvedValue(allMessages);

      const mockSummary = {
        id: 'summary-1',
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27',
        text: expect.any(String),
        messageCount: 10,
        oldestMessageDate: expect.any(Date),
        newestMessageDate: expect.any(Date),
        updatedAt: new Date(),
      };
      summaryRepo.findOne.mockResolvedValue(mockSummary as any);

      // Act
      const result = await service.summarize({
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27'
      });

      // Assert
      expect(result.skipped).toBe(false);
      expect(result.summary).toBeDefined();
      expect(result.summary.text).toBeTruthy();
      expect(result.summary.messageCount).toBe(10);
      expect(summaryRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user@example.com',
          conversationId: 'chat-1:2026-08-27',
          text: expect.any(String),
          messageCount: 10,
        }),
        { conflictPaths: ['userId', 'conversationId'] }
      );
    });

    it('should update existing row on second run (no duplicate)', async () => {
      // Arrange: 35 total messages (20 in window + 15 older)
      const allMessages = Array(35).fill(null).map((_, i) =>
        createMockMessage({
          id: `msg-${i}`,
          body: `Message ${i}`,
          userId: 'user@example.com',
          createdAt: new Date(Date.now() - (35 - i) * 60000),
        })
      );
      messageRepo.find.mockResolvedValue(allMessages);

      const mockSummary = {
        id: 'summary-1',
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27',
        text: expect.any(String),
        messageCount: 15,
        oldestMessageDate: expect.any(Date),
        newestMessageDate: expect.any(Date),
        updatedAt: new Date(),
      };
      summaryRepo.findOne.mockResolvedValue(mockSummary as any);

      // Act: First run
      await service.summarize({
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27'
      });

      // Act: Second run (same userId, conversationId)
      await service.summarize({
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27'
      });

      // Assert: upsert called twice with same conflictPaths (updates row, no duplicate)
      expect(summaryRepo.upsert).toHaveBeenCalledTimes(2);
      expect(summaryRepo.upsert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          userId: 'user@example.com',
          conversationId: 'chat-1:2026-08-27',
        }),
        { conflictPaths: ['userId', 'conversationId'] }
      );
    });

    it('should use extractive fallback when no LLM target configured', async () => {
      // Arrange: 30 total messages (20 in window + 10 older), no LLM available
      const allMessages = Array(30).fill(null).map((_, i) =>
        createMockMessage({
          id: `msg-${i}`,
          body: `This is a longer test message body for message number ${i} to ensure we have enough content.`,
          userId: 'user@example.com',
          createdAt: new Date(Date.now() - (30 - i) * 60000),
        })
      );
      messageRepo.find.mockResolvedValue(allMessages);

      const mockSummary = {
        id: 'summary-1',
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27',
        text: expect.any(String),
        messageCount: 10,
        oldestMessageDate: expect.any(Date),
        newestMessageDate: expect.any(Date),
        updatedAt: new Date(),
      };
      summaryRepo.findOne.mockResolvedValue(mockSummary as any);

      // Act
      const result = await service.summarize({
        userId: 'user@example.com',
        conversationId: 'chat-1:2026-08-27'
      });

      // Assert: extractive fallback produces non-empty text
      expect(result.skipped).toBe(false);
      expect(result.summary).toBeDefined();
      expect(result.summary.text).toBeTruthy();

      // Verify the upserted text is truncated (extractive fallback behavior)
      const upsertCall = summaryRepo.upsert.mock.calls[0][0] as any;
      expect(upsertCall.text.length).toBeGreaterThan(0);
      expect(upsertCall.text.length).toBeLessThanOrEqual(600); // ~500 chars + buffer for ellipsis
    });
  });
});
