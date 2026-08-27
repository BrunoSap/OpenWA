// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { MessageService } from './../src/modules/message/message.service';
import { ConversationMemoryService } from './../src/modules/memory/services/conversation-memory.service';
import { MessageDirection } from './../src/modules/message/entities/message.entity';

/**
 * Tracer E2E for long-term memory: the thinnest slice through the persist->recall path —
 * MessageService.saveIncomingMessage populates userId/conversationId -> PostgreSQL/SQLite ->
 * ConversationMemoryService.getRecentMessages retrieves it. Proves the schema migration applied,
 * the memory module is wired on the named 'data' connection, write-path population works, and
 * recall queries hit the composite index with correct results — all in one real happy path before
 * Plan 02 expands summarization/API and Plan 03 adds retention.
 *
 * Auth mirrors the existing authenticated E2E suites: mint a real ADMIN key and use it to
 * establish session context (though this test doesn't actually use the REST API, it resolves
 * services directly from the Nest container to prove the write->read cycle).
 */
describe('Memory tracer (e2e)', () => {
  let app: INestApplication;
  let messageService: MessageService;
  let memoryService: ConversationMemoryService;

  // Booting the full AppModule (every feature module + both data sources) can exceed jest's 5s
  // default on a cold run. Give the boot room.
  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    messageService = app.get(MessageService);
    memoryService = app.get(ConversationMemoryService);

    // Mint an ADMIN key to establish session context (not actively used in this test,
    // but mirrors the pattern from other e2e suites).
    const authService = app.get(AuthService);
    await authService.createApiKey({ name: 'e2e-memory-tracer-admin', role: ApiKeyRole.ADMIN });
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  it('persisted incoming message is recalled via getRecentMessages with correct userId and conversationId', async () => {
    // Arrange: synthetic incoming message with unique identifiers
    const sessionId = 'test-session';
    const chatId = `test-chat-${Date.now()}@c.us`;
    const from = `sender-${Date.now()}@s.whatsapp.net`;
    const body = `Memory tracer test message at ${new Date().toISOString()}`;
    const expectedConversationId = `${chatId}:${new Date().toISOString().slice(0, 10)}`;

    // Act: Save the message (write path population)
    const savedMessage = await messageService.saveIncomingMessage(sessionId, {
      chatId,
      from,
      to: 'bot@s.whatsapp.net',
      body,
      type: 'text',
      timestamp: Date.now(),
    });

    // Assert: Message was saved with memory fields populated
    expect(savedMessage.id).toBeDefined();
    expect(savedMessage.userId).toBe(from); // 1:1 message: userId = from
    expect(savedMessage.conversationId).toBe(expectedConversationId);
    expect(savedMessage.direction).toBe(MessageDirection.INCOMING);
    expect(savedMessage.body).toBe(body);

    // Act: Re-resolve the memory service (proves cross-service-instance recall, not in-memory state)
    const freshMemoryService = app.get(ConversationMemoryService);

    // Act: Recall messages for this userId
    const recalledMessages = await freshMemoryService.getRecentMessages(from, 10);

    // Assert: The persisted message is in the recall result
    const recalled = recalledMessages.find((m) => m.id === savedMessage.id);
    expect(recalled).toBeDefined();
    expect(recalled?.body).toBe(body);
    expect(recalled?.userId).toBe(from);
    expect(recalled?.conversationId).toBe(expectedConversationId);
  });

  it('group message populates userId from author (not from)', async () => {
    // Arrange: synthetic group message where author differs from the group JID
    const sessionId = 'test-session';
    const chatId = `test-group-${Date.now()}@g.us`; // group JID
    const author = `participant-${Date.now()}@s.whatsapp.net`; // actual sender
    const body = `Group message tracer test at ${new Date().toISOString()}`;

    // Act: Save the group message
    const savedMessage = await messageService.saveIncomingMessage(sessionId, {
      chatId,
      from: chatId, // group messages have from = group JID
      author, // the participant who sent it
      to: 'bot@s.whatsapp.net',
      body,
      type: 'text',
      timestamp: Date.now(),
    });

    // Assert: userId populated from author, not from
    expect(savedMessage.userId).toBe(author);
    expect(savedMessage.userId).not.toBe(chatId);

    // Act: Recall by the participant's author JID
    const recalledMessages = await memoryService.getRecentMessages(author, 10);

    // Assert: The group message is recalled by participant identity
    const recalled = recalledMessages.find((m) => m.id === savedMessage.id);
    expect(recalled).toBeDefined();
    expect(recalled?.body).toBe(body);
    expect(recalled?.userId).toBe(author);
  });
});
