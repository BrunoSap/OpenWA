import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { createLogger } from '../../../common/services/logger.service';
import { calculateCost } from '../services/analytics-cost.util';

/**
 * Phase 6 Plan 01-02: Analytics event listener (DASH-05).
 *
 * Consumes domain events emitted by the message service and persists them to analytics_events.
 * Gated by ANALYTICS_ENABLED config flag (T-06-01) — when disabled, the handler early-returns
 * and recordEvent is never called (zero persistence footprint).
 *
 * The listener is unconditionally registered (no conditional module import) because event
 * emission is cheap (in-process, no serialization) and the gate is evaluated per event,
 * allowing runtime enable/disable via config reload.
 *
 * Phase 6 Plan 02 adds handlers for: conversation.started, conversation.resolved,
 * conversation.escalated, llm.called, fallback.triggered.
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

  /**
   * Handles conversation.started events.
   *
   * @param payload - Event payload with sessionId, chatId, userId, conversationId
   */
  @OnEvent('conversation.started')
  async handleConversationStarted(payload: {
    sessionId: string;
    chatId: string;
    userId: string;
    conversationId: string;
  }) {
    if (!this.enabled) {
      return;
    }

    try {
      await this.analyticsService.recordEvent({
        event_type: 'conversation.started',
        session_id: payload.sessionId,
        chat_id: payload.chatId,
        user_id: payload.userId,
        conversation_id: payload.conversationId,
        payload: {},
      });
    } catch (error) {
      this.logger.error('Failed to record conversation.started event', error);
    }
  }

  /**
   * Handles conversation.resolved events (conversation ended without fallback).
   *
   * @param payload - Event payload with sessionId, chatId, userId, conversationId
   */
  @OnEvent('conversation.resolved')
  async handleConversationResolved(payload: {
    sessionId: string;
    chatId: string;
    userId: string;
    conversationId: string;
  }) {
    if (!this.enabled) {
      return;
    }

    try {
      await this.analyticsService.recordEvent({
        event_type: 'conversation.resolved',
        session_id: payload.sessionId,
        chat_id: payload.chatId,
        user_id: payload.userId,
        conversation_id: payload.conversationId,
        payload: {},
      });
    } catch (error) {
      this.logger.error('Failed to record conversation.resolved event', error);
    }
  }

  /**
   * Handles conversation.escalated events (fallback to human).
   *
   * @param payload - Event payload with sessionId, chatId, userId, conversationId
   */
  @OnEvent('conversation.escalated')
  async handleConversationEscalated(payload: {
    sessionId: string;
    chatId: string;
    userId: string;
    conversationId: string;
  }) {
    if (!this.enabled) {
      return;
    }

    try {
      await this.analyticsService.recordEvent({
        event_type: 'conversation.escalated',
        session_id: payload.sessionId,
        chat_id: payload.chatId,
        user_id: payload.userId,
        conversation_id: payload.conversationId,
        payload: {},
      });
    } catch (error) {
      this.logger.error('Failed to record conversation.escalated event', error);
    }
  }

  /**
   * Handles llm.called events and computes cost_usd.
   *
   * @param payload - Event payload with provider, model, tokens_input, tokens_output, latency_ms, images_count
   */
  @OnEvent('llm.called')
  async handleLLMCalled(payload: {
    provider: string;
    model: string;
    tokens_input: number;
    tokens_output: number;
    latency_ms: number;
    images_count?: number;
    sessionId?: string;
    chatId?: string;
    userId?: string;
    conversationId?: string;
  }) {
    if (!this.enabled) {
      return;
    }

    try {
      const costUsd = calculateCost({
        provider: payload.provider,
        model: payload.model,
        tokens_input: payload.tokens_input,
        tokens_output: payload.tokens_output,
        images_count: payload.images_count,
      });

      const tokensUsed = payload.tokens_input + payload.tokens_output;

      await this.analyticsService.recordEvent({
        event_type: 'llm.called',
        session_id: payload.sessionId || null,
        chat_id: payload.chatId || null,
        user_id: payload.userId || null,
        conversation_id: payload.conversationId || null,
        latency_ms: payload.latency_ms,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
        payload: {
          provider: payload.provider,
          model: payload.model,
          tokens_input: payload.tokens_input,
          tokens_output: payload.tokens_output,
          images_count: payload.images_count || 0,
        },
      });
    } catch (error) {
      this.logger.error('Failed to record llm.called event', error);
    }
  }

  /**
   * Handles fallback.triggered events (STT timeout, Vision error, RAG no-match, etc).
   *
   * @param payload - Event payload with stage, reason, and optional context fields
   */
  @OnEvent('fallback.triggered')
  async handleFallbackTriggered(payload: {
    stage: string;
    reason: string;
    sessionId?: string;
    chatId?: string;
    userId?: string;
    conversationId?: string;
  }) {
    if (!this.enabled) {
      return;
    }

    try {
      await this.analyticsService.recordEvent({
        event_type: 'fallback.triggered',
        session_id: payload.sessionId || null,
        chat_id: payload.chatId || null,
        user_id: payload.userId || null,
        conversation_id: payload.conversationId || null,
        payload: {
          stage: payload.stage,
          reason: payload.reason,
        },
      });
    } catch (error) {
      this.logger.error('Failed to record fallback.triggered event', error);
    }
  }
}
