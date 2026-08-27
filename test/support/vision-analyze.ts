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
