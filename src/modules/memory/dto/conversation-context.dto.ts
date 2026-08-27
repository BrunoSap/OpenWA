/**
 * Phase 5 Plan 02: LLM context DTO (MEM-04).
 *
 * Returned by ConversationMemoryService.buildLLMContext, assembling:
 * - Recent messages (sliding window) mapped to LLM role format
 * - Summary of older messages (if total > window size)
 * - Total message count for context
 *
 * Consumed by n8n LLM workflows to enrich prompts with user conversation history.
 */
export class ConversationContextDto {
  /** Summary text of older messages (beyond window), or null if total <= window. */
  summary: string | null;

  /**
   * Recent messages in LLM role format.
   * Role: 'user' for incoming (user said), 'assistant' for outgoing (bot replied).
   */
  recentMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;

  /** Total message count for this user (all messages, not just recent). */
  totalMessages: number;
}
