import { ChatOpenAI } from '@langchain/openai';

/**
 * Analyze image using GPT-4 Vision API.
 *
 * @param imageBuffer - Image buffer (JPEG, PNG, WebP, or GIF format)
 * @param opts - Analysis options (prompt, model, detail level)
 * @returns Description, latency, token usage, and cost
 * @throws Error if OPENAI_API_KEY is not set or API request fails
 */
export async function analyzeImage(
  imageBuffer: Buffer,
  opts: {
    prompt?: string;
    model?: string;
    detail?: 'low' | 'high' | 'auto';
  } = {}
): Promise<{
  description: string;
  latencyMs: number;
  tokensUsed: { input: number; output: number };
  costUsd: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const model = opts.model || 'gpt-4o-mini';
  const prompt =
    opts.prompt ||
    'Descreva esta imagem em detalhe. Se houver texto visível, transcreva-o.';
  const detail = opts.detail || 'low';

  // Detect format from magic bytes
  const format = detectImageFormat(imageBuffer);
  if (format === 'unknown') {
    throw new Error(
      'Unsupported image format. Only JPEG, PNG, WebP, and GIF are supported.'
    );
  }

  const mimeType = formatToMimeType(format);

  // Encode to base64
  const base64Image = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64Image}`;

  const llm = new ChatOpenAI({
    model,
    apiKey,
    temperature: 0,
  });

  const startTime = Date.now();

  const response = await llm.invoke([
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: dataUrl,
            detail,
          },
        },
      ],
    },
  ]);

  const latencyMs = Date.now() - startTime;

  // Extract token usage from response metadata
  const responseMetadata = (response as any).response_metadata || {};
  const usage = responseMetadata.tokenUsage || responseMetadata.usage_metadata || {};
  const inputTokens = usage.promptTokens || usage.input_tokens || 0;
  const outputTokens = usage.completionTokens || usage.output_tokens || 0;

  // Calculate cost (GPT-4o-mini pricing as of 2024-10-16)
  const inputCostPer1M = model.includes('mini') ? 0.15 : 2.5;
  const outputCostPer1M = model.includes('mini') ? 0.6 : 10.0;
  const costUsd =
    (inputTokens / 1_000_000) * inputCostPer1M +
    (outputTokens / 1_000_000) * outputCostPer1M;

  return {
    description: response.content as string,
    latencyMs,
    tokensUsed: { input: inputTokens, output: outputTokens },
    costUsd,
  };
}

/**
 * Detect image format from magic bytes.
 *
 * @param buffer - Image buffer
 * @returns Image format ('jpeg', 'png', 'webp', 'gif', or 'unknown')
 */
export function detectImageFormat(
  buffer: Buffer
): 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown' {
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }

  // WebP: RIFF ... WEBP
  if (
    buffer.slice(0, 4).toString() === 'RIFF' &&
    buffer.slice(8, 12).toString() === 'WEBP'
  ) {
    return 'webp';
  }

  // GIF: GIF87a or GIF89a
  if (buffer.slice(0, 3).toString() === 'GIF') {
    return 'gif';
  }

  return 'unknown';
}

/**
 * Map image format to MIME type.
 *
 * @param format - Image format string
 * @returns MIME type string
 */
export function formatToMimeType(format: string): string {
  const map: Record<string, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[format] || 'application/octet-stream';
}

/**
 * Check semantic similarity between two image descriptions using LLM-as-judge.
 *
 * @param expected - Expected description
 * @param actual - Actual description from Vision API
 * @returns Similarity score (0.0-1.0) and explanation
 * @throws Error if OPENAI_API_KEY is not set or API request fails
 */
export async function semanticSimilarity(
  expected: string,
  actual: string
): Promise<{ score: number; explanation: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey,
    temperature: 0,
  });

  const prompt = `You are a grading assistant. Compare two image descriptions for semantic similarity.

EXPECTED DESCRIPTION: ${expected}

ACTUAL DESCRIPTION: ${actual}

Rate the semantic similarity on a scale of 0.0 to 1.0, where:
- 1.0 = Perfect match (same meaning, may differ in wording)
- 0.7-0.9 = Good match (captures main elements, minor differences)
- 0.5-0.7 = Partial match (some key elements present)
- 0.0-0.5 = Poor match (different content)

Focus on key visual elements: objects, colors, text content, scene composition, and overall subject matter.

Respond with JSON only: { "score": <number>, "explanation": "<string>" }`;

  const response = await llm.invoke([
    { role: 'system', content: 'You are a grading assistant.' },
    { role: 'user', content: prompt },
  ]);

  // Parse JSON response, handling potential markdown code fences
  let jsonString = (response.content as string).trim();

  // Remove markdown code fences if present
  if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const result = JSON.parse(jsonString);
    if (typeof result.score !== 'number' || typeof result.explanation !== 'string') {
      throw new Error('Invalid JSON response format: missing score or explanation');
    }
    return { score: result.score, explanation: result.explanation };
  } catch (error) {
    throw new Error(
      `Failed to parse LLM response as JSON: ${error instanceof Error ? error.message : 'unknown error'}. Response: ${jsonString}`
    );
  }
}

/**
 * Analyze image with automatic fallback handling.
 * If analysis fails (timeout or API error), returns a fallback result
 * instead of throwing an exception.
 *
 * @param imageBuffer - Image buffer (JPEG, PNG, WebP, or GIF format)
 * @param opts - Analysis options (prompt, model, detail, timeoutMs)
 * @returns Analysis result with ok flag and optional fallback reason
 */
export async function analyzeWithFallback(
  imageBuffer: Buffer,
  opts: {
    prompt?: string;
    model?: string;
    detail?: 'low' | 'high' | 'auto';
    timeoutMs?: number;
  } = {}
): Promise<{
  description: string;
  latencyMs: number;
  ok: boolean;
  fallbackReason?: 'timeout' | 'api_error';
}> {
  const timeoutMs = opts.timeoutMs || 10000;
  const startTime = Date.now();

  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    });

    // Race between analysis and timeout
    const result = await Promise.race([
      analyzeImage(imageBuffer, {
        prompt: opts.prompt,
        model: opts.model,
        detail: opts.detail,
      }),
      timeoutPromise,
    ]);

    return {
      description: result.description,
      latencyMs: result.latencyMs,
      ok: true,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof Error && error.message === 'TIMEOUT') {
      return {
        description: '',
        latencyMs,
        ok: false,
        fallbackReason: 'timeout',
      };
    }

    // API error or other failure (including unsupported format)
    return {
      description: '',
      latencyMs,
      ok: false,
      fallbackReason: 'api_error',
    };
  }
}

/**
 * Build a user-friendly fallback message when image analysis fails.
 * Returns a deterministic message instructing the user to resend.
 *
 * @param fallbackReason - Reason for analysis failure
 * @returns User-facing message string
 */
export function buildFallbackReply(fallbackReason: 'timeout' | 'api_error'): string {
  if (fallbackReason === 'timeout') {
    return 'Desculpe, não consegui processar sua imagem (tempo esgotado). Por favor, reenvie a imagem.';
  }

  return 'Desculpe, ocorreu um erro ao processar sua imagem. Por favor, reenvie a imagem.';
}
