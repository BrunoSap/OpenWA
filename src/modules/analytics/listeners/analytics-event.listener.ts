import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 6 Plan 01: Analytics event listener (DASH-05).
 *
 * Consumes domain events emitted by the message service and persists them to analytics_events.
 * Gated by ANALYTICS_ENABLED config flag (T-06-01) — when disabled, the handler early-returns
 * and recordEvent is never called (zero persistence footprint).
 *
 * The listener is unconditionally registered (no conditional module import) because event
 * emission is cheap (in-process, no serialization) and the gate is evaluated per event,
 * allowing runtime enable/disable via config reload.
 */
@Injectable()
export class AnalyticsEventListener {
  private readonly logger = createLogger('AnalyticsEventListener');

  constructor(
    private readonly configService: ConfigService,
    private readonly analyticsService: AnalyticsEventsService,
  ) {}

  /**
   * Returns true if analytics collection is enabled via ANALYTICS_ENABLED=true.
   */
  private get enabled(): boolean {
    return this.configService.get<boolean>('analytics.enabled', false);
  }

  /**
   * Handles message.processed events and persists them to analytics_events.
   *
   * @param payload - Event payload with sessionId, chatId, userId, conversationId, latencyMs, messageType
   */
  @OnEvent('message.processed')
  async handleMessageProcessed(payload: {
    sessionId: string;
    chatId: string;
    userId: string;
    conversationId: string;
    latencyMs: number;
    messageType: string;
  }) {
    if (!this.enabled) {
      return; // Gate: no-op when analytics disabled
    }

    try {
      await this.analyticsService.recordEvent({
        event_type: 'message.processed',
        session_id: payload.sessionId,
        chat_id: payload.chatId,
        user_id: payload.userId,
        conversation_id: payload.conversationId,
        latency_ms: payload.latencyMs,
        payload: {
          messageType: payload.messageType,
        },
      });
    } catch (error) {
      // Log but don't throw — analytics failures should not break message processing
      this.logger.error('Failed to record message.processed event', error);
    }
  }
}
