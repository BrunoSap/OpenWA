import FormData from 'form-data';

/**
 * Transcribe audio using Groq Whisper API.
 *
 * @param audio - Audio buffer (.ogg format from WhatsApp webhook)
 * @param opts - Transcription options (language, model)
 * @returns Transcribed text and latency in milliseconds
 * @throws Error if GROQ_API_KEY is not set or API request fails
 */
export async function transcribeOgg(
  audio: Buffer,
  opts: { language?: string; model?: string } = {}
): Promise<{ text: string; latencyMs: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY environment variable is not set');
  }

  const model = opts.model || 'whisper-large-v3';

  const form = new FormData();
  form.append('file', audio, {
    filename: 'audio.ogg',
    contentType: 'audio/ogg',
  });
  form.append('model', model);
  form.append('response_format', 'json');
  if (opts.language) {
    form.append('language', opts.language);
  }

  const startTime = Date.now();

  try {
    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form as any,
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();

    return {
      text: result.text || '',
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    if (error instanceof Error) {
      throw new Error(`Transcription failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Calculate word-level accuracy between expected and actual transcription.
 * Uses normalized token-based edit distance.
 *
 * @param expected - Expected transcription text
 * @param actual - Actual transcription text from API
 * @returns Accuracy score in range [0, 1] where 1 is perfect match
 */
export function wordAccuracy(expected: string, actual: string): number {
  // Normalize: lowercase, remove accents, remove punctuation, collapse whitespace
  const normalize = (text: string): string[] => {
    return text
      .toLowerCase()
      .normalize('NFD')          // Decompose accented characters
      .replace(/[̀-ͯ]/g, '') // Remove accent marks
      .replace(/[^\w\s]/g, '')   // Remove punctuation
      .replace(/\s+/g, ' ')      // Collapse whitespace
      .trim()
      .split(' ')
      .filter(w => w.length > 0);
  };

  const expectedTokens = normalize(expected);
  const actualTokens = normalize(actual);

  if (expectedTokens.length === 0 && actualTokens.length === 0) {
    return 1.0;
  }

  if (expectedTokens.length === 0 || actualTokens.length === 0) {
    return 0.0;
  }

  // Calculate Levenshtein distance at token level
  const distance = levenshteinDistance(expectedTokens, actualTokens);
  const maxLen = Math.max(expectedTokens.length, actualTokens.length);

  // Accuracy = 1 - (normalized distance)
  return Math.max(0, 1 - distance / maxLen);
}

/**
 * Calculate Levenshtein distance between two token arrays.
 * Dynamic programming implementation.
 */
function levenshteinDistance(a: string[], b: string[]): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
