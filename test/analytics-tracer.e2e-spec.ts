// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { AuthService } from './../src/modules/auth/auth.service';
import { ApiKeyRole } from './../src/modules/auth/entities/api-key.entity';
import { MessageService } from './../src/modules/message/message.service';
import { AnalyticsEventsService } from './../src/modules/analytics/services/analytics-events.service';

/**
 * Phase 6 Plan 01: Analytics tracer E2E (DASH-05).
 *
 * Proves the event-driven analytics collection end-to-end: message.processed event emitted from
 * MessageService.saveIncomingMessage -> EventEmitter2 transport -> AnalyticsEventListener consumes
 * -> AnalyticsEventsService.recordEvent persists to analytics_events on the 'data' connection ->
 * GET /api/analytics/events returns the stored event with OPERATOR api-key auth.
 *
 * Covers three behaviors:
 * 1. With ANALYTICS_ENABLED=true, processing one message writes exactly one analytics_events row
 * 2. With ANALYTICS_ENABLED=false, the listener early-returns and no rows are written (no-op gate)
 * 3. GET /api/analytics/events returns stored events for OPERATOR key, 401 without valid key
 */
describe('Analytics tracer (e2e)', () => {
  let app: INestApplication;
  let messageService: MessageService;
  let analyticsService: AnalyticsEventsService;
  let operatorKey: string;

  // Booting the full AppModule can exceed jest's 5s default on a cold run.
  jest.setTimeout(60000);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    messageService = app.get(MessageService);
    analyticsService = app.get(AnalyticsEventsService);

    // Mint an OPERATOR key for authenticated endpoint access
    const authService = app.get(AuthService);
    const apiKey = await authService.createApiKey({
      name: 'e2e-analytics-tracer-operator',
      role: ApiKeyRole.OPERATOR,
    });
    operatorKey = apiKey.key;
  });

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      /* ignore teardown-only multi-datasource quirk */
    }
  });

  describe('with ANALYTICS_ENABLED=true', () => {
    beforeAll(() => {
      process.env.ANALYTICS_ENABLED = 'true';
    });

    afterAll(() => {
      delete process.env.ANALYTICS_ENABLED;
    });

    it('processing one message writes exactly one analytics_events row with correct fields', async () => {
      // Arrange: synthetic incoming message with unique identifiers
      const sessionId = 'test-session-analytics';
      const chatId = `test-chat-analytics-${Date.now()}@c.us`;
      const from = `sender-analytics-${Date.now()}@s.whatsapp.net`;
      const body = `Analytics tracer test message at ${new Date().toISOString()}`;
      const expectedConversationId = `${chatId}:${new Date().toISOString().slice(0, 10)}`;

      // Act: Save the message (triggers message.processed event)
      const savedMessage = await messageService.saveIncomingMessage(sessionId, {
        chatId,
        from,
        to: 'bot@s.whatsapp.net',
        body,
        type: 'text',
        timestamp: Date.now(),
      });

      // Wait for async event handling to complete (EventEmitter2 is async)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: Query analytics_events via the service
      const events = await analyticsService.listRecent(10);
      const matchingEvent = events.find(
        (e) =>
          e.event_type === 'message.processed' &&
          e.session_id === sessionId &&
          e.chat_id === chatId &&
          e.user_id === from,
      );

      expect(matchingEvent).toBeDefined();
      expect(matchingEvent?.conversation_id).toBe(expectedConversationId);
      expect(matchingEvent?.latency_ms).toBeGreaterThan(0); // Processing took some time
      expect(matchingEvent?.payload).toEqual({ messageType: 'text' });
      expect(matchingEvent?.created_at).toBeInstanceOf(Date);
    });

    it('GET /api/analytics/events returns stored events for OPERATOR key', async () => {
      // Act: Call the REST endpoint with OPERATOR key
      const response = await request(app.getHttpServer())
        .get('/api/analytics/events?limit=10')
        .set('X-API-Key', operatorKey)
        .expect(200);

      // Assert: Response is an array of events
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0); // At least one event from previous test
      const event = response.body[0];
      expect(event.id).toBeDefined();
      expect(event.event_type).toBeDefined();
      expect(event.created_at).toBeDefined();
    });

    it('GET /api/analytics/events returns 401 without valid api-key', async () => {
      // Act & Assert: Call without api-key header
      await request(app.getHttpServer()).get('/api/analytics/events?limit=10').expect(401);
    });
  });

  describe('with ANALYTICS_ENABLED=false (default)', () => {
    beforeAll(() => {
      delete process.env.ANALYTICS_ENABLED; // Default is false
    });

    it('processing a message does NOT write any analytics_events rows', async () => {
      // Arrange: Count events before the test
      const eventsBefore = await analyticsService.listRecent(100);
      const countBefore = eventsBefore.length;

      // Arrange: synthetic message
      const sessionId = 'test-session-disabled';
      const chatId = `test-chat-disabled-${Date.now()}@c.us`;
      const from = `sender-disabled-${Date.now()}@s.whatsapp.net`;

      // Act: Save the message (event emitted but listener early-returns)
      await messageService.saveIncomingMessage(sessionId, {
        chatId,
        from,
        to: 'bot@s.whatsapp.net',
        body: 'Disabled analytics test',
        type: 'text',
        timestamp: Date.now(),
      });

      // Wait for async event handling
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert: No new analytics_events rows
      const eventsAfter = await analyticsService.listRecent(100);
      const countAfter = eventsAfter.length;
      expect(countAfter).toBe(countBefore); // No new rows
    });
  });
});
