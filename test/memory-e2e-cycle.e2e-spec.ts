// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { MessageService } from './../src/modules/message/message.service';
import { ConversationMemoryService } from './../src/modules/memory/services/conversation-memory.service';
import { MemoryCleanupService } from './../src/modules/memory/services/memory-cleanup.service';

/**
 * Memory E2E Cycle (MEM-01, MEM-02, MEM-05 tracer).
 *
 * This suite validates the complete long-term memory pipeline end-to-end:
 * persistence, recall, performance, retention lifecycle, and cross-session durability.
 *
 * Test coverage:
 *   1. Persistence: incoming messages populate userId + conversationId (MEM-01)
 *   2. Recall: getRecentMessages returns newest 50 messages (MEM-02)
 *   3. Cross-session: persist → re-resolve services → recall still works
 *   4. Performance: recall <200ms for 50 of >=1000 messages (success criterion)
 *   5. Retention: soft-delete expired, hard-delete old soft-deleted (MEM-05)
 *   6. History endpoint: REST API returns userId-scoped paginated messages
 */
describe('Memory E2E (full cycle)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let apiKey: string;
  let messageService: MessageService;
  let memoryService: ConversationMemoryService;
  let cleanupService: MemoryCleanupService;

  // Booting the full AppModule can exceed jest's 5s default on a cold run.
  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    dataSource = app.get(getDataSourceToken('data'));
    messageService = app.get(MessageService);
    memoryService = app.get(ConversationMemoryService);
    cleanupService = app.get(MemoryCleanupService);

    const authService = app.get(AuthService);
    apiKey = (await authService.createApiKey({ name: 'e2e-memory-cycle', role: ApiKeyRole.ADMIN })).rawKey;
  });

  afterAll(async () => {
    // Clean up test data
    if (dataSource.isInitialized) {
      await dataSource.query(`DELETE FROM messages WHERE sessionId LIKE 'test-mem-%'`);
    }
    await app.close();
  });

  describe('persistence and recall (MEM-01, MEM-02)', () => {
    it('should persist incoming messages with userId and conversationId', async () => {
      const sessionId = 'test-mem-persist';
      const chatId = 'user@c.us';
      const userId = chatId; // 1:1 message, userId = from

      const message = await messageService.saveIncomingMessage(sessionId, {
        waMessageId: 'wa-msg-1',
        chatId,
        from: chatId,
        to: 'bot@c.us',
        body: 'Hello memory',
        type: 'text',
      });

      expect(message.userId).toBe(userId);
      expect(message.conversationId).toMatch(/^user@c\.us:\d{4}-\d{2}-\d{2}$/);
      expect(message.expiresAt).toBeInstanceOf(Date);
    });

    it('should recall recent messages via ConversationMemoryService', async () => {
      const sessionId = 'test-mem-recall';
      const chatId = 'user2@c.us';
      const userId = chatId;

      // Seed 5 messages
      for (let i = 1; i <= 5; i++) {
        await messageService.saveIncomingMessage(sessionId, {
          waMessageId: `wa-msg-${i}`,
          chatId,
          from: chatId,
          to: 'bot@c.us',
          body: `Message ${i}`,
          type: 'text',
        });
      }

      const recent = await memoryService.getRecentMessages(userId, 50);

      expect(recent).toHaveLength(5);
      expect(recent[0].body).toBe('Message 5'); // Newest first
      expect(recent[4].body).toBe('Message 1');
    });
  });

  describe('cross-session persistence', () => {
    it('should recall messages after service re-resolution', async () => {
      const sessionId = 'test-mem-cross-session';
      const chatId = 'user3@c.us';
      const userId = chatId;

      // Persist messages
      await messageService.saveIncomingMessage(sessionId, {
        waMessageId: 'wa-msg-cross-1',
        chatId,
        from: chatId,
        to: 'bot@c.us',
        body: 'Cross-session test',
        type: 'text',
      });

      // Re-resolve services (simulates app restart)
      const memoryService2 = app.get(ConversationMemoryService);

      const recent = await memoryService2.getRecentMessages(userId, 50);

      expect(recent.length).toBeGreaterThanOrEqual(1);
      expect(recent.some(m => m.body === 'Cross-session test')).toBe(true);
    });
  });

  describe('performance: recall <200ms for 50 of >=1000 messages', () => {
    it('should retrieve 50 messages in <200ms from >=1000-message dataset', async () => {
      const sessionId = 'test-mem-perf';
      const chatId = 'user-perf@c.us';
      const userId = chatId;

      // Seed 1000 messages
      const seedPromises = [];
      for (let i = 1; i <= 1000; i++) {
        seedPromises.push(
          messageService.saveIncomingMessage(sessionId, {
            waMessageId: `wa-msg-perf-${i}`,
            chatId,
            from: chatId,
            to: 'bot@c.us',
            body: `Performance test message ${i}`,
            type: 'text',
          }),
        );
      }
      await Promise.all(seedPromises);

      // Measure recall performance
      const start = Date.now();
      const recent = await memoryService.getRecentMessages(userId, 50);
      const duration = Date.now() - start;

      expect(recent).toHaveLength(50);
      expect(duration).toBeLessThan(200); // Success criterion: <200ms
    });
  });

  describe('retention lifecycle (MEM-05)', () => {
    it('should soft-delete expired messages and exclude them from recall', async () => {
      const sessionId = 'test-mem-retention';
      const chatId = 'user-retention@c.us';
      const userId = chatId;

      // Create a message with expiresAt in the past
      const message = await messageService.saveIncomingMessage(sessionId, {
        waMessageId: 'wa-msg-expired',
        chatId,
        from: chatId,
        to: 'bot@c.us',
        body: 'Expired message',
        type: 'text',
      });

      // Manually set expiresAt to the past
      await dataSource.query(
        `UPDATE messages SET expiresAt = datetime('now', '-1 day') WHERE id = ?`,
        [message.id],
      );

      // Run soft-delete cleanup
      const softDeleted = await cleanupService.softDeleteExpired();
      expect(softDeleted).toBeGreaterThanOrEqual(1);

      // Verify excluded from recall
      const recent = await memoryService.getRecentMessages(userId, 50);
      expect(recent.every(m => m.id !== message.id)).toBe(true);

      // Verify visible with withDeleted
      const withDeleted = await dataSource
        .getRepository('Message')
        .createQueryBuilder('message')
        .where('message.id = :id', { id: message.id })
        .withDeleted()
        .getOne();

      expect(withDeleted).not.toBeNull();
      expect(withDeleted.deletedAt).toBeInstanceOf(Date);
    });

    it('should hard-delete old soft-deleted rows past grace period', async () => {
      const sessionId = 'test-mem-hard-delete';
      const chatId = 'user-hard-delete@c.us';

      // Create and soft-delete a message
      const message = await messageService.saveIncomingMessage(sessionId, {
        waMessageId: 'wa-msg-hard-delete',
        chatId,
        from: chatId,
        to: 'bot@c.us',
        body: 'To be hard-deleted',
        type: 'text',
      });

      // Set deletedAt to 91 days ago (past grace period)
      await dataSource.query(
        `UPDATE messages SET deletedAt = datetime('now', '-91 days') WHERE id = ?`,
        [message.id],
      );

      // Run hard-delete cleanup
      const hardDeleted = await cleanupService.hardDeleteOldSoftDeletes();
      expect(hardDeleted).toBeGreaterThanOrEqual(1);

      // Verify row no longer exists even with withDeleted
      const withDeleted = await dataSource
        .getRepository('Message')
        .createQueryBuilder('message')
        .where('message.id = :id', { id: message.id })
        .withDeleted()
        .getOne();

      expect(withDeleted).toBeNull();
    });
  });

  describe('history endpoint (REST API)', () => {
    it('should return userId-scoped paginated messages via GET /memory/history', async () => {
      const sessionId = 'test-mem-history';
      const chatId = 'user-history@c.us';
      const userId = chatId;

      // Seed 3 messages
      for (let i = 1; i <= 3; i++) {
        await messageService.saveIncomingMessage(sessionId, {
          waMessageId: `wa-msg-history-${i}`,
          chatId,
          from: chatId,
          to: 'bot@c.us',
          body: `History message ${i}`,
          type: 'text',
        });
      }

      const response = await request(app.getHttpServer())
        .get(`/memory/history?userId=${encodeURIComponent(userId)}&limit=50`)
        .set('X-API-Key', apiKey)
        .expect(200);

      expect(response.body.messages).toBeInstanceOf(Array);
      expect(response.body.messages.length).toBeGreaterThanOrEqual(3);
      expect(response.body.messages.every((m: any) => m.userId === userId)).toBe(true);
    });
  });
});
