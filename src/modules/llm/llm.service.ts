import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createLogger } from '../../common/services/logger.service';

/**
 * Phase 6 Plan 02: LLM Service with analytics event emission (DASH-02).
 *
 * This service serves as an integration point for LLM API calls (Groq, OpenAI).
 * In the current architecture, LLM calls are primarily handled via n8n workflows,
 * but this service provides a programmatic interface and ensures all LLM calls
 * emit analytics events for cost tracking and performance monitoring.
 *
 * When LLM functionality is migrated from n8n to direct service calls, the
 * implementation can be expanded here while maintaining the analytics contract.
 */
@Injectable()
export class LLMService {
  private readonly logger = createLogger('LLMService');

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit an llm.called analytics event.
   *
   * This method should be called after every LLM API call to track tokens, cost, and latency.
   * Currently used as a helper for manual instrumentation; future direct LLM calls will
   * invoke this automatically.
   *
   * @param payload - LLM call metadata
   */
  emitLLMCalledEvent(payload: {
    provider: 'groq' | 'openai' | string;
    model: string;
    tokens_input: number;
    tokens_output: number;
    latency_ms: number;
    images_count?: number;
    sessionId?: string;
    chatId?: string;
    userId?: string;
    conversationId?: string;
  }): void {
    try {
      this.eventEmitter.emit('llm.called', payload);
    } catch (error) {
      this.logger.error('Failed to emit llm.called event', error);
    }
  }

  /**
   * Placeholder for future direct LLM API integration.
   *
   * When implemented, this method will:
   * 1. Call Groq or OpenAI API
   * 2. Parse response and extract token usage
   * 3. Emit llm.called event via emitLLMCalledEvent
   * 4. Return the LLM response
   *
   * For now, LLM calls are handled via n8n workflows.
   */
  // async callLLM(prompt: string, options: LLMOptions): Promise<LLMResponse> {
  //   const startTime = Date.now();
  //   // ... LLM API call ...
  //   const latencyMs = Date.now() - startTime;
  //   this.emitLLMCalledEvent({ ... });
  //   return response;
  // }
}
