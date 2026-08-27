/**
 * LLM Cost Calculation Utility
 *
 * Pricing as of 2026-08-27 (from RESEARCH.md §3.3):
 * - Groq: Free
 * - OpenAI gpt-4o-mini: $0.15/1M input, $0.60/1M output, $0.001/image
 */

// Pricing constants (per 1M tokens)
const OPENAI_GPT4O_MINI_INPUT_RATE = 0.15;
const OPENAI_GPT4O_MINI_OUTPUT_RATE = 0.60;
const OPENAI_IMAGE_COST = 0.001;

export interface LLMCostEvent {
  provider: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  images_count?: number;
}

/**
 * Calculate the cost in USD for an LLM API call.
 *
 * @param event - LLM call event with provider, model, and token counts
 * @returns Cost in USD (0 for Groq or unknown providers)
 */
export function calculateCost(event: LLMCostEvent): number {
  if (event.provider === 'groq') {
    return 0; // Groq is free
  }

  if (event.provider === 'openai') {
    const inputCost = (event.tokens_input / 1_000_000) * OPENAI_GPT4O_MINI_INPUT_RATE;
    const outputCost = (event.tokens_output / 1_000_000) * OPENAI_GPT4O_MINI_OUTPUT_RATE;
    const imageCost = (event.images_count || 0) * OPENAI_IMAGE_COST;

    return inputCost + outputCost + imageCost;
  }

  // Unknown provider
  return 0;
}
