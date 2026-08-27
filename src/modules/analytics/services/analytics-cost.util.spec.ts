import { calculateCost } from './analytics-cost.util';

describe('calculateCost', () => {
  it('should return 0 for Groq provider', () => {
    const cost = calculateCost({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      tokens_input: 1_000_000,
      tokens_output: 500_000,
      images_count: 0,
    });
    expect(cost).toBe(0);
  });

  it('should calculate cost for OpenAI gpt-4o-mini input tokens', () => {
    const cost = calculateCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokens_input: 1_000_000,
      tokens_output: 0,
      images_count: 0,
    });
    expect(cost).toBe(0.15); // $0.15 per 1M input tokens
  });

  it('should calculate cost for OpenAI gpt-4o-mini output tokens', () => {
    const cost = calculateCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokens_input: 0,
      tokens_output: 1_000_000,
      images_count: 0,
    });
    expect(cost).toBe(0.60); // $0.60 per 1M output tokens
  });

  it('should calculate combined cost for input and output tokens', () => {
    const cost = calculateCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokens_input: 500_000,
      tokens_output: 200_000,
      images_count: 0,
    });
    // (500_000 / 1_000_000) * 0.15 + (200_000 / 1_000_000) * 0.60
    // = 0.075 + 0.12 = 0.195
    expect(cost).toBeCloseTo(0.195, 6);
  });

  it('should add image costs', () => {
    const cost = calculateCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokens_input: 1_000_000,
      tokens_output: 0,
      images_count: 2,
    });
    // 0.15 (input) + 0.002 (2 images)
    expect(cost).toBeCloseTo(0.152, 6);
  });

  it('should return 0 for unknown provider', () => {
    const cost = calculateCost({
      provider: 'unknown-provider',
      model: 'some-model',
      tokens_input: 1_000_000,
      tokens_output: 500_000,
      images_count: 0,
    });
    expect(cost).toBe(0);
  });

  it('should handle missing images_count as 0', () => {
    const cost = calculateCost({
      provider: 'openai',
      model: 'gpt-4o-mini',
      tokens_input: 1_000_000,
      tokens_output: 0,
      images_count: undefined,
    });
    expect(cost).toBe(0.15);
  });
});
