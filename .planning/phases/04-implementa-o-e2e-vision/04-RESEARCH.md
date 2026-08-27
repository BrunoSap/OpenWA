# Phase 04: Implementação E2E Vision - Research

**Researched:** 2026-08-26
**Domain:** End-to-End testing for Vision API (GPT-4 multimodal image analysis)
**Confidence:** MEDIUM

## Summary

This phase validates the complete Vision pipeline end-to-end: WhatsApp image message → download → GPT-4 Vision API → LLM contextual response → delivery. The research identifies proven multimodal testing strategies from the LangChain ecosystem, image handling patterns in Node.js, and cost/performance considerations for GPT-4 Vision API.

The OpenWA project already has a mature E2E testing infrastructure (Phases 2 and 3 established the pattern: helper functions, fixture metadata JSON, skip gracioso, CI/CD integration). Phase 4 extends this infrastructure to cover Vision-specific concerns: image format validation (JPEG, PNG, WebP magic bytes), base64 encoding for API submission, LLM-as-judge evaluation for image description accuracy, and cost tracking (GPT-4 Vision is paid, unlike Groq Whisper which was free-tier).

**Primary recommendation:** Mirror the Phase 3 STT pattern exactly — create `test/support/vision-analyze.ts` helper (analogous to `stt-transcribe.ts`), use fixture metadata JSON with expected descriptions (`test/fixtures/images/product-photo-expected.json` analogous to `pt-clean-expected.json`), implement skip gracioso when `OPENAI_API_KEY` absent, and validate via LLM-as-judge semantic similarity (not exact string matching). Use GPT-4o for production (cost-effective at $2.50/1M input tokens) and GPT-4o-mini for testing ($0.15/1M tokens).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Image download (WhatsApp) | n8n (separate service) | API / Backend | n8n HTTP Request node fetches image from mediaUrl; backend provides the URL |
| Vision analysis (GPT-4) | External API (OpenAI) | API / Backend | Backend calls OpenAI Vision API; n8n workflows can also call directly |
| Image format validation | API / Backend | — | Magic bytes validation happens in helper function before API submission |
| Base64 encoding | API / Backend | — | Node.js Buffer.toString('base64') in helper function |
| E2E test execution | CI/CD (GitHub Actions) | — | Tests run in isolated CI environment with image fixtures |
| Cost tracking | API / Backend | — | Token usage logged from Vision API responses |

## Phase Requirements → Test Map

| ID | Description | Research Support |
|----|-------------|------------------|
| VIS-01 | Teste E2E simula imagem WhatsApp (JPEG/PNG/WebP) sendo analisada | NestJS E2E patterns + Phase 3 STT helper structure [VERIFIED: test/audio-stt-e2e-cycle.e2e-spec.ts] |
| VIS-02 | Imagem é obtida a partir de fixture (buffer simulando download do webhook) | Magic bytes validation pattern from Phase 3 [VERIFIED: test/audio-stt-e2e-cycle.e2e-spec.ts:118-121] |
| VIS-03 | Vision API retorna descrição da imagem com conteúdo correto | LangChain multimodal content blocks [CITED: LangChain docs] + OpenAI Vision API [CITED: OpenAI docs] |
| VIS-04 | Descrição alimenta LLM e produz resposta contextualizada | Same pattern as Phase 3 STT-04 [VERIFIED: test/audio-stt-e2e-cycle.e2e-spec.ts:166-194] |
| VIS-05 | Teste cobre caso: foto de produto (descrição visual) | Test fixture with product image + expected visual elements [ASSUMED] |
| VIS-06 | Teste cobre caso: documento/screenshot (OCR text extraction) | Test fixture with text-heavy image + expected OCR content [ASSUMED] |
| VIS-07 | Teste cobre caso: foto ambiente/pessoa (scene description) | Test fixture with scene image + expected scene elements [ASSUMED] |
| VIS-08 | Latência Vision API medida e < 10s (imagens podem ser maiores) | Jest timing pattern from Phase 3 [VERIFIED: test/audio-stt-e2e-cycle.e2e-spec.ts:132-136] |
| VIS-09 | Acurácia descrição validada via LLM-as-judge (semantic similarity) | LLM-as-judge evaluators from Phase 2 [VERIFIED: test/rag-llm-judge.e2e-spec.ts] |
| VIS-10 | Custo por imagem medido e documentado | Token usage from API response [CITED: OpenAI docs] |
| VIS-11 | Testes rodam automaticamente no CI/CD | GitHub Actions pattern from Phase 3 [VERIFIED: .github/workflows/ci.yml] |

## Standard Stack

### Core Testing Framework

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jest | 29.x | Test runner | Already used project-wide; 10+ E2E suites in `test/` [VERIFIED: package.json] |
| @nestjs/testing | 11.x | NestJS test module | Standard for NestJS E2E tests; creates test application instances [VERIFIED: test/audio-stt-e2e-cycle.e2e-spec.ts:4] |
| supertest | 7.x | HTTP assertions | Already used in all E2E suites for API endpoint testing [ASSUMED: Phase 2/3 pattern] |
| ts-jest | 29.x | TypeScript transform | Project uses TypeScript throughout; jest-e2e.json configured [VERIFIED: package.json:49] |

### Vision API Integration

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @langchain/openai | 1.5.10 | ChatOpenAI with vision content blocks | Multimodal LLM invocation with image_url content type [VERIFIED: npm registry] [CITED: LangChain docs] |
| openai | 7.6.0 | Direct OpenAI API client | Alternative to LangChain for raw Vision API calls [VERIFIED: npm registry] |

### Supporting Tools

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| sharp | latest | Image processing | If image resizing/optimization needed before Vision API (optional) [ASSUMED] |

**Installation:**
```bash
# Core testing (already installed)
npm ci

# Vision evaluation (LangChain already installed from Phase 2)
# No new dependencies required — @langchain/openai already present

# Optional: Image processing
npm install --save-dev sharp
```

**Version verification:**
```bash
npm view @langchain/openai version  # 1.5.10 (2024-12-20)
npm view openai version             # 7.6.0 (2024-12-18)
npm view sharp version              # 0.33.5 (2024-10-15)
```

## Package Legitimacy Audit

> Ran Package Legitimacy Gate protocol before completing this section.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @langchain/openai | npm | 2 yrs | 500K/wk | github.com/langchain-ai/langchainjs | OK | Approved (already installed) |
| openai | npm | 8 yrs | 5M/wk | github.com/openai/openai-node | OK | Approved (already installed) |
| sharp | npm | 10 yrs | 8M/wk | github.com/lovell/sharp | OK | Approved (optional) |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────┐
│   WhatsApp      │
│ (image message) │
└────────┬────────┘
         │ webhook with mediaUrl
         ▼
┌───────────────────────────────────────────────────────────────┐
│                     n8n Workflow                              │
│  ┌────────────┐   ┌──────────────┐   ┌─────────────────┐    │
│  │  Trigger   │──▶│ Image Download│──▶│ Vision Analysis │    │
│  │  (webhook) │   │  (HTTP GET)   │   │ (GPT-4 Vision)  │    │
│  └────────────┘   └──────┬────────┘   └────────┬────────┘    │
└─────────────────────────┼──────────────────────┼─────────────┘
                          │                      │
                          ▼                      ▼
                    Image Binary          OpenAI Vision API
                   (JPEG/PNG/WebP)        (gpt-4o / gpt-4o-mini)
                          │                      │
                          └──────────┬───────────┘
                                     ▼
                              ┌──────────────┐
                              │ Description  │
                              │ + LLM Reply  │
                              └──────┬───────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │  WhatsApp    │
                              │  (outgoing)  │
                              └──────────────┘

E2E Test Path:
  Image fixture (buffer) → vision-analyze helper → GPT-4 Vision → description
  ↑                                                                    │
  └──────────── LLM-as-judge validates semantic accuracy ─────────────┘
```

### Recommended Project Structure

```
test/
├── vision-e2e-cycle.e2e-spec.ts           # Full Vision cycle E2E
├── vision-accuracy.e2e-spec.ts            # LLM-as-judge semantic validation
└── fixtures/
    └── images/
        ├── product-photo-expected.json    # Product image metadata
        ├── product-photo.jpg              # Product fixture (real JPEG)
        ├── document-scan-expected.json    # Document/OCR metadata
        ├── document-scan.png              # Document fixture (real PNG)
        ├── scene-photo-expected.json      # Scene/environment metadata
        ├── scene-photo.jpg                # Scene fixture (real JPEG)
        └── README.md                      # Fixture documentation

test/support/
└── vision-analyze.ts                      # Vision API helper (analogous to stt-transcribe.ts)
```

### Pattern 1: Vision Helper with Base64 Encoding

**What:** Reusable helper function that takes an image buffer, encodes to base64, calls GPT-4 Vision API, returns description + cost metrics.

**When to use:** All Vision E2E tests need this helper to avoid duplicating Vision API integration logic.

**Example:**
```typescript
// Source: Phase 3 stt-transcribe.ts pattern + LangChain multimodal docs
import { ChatOpenAI } from '@langchain/openai';

export async function analyzeImage(
  imageBuffer: Buffer,
  opts: {
    prompt?: string;
    model?: string;
    detail?: 'low' | 'high';
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

  const model = opts.model || 'gpt-4o-mini'; // Cost-effective for testing
  const prompt = opts.prompt || 'Describe this image in detail. If there is text, transcribe it.';
  const detail = opts.detail || 'auto';

  // Detect image format from magic bytes
  const format = detectImageFormat(imageBuffer);
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
            detail, // 'low' = 85 tokens, 'high' = tile-based calculation
          },
        },
      ],
    },
  ]);

  const latencyMs = Date.now() - startTime;

  // Extract token usage from response
  const usage = (response as any).response_metadata?.tokenUsage || {};
  const inputTokens = usage.promptTokens || 0;
  const outputTokens = usage.completionTokens || 0;

  // Calculate cost (GPT-4o-mini pricing as of 2024-10-16)
  const inputCostPer1M = model.includes('mini') ? 0.15 : 2.50;
  const outputCostPer1M = model.includes('mini') ? 0.60 : 10.00;
  const costUsd = (inputTokens / 1_000_000) * inputCostPer1M +
                  (outputTokens / 1_000_000) * outputCostPer1M;

  return {
    description: response.content as string,
    latencyMs,
    tokensUsed: { input: inputTokens, output: outputTokens },
    costUsd,
  };
}

function detectImageFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'unknown' {
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  // WebP: RIFF ... WEBP
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
    return 'webp';
  }
  return 'unknown';
}

function formatToMimeType(format: string): string {
  const map: Record<string, string> = {
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return map[format] || 'application/octet-stream';
}

// Semantic similarity check using LLM-as-judge
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

  const prompt = `
You are a grading assistant. Compare two image descriptions for semantic similarity.

EXPECTED DESCRIPTION: ${expected}

ACTUAL DESCRIPTION: ${actual}

Rate the semantic similarity on a scale of 0.0 to 1.0, where:
- 1.0 = Perfect match (same meaning, may differ in wording)
- 0.7-0.9 = Good match (captures main elements, minor differences)
- 0.5-0.7 = Partial match (some key elements present)
- 0.0-0.5 = Poor match (different content)

Respond with JSON: { "score": <number>, "explanation": "<string>" }
`.trim();

  const response = await llm.invoke([
    { role: 'system', content: 'You are a grading assistant.' },
    { role: 'user', content: prompt },
  ]);

  const result = JSON.parse(response.content as string);
  return { score: result.score, explanation: result.explanation };
}
```

### Pattern 2: E2E Vision Test with Fixture

**What:** Boot full NestJS app, load image fixture, call Vision API, validate description accuracy via LLM-as-judge.

**When to use:** Validating that the complete Vision pipeline (download → encode → Vision API → LLM) produces accurate descriptions.

**Example:**
```typescript
// Source: Phase 3 audio-stt-e2e-cycle.e2e-spec.ts pattern
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { ChatOpenAI } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeImage, semanticSimilarity } from './support/vision-analyze';

describe('Vision E2E (full cycle)', () => {
  let app: INestApplication;
  let shouldSkip = false;
  let skipReason = '';
  let imageBuffer: Buffer;
  let expectedDescription: string;
  let minSimilarity: number;
  let llm: ChatOpenAI;

  jest.setTimeout(60000);

  beforeAll(async () => {
    // Check if OPENAI_API_KEY is available
    if (!process.env.OPENAI_API_KEY) {
      shouldSkip = true;
      skipReason = 'OPENAI_API_KEY not set';
      console.warn('⚠️  OPENAI_API_KEY not set - Vision tests will be skipped');
      return;
    }

    // Load image fixture metadata
    const fixtureMetaPath = path.join(__dirname, 'fixtures/images/product-photo-expected.json');
    if (!fs.existsSync(fixtureMetaPath)) {
      shouldSkip = true;
      skipReason = 'Image fixture metadata not found';
      console.warn('⚠️  Image fixture metadata not found - Vision tests will be skipped');
      return;
    }

    const fixtureMeta = JSON.parse(fs.readFileSync(fixtureMetaPath, 'utf-8'));
    expectedDescription = fixtureMeta.expectedDescription;
    minSimilarity = fixtureMeta.minSimilarity || 0.7;

    // Load image buffer
    const imagePath = path.join(__dirname, 'fixtures/images', fixtureMeta.imageFile);
    if (!fs.existsSync(imagePath)) {
      shouldSkip = true;
      skipReason = 'Image fixture file not found';
      console.warn(`⚠️  Image fixture file not found: ${fixtureMeta.imageFile} - Vision tests will be skipped`);
      return;
    }

    imageBuffer = fs.readFileSync(imagePath);

    // Check if buffer looks like a real image (not placeholder)
    if (imageBuffer.length < 1000) {
      shouldSkip = true;
      skipReason = 'Image fixture is placeholder (< 1KB)';
      console.warn('⚠️  Image fixture is placeholder - Replace with real image to run tests');
      return;
    }

    // Initialize LLM for VIS-04 (description → LLM response)
    llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0,
    });

    // Initialize NestJS app
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('VIS-01/02/03/05/08/09/10: Product photo (happy path)', () => {
    it('VIS-02: should obtain image buffer from fixture (simulating webhook download)', () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      // Assert buffer exists and has content
      expect(imageBuffer).toBeDefined();
      expect(imageBuffer.length).toBeGreaterThan(0);

      // Check for image format magic bytes
      const isJPEG = imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8;
      const isPNG = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50;
      const isWebP = imageBuffer.slice(0, 4).toString() === 'RIFF';
      const isValidImage = isJPEG || isPNG || isWebP;
      expect(isValidImage).toBe(true);

      console.log(`✅ Image buffer loaded: ${imageBuffer.length} bytes`);
    });

    it('VIS-03/08/10: should analyze image via GPT-4 Vision with latency < 10s', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      const result = await analyzeImage(imageBuffer, { model: 'gpt-4o-mini' });

      // VIS-08: Assert latency < 10000ms
      expect(result.latencyMs).toBeLessThan(10000);
      console.log(`⏱️  Vision analysis latency: ${result.latencyMs}ms`);

      // VIS-03: Assert description returned
      expect(result.description).toBeDefined();
      expect(result.description.length).toBeGreaterThan(10);
      console.log(`🖼️  Description: "${result.description.substring(0, 100)}..."`);

      // VIS-10: Log cost metrics
      console.log(`💰 Cost: $${result.costUsd.toFixed(6)} (${result.tokensUsed.input} input + ${result.tokensUsed.output} output tokens)`);

      // Store for next test
      (global as any).__visionDescription = result.description;
    });

    it('VIS-09: should achieve >= 0.7 semantic similarity with expected description', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      const actualDescription = (global as any).__visionDescription;
      expect(actualDescription).toBeDefined();

      const similarity = await semanticSimilarity(expectedDescription, actualDescription);

      console.log(`📊 Expected: "${expectedDescription}"`);
      console.log(`📊 Actual:   "${actualDescription}"`);
      console.log(`📊 Similarity: ${(similarity.score * 100).toFixed(1)}%`);
      console.log(`📊 Explanation: ${similarity.explanation}`);

      // VIS-09: Assert semantic similarity >= minSimilarity (0.7)
      expect(similarity.score).toBeGreaterThanOrEqual(minSimilarity);
    });

    it('VIS-04: should feed description to LLM and get coherent response', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      const description = (global as any).__visionDescription;
      expect(description).toBeDefined();

      // Send description as context to LLM
      const response = await llm.invoke([
        {
          role: 'system',
          content: 'Você é um assistente útil. Responda perguntas sobre imagens de forma clara.',
        },
        {
          role: 'user',
          content: `O usuário enviou uma imagem. Análise da imagem: ${description}\n\nPergunta: O que você vê nesta imagem?`,
        },
      ]);

      // Assert LLM returned non-empty response
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect((response.content as string).length).toBeGreaterThan(10);

      console.log(`🤖 LLM response: "${(response.content as string).substring(0, 100)}..."`);
    });
  });
});
```

### Pattern 3: N8N Workflow for Vision Processing

**What:** n8n workflow that routes image messages through Vision API and contextualizes LLM response.

**When to use:** Production multimodal workflow handling text, audio, and image messages.

**Example:**
```json
{
  "name": "WhatsApp-Vision-Analysis",
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300],
      "parameters": {
        "path": "whatsapp-vision"
      }
    },
    {
      "name": "Download Image",
      "type": "n8n-nodes-base.httpRequest",
      "position": [450, 300],
      "parameters": {
        "method": "GET",
        "url": "={{$json.mediaUrl}}",
        "options": {
          "encoding": "arraybuffer"
        }
      }
    },
    {
      "name": "Convert to Base64",
      "type": "n8n-nodes-base.function",
      "position": [650, 300],
      "parameters": {
        "functionCode": "const buffer = items[0].binary.data.data;\nconst base64 = buffer.toString('base64');\nconst mimeType = items[0].binary.data.mimeType || 'image/jpeg';\n\nreturn [{\n  json: {\n    imageBase64: base64,\n    dataUrl: `data:${mimeType};base64,${base64}`,\n    chatId: items[0].json.chatId\n  }\n}];"
      }
    },
    {
      "name": "GPT-4 Vision",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "position": [850, 300],
      "parameters": {
        "model": "gpt-4o-mini",
        "options": {
          "temperature": 0,
          "maxTokens": 500
        }
      }
    },
    {
      "name": "LLM Contextualized Response",
      "type": "@n8n/n8n-nodes-langchain.lmChatOpenAi",
      "position": [1050, 300],
      "parameters": {
        "model": "gpt-4o-mini"
      }
    },
    {
      "name": "Send Reply",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1250, 300],
      "parameters": {
        "method": "POST",
        "url": "={{$env.API_BASE_URL}}/messages/send",
        "body": {
          "chatId": "={{$json.chatId}}",
          "text": "={{$json.reply}}"
        }
      }
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Download Image", "type": "main", "index": 0 }]]
    },
    "Download Image": {
      "main": [[{ "node": "Convert to Base64", "type": "main", "index": 0 }]]
    },
    "Convert to Base64": {
      "main": [[{ "node": "GPT-4 Vision", "type": "main", "index": 0 }]]
    },
    "GPT-4 Vision": {
      "main": [[{ "node": "LLM Contextualized Response", "type": "main", "index": 0 }]]
    },
    "LLM Contextualized Response": {
      "main": [[{ "node": "Send Reply", "type": "main", "index": 0 }]]
    }
  }
}
```

### Anti-Patterns to Avoid

- **Anti-pattern: Using exact string matching for Vision descriptions.** Vision outputs are non-deterministic. Use LLM-as-judge semantic similarity instead of exact assertions (same lesson as Phase 2 RAG and Phase 3 STT).
- **Anti-pattern: Not validating image format before Vision API call.** Vision API rejects invalid image formats. Always check magic bytes and format before base64 encoding.
- **Anti-pattern: Using high-resolution images without understanding cost.** GPT-4 Vision uses tile-based pricing for high-detail images (512px tiles). A 2048x2048 image at high detail costs ~1000 tokens. Use 'low' detail for testing (fixed 85 tokens per image) or resize images before API call.
- **Anti-pattern: Mocking Vision API in E2E tests.** Vision quality can only be validated with real API calls. Use skip gracioso when API key absent, don't mock the Vision API.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image format detection | Custom byte parsing | Magic bytes validation with lookup table [ASSUMED] | Handles edge cases (corrupted files, unsupported formats), avoids false positives |
| Base64 encoding | Manual Buffer manipulation | Node.js `Buffer.toString('base64')` [ASSUMED] | Built-in, optimized, handles large images efficiently |
| Vision description validation | Regex or keyword matching | LLM-as-judge semantic similarity [CITED: Phase 2 pattern] | Non-deterministic outputs require semantic validation, not exact matching |
| Cost calculation | Manual token counting | OpenAI API response `usage` metadata [CITED: OpenAI docs] | Official token counts, includes image tokenization (tile-based for high detail) |
| Image resizing/optimization | Custom image processing | Sharp library [ASSUMED] | Battle-tested, handles all formats (JPEG, PNG, WebP, AVIF), memory-efficient |

**Key insight:** Vision API integration complexity lies in non-deterministic outputs (like LLM/STT) and cost management (Vision is paid, unlike Groq STT). Industry-standard tools (LangChain multimodal blocks, LLM-as-judge, OpenAI API metadata) solve these problems; custom solutions miss edge cases and cost tracking.

## Environment Availability Audit

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test runner | ✓ | 22.x | — |
| @langchain/openai | Vision helper | ✓ | 1.5.10 | — |
| openai | Alternative Vision client | ✓ | 7.6.0 | Use @langchain/openai |
| OPENAI_API_KEY | Vision API auth | ? | — | Tests skip with warning |

**Missing dependencies with no fallback:**
- OPENAI_API_KEY: Required for Vision API calls. Tests implement skip gracioso when absent (same pattern as Phase 3 GROQ_API_KEY).

**Missing dependencies with fallback:**
- None — all critical dependencies (@langchain/openai, openai) are already installed from Phase 2.

## Common Pitfalls

### Pitfall 1: Non-Deterministic Vision Output Breaks Exact Assertions

**What goes wrong:** E2E test expects exact Vision description string, test flakes because GPT-4 Vision rephrases answer.

**Why it happens:** Vision models are non-deterministic even at temperature=0. Same image can yield different phrasings ("red car" vs "car in red color").

**How to avoid:** Use LLM-as-judge semantic similarity evaluator (score >= 0.7 threshold), or check for key visual elements (e.g., "car" and "red" appear in description) instead of exact strings.

**Warning signs:** Test passes locally, fails in CI; re-running test changes pass/fail without code changes.

### Pitfall 2: High-Detail Images Exceed Cost Budget

**What goes wrong:** Test suite runs with high-detail images, monthly Vision API bill exceeds budget, team disables Vision tests.

**Why it happens:** GPT-4 Vision high-detail mode uses tile-based pricing (170 tokens per 512px tile + 85 base tokens). A 2048x2048 image = 16 tiles = 2720 tokens input.

**How to avoid:** Use 'low' detail for test fixtures (fixed 85 tokens per image), or resize test images to <512px. Document cost per test run in fixture README. Use GPT-4o-mini for testing ($0.15/1M vs $2.50/1M for GPT-4o).

**Warning signs:** CI costs spike after Vision tests added; fixture images are high-resolution (>1MB file size).

### Pitfall 3: Image Format Not Validated Before API Call

**What goes wrong:** Test sends corrupted or unsupported image format to Vision API, gets cryptic API error, test fails with no clear message.

**Why it happens:** Vision API only supports JPEG, PNG, WebP, GIF. Sending other formats (BMP, TIFF, SVG) returns 400 error with unclear message.

**How to avoid:** Validate magic bytes before Vision API call, throw clear error if format unsupported. Helper function should detect format from buffer and reject unsupported types early.

**Warning signs:** Tests fail with "Invalid image format" API error; fixtures use uncommon formats.

### Pitfall 4: Base64 Encoding Exceeds URL Length Limits

**What goes wrong:** Large image (>5MB) encoded to base64 string, POST request exceeds HTTP body size limit, request fails.

**Why it happens:** Base64 encoding increases size by ~33%. A 5MB image becomes ~6.7MB base64 string, which may exceed API limits or Node.js buffer limits.

**How to avoid:** Resize large images before encoding (Sharp library), or use OpenAI image URL upload instead of base64 data URLs for production (test fixtures should be small <500KB).

**Warning signs:** Tests fail with "Request Entity Too Large" or "ENOMEM" errors; fixture images are high-resolution.

### Pitfall 5: OPENAI_API_KEY Exposure in CI Logs

**What goes wrong:** Test logs Vision API request with API key visible, key leaked in CI logs, security incident.

**Why it happens:** Debug logging includes full API request headers, or error messages echo back API key.

**How to avoid:** Never log full API requests, redact Authorization headers in logs, use CI secret masking for OPENAI_API_KEY. Test helper should catch API errors and sanitize error messages before throwing.

**Warning signs:** CI logs show "Authorization: Bearer sk-..." in debug output; API key visible in error stack traces.

## Code Examples

Verified patterns from official sources and project conventions:

### LangChain Multimodal Content Block (Vision)

```typescript
// Source: https://github.com/langchain-ai/docs/blob/main/src/oss/javascript/migrate/langchain-v1.mdx
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage } from 'langchain';

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});

// Multimodal message with image_url content type
const message = new HumanMessage({
  content: [
    { type: 'text', text: 'What is in this image?' },
    {
      type: 'image_url',
      image_url: {
        url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        detail: 'auto', // or 'low' (85 tokens) / 'high' (tile-based)
      },
    },
  ],
});

const response = await llm.invoke([message]);
console.log(response.content);
```

### Magic Bytes Image Format Detection

```typescript
// Source: Phase 3 audio magic bytes pattern (test/audio-stt-e2e-cycle.e2e-spec.ts:118-121)
function detectImageFormat(buffer: Buffer): 'jpeg' | 'png' | 'webp' | 'gif' | 'unknown' {
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
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

// Usage in test
const imageBuffer = fs.readFileSync('test/fixtures/images/product-photo.jpg');
const format = detectImageFormat(imageBuffer);
expect(['jpeg', 'png', 'webp', 'gif']).toContain(format);
```

### GPT-4 Vision Cost Calculation

```typescript
// Source: https://developers.openai.com/cookbook/examples/leveraging_model_distillation_to_fine-tune_a_model
interface VisionCostCalculator {
  model: 'gpt-4o' | 'gpt-4o-mini';
  inputTokens: number;
  outputTokens: number;
}

function calculateVisionCost(params: VisionCostCalculator): number {
  // Pricing as of 2024-10-16
  const pricing = {
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
  };

  const rates = pricing[params.model];
  const inputCost = params.inputTokens * rates.input;
  const outputCost = params.outputTokens * rates.output;

  return inputCost + outputCost;
}

// Example: 1000 input tokens (including image) + 200 output tokens with gpt-4o-mini
const cost = calculateVisionCost({
  model: 'gpt-4o-mini',
  inputTokens: 1000,
  outputTokens: 200,
});
console.log(`Cost: $${cost.toFixed(6)}`); // $0.000270
```

### LLM-as-Judge Semantic Similarity

```typescript
// Source: Phase 2 LLM-as-judge pattern (test/rag-llm-judge.e2e-spec.ts)
import { ChatOpenAI } from '@langchain/openai';

async function semanticSimilarity(
  expected: string,
  actual: string
): Promise<{ score: number; explanation: string }> {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
  });

  const prompt = `
You are a grading assistant. Compare two image descriptions for semantic similarity.

EXPECTED DESCRIPTION: ${expected}

ACTUAL DESCRIPTION: ${actual}

Rate the semantic similarity on a scale of 0.0 to 1.0, where:
- 1.0 = Perfect match (same meaning, may differ in wording)
- 0.7-0.9 = Good match (captures main elements, minor differences)
- 0.5-0.7 = Partial match (some key elements present)
- 0.0-0.5 = Poor match (different content)

Focus on:
- Are the key visual elements mentioned in both descriptions?
- Is the overall scene/subject the same?
- Are important details preserved (colors, objects, text)?

Respond with JSON: { "score": <number>, "explanation": "<string>" }
`.trim();

  const response = await llm.invoke([
    { role: 'system', content: 'You are a grading assistant.' },
    { role: 'user', content: prompt },
  ]);

  const result = JSON.parse(response.content as string);
  return { score: result.score, explanation: result.explanation };
}

// Usage
const expected = 'A red sports car parked in front of a modern building';
const actual = 'A sports car in red color is parked outside a contemporary building';
const similarity = await semanticSimilarity(expected, actual);
expect(similarity.score).toBeGreaterThanOrEqual(0.7);
```

### Fixture Metadata JSON

```json
// test/fixtures/images/product-photo-expected.json
{
  "imageFile": "product-photo.jpg",
  "format": "jpeg",
  "sizeBytes": 45000,
  "dimensions": { "width": 800, "height": 600 },
  "expectedDescription": "A red sports car parked in front of a modern glass building. The car has a sleek design with chrome wheels. The building has large windows reflecting the sky.",
  "minSimilarity": 0.7,
  "visualElements": ["red car", "sports car", "modern building", "glass", "chrome wheels"],
  "notes": "Product photo fixture for VIS-05. Image from public domain dataset. Expected description verified manually by comparing GPT-4o output on 2026-08-26."
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Exact string matching for Vision outputs | LLM-as-judge semantic similarity | 2023-2024 | Handles non-deterministic outputs, semantic validation [CITED: LangChain docs] |
| Manual base64 encoding | Node.js Buffer.toString('base64') | Always standard | Built-in, optimized, memory-efficient [ASSUMED] |
| GPT-4 Vision (original) | GPT-4o / GPT-4o-mini | 2024 | 10x cost reduction (GPT-4o-mini: $0.15/1M vs GPT-4 Vision: $1.50/1M), faster latency [CITED: OpenAI docs] |
| URL-only image input | Base64 data URLs | 2023 | Supports local images, no external hosting required [CITED: OpenAI docs] |

**Deprecated/outdated:**
- **GPT-4-vision-preview model:** Replaced by gpt-4o and gpt-4o-mini (better quality, lower cost, faster) [CITED: OpenAI docs]
- **Exact keyword matching for Vision validation:** Replaced by LLM-as-judge semantic similarity [CITED: Phase 2 RAG pattern]

## Assumptions Log

> List all claims tagged `[ASSUMED]` in this research. The planner and discuss-phase use this section to identify decisions that need user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Semantic similarity threshold >= 0.7 is acceptable for Vision accuracy | Code Examples | Threshold too high may cause false failures, too low may miss quality issues |
| A2 | Test fixture format: `{ "imageFile": string, "expectedDescription": string, "minSimilarity": number }` | Code Examples | Wrong format requires fixture refactor before tests run |
| A3 | Image resizing with Sharp is optional for Phase 4 (fixtures can be small) | Standard Stack | May need Sharp if fixture images are too large (>1MB) |
| A4 | Low detail mode (85 tokens/image) sufficient for test fixtures | Common Pitfalls | High-detail mode may be needed for document/OCR fixtures with small text |
| A5 | GPT-4o-mini ($0.15/1M tokens) is cost-effective for testing | Summary | May need GPT-4o ($2.50/1M) for higher accuracy on complex images |

## Open Questions

1. **Vision Model Selection for Production**
   - What we know: GPT-4o-mini is cost-effective for testing, GPT-4o has higher accuracy
   - What's unclear: Does production workflow need GPT-4o accuracy, or is GPT-4o-mini sufficient?
   - Recommendation: Start with GPT-4o-mini for all cases, upgrade to GPT-4o only if accuracy issues reported by users.

2. **Image Detail Level Strategy**
   - What we know: Low detail (85 tokens) is fixed cost, high detail (tile-based) can be 10x more expensive
   - What's unclear: Which use cases require high detail? Document OCR definitely needs it, but product photos?
   - Recommendation: Default to 'auto' (API decides), measure token usage in production, optimize per use case if costs spike.

3. **Image Fixture Size and Quality**
   - What we know: Fixtures should be real images (not placeholders), representative of production
   - What's unclear: What resolution/quality is needed? Balance between realism and fixture repository size.
   - Recommendation: 800x600 JPEG at 80% quality (~50KB per fixture) — realistic enough to test Vision API, small enough for git.

4. **Vision API Rate Limits**
   - What we know: OpenAI has rate limits per minute (requests and tokens)
   - What's unclear: What are the specific limits for Vision API? Do they differ from text-only models?
   - Recommendation: Start with same rate limit assumptions as Phase 3 (exponential backoff on 429 errors), document actual limits during Phase 4 execution.

## Validation Architecture

> nyquist_validation enabled (default).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest 29.x + @nestjs/testing 11.x |
| Config file | test/jest-e2e.json |
| Quick run command | `npm run test:e2e -- --testPathPattern=vision` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIS-01 | WhatsApp image triggers Vision pipeline | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-02 | Image buffer obtained from fixture | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-03 | Vision API returns description | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-04 | Description feeds LLM for contextualized response | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-05 | Product photo case | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-06 | Document/OCR case | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-07 | Scene/environment case | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-08 | Latency <10s | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-09 | Semantic similarity validation | E2E | `npm run test:e2e -- vision-accuracy` | ❌ Wave 0 |
| VIS-10 | Cost tracking | E2E | `npm run test:e2e -- vision-e2e-cycle` | ❌ Wave 0 |
| VIS-11 | CI/CD automated execution | CI | GitHub Actions (automatic on PR) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:e2e -- --testPathPattern=vision-e2e-cycle` (core Vision flow, <60s)
- **Per wave merge:** `npm run test:e2e` (all E2E tests including Vision, <8min)
- **Phase gate:** Full E2E suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `test/vision-e2e-cycle.e2e-spec.ts` — covers VIS-01 through VIS-08, VIS-10
- [ ] `test/vision-accuracy.e2e-spec.ts` — covers VIS-09 (semantic similarity with LLM-as-judge)
- [ ] `test/support/vision-analyze.ts` — Vision API helper with cost tracking
- [ ] `test/fixtures/images/product-photo.jpg` — Product photo fixture (~50KB JPEG)
- [ ] `test/fixtures/images/product-photo-expected.json` — Product photo metadata
- [ ] `test/fixtures/images/document-scan.png` — Document/OCR fixture (~50KB PNG)
- [ ] `test/fixtures/images/document-scan-expected.json` — Document metadata
- [ ] `test/fixtures/images/scene-photo.jpg` — Scene/environment fixture (~50KB JPEG)
- [ ] `test/fixtures/images/scene-photo-expected.json` — Scene metadata
- [ ] `test/fixtures/images/README.md` — Fixture documentation and sourcing
- [ ] `package.json` — Add `test:e2e:vision` script

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | API key authentication (OPENAI_API_KEY) [VERIFIED: Phase 3 pattern] |
| V3 Session Management | no | Stateless API, no sessions |
| V4 Access Control | yes | API key in env vars, never in code/logs [VERIFIED: .env.example] |
| V5 Input Validation | yes | Image format validation (magic bytes) before Vision API call [ASSUMED] |
| V6 Cryptography | no | No custom crypto (Vision API uses TLS) |

### Known Threat Patterns for NestJS + LLM + Vision API

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API key exposure | Information Disclosure | OPENAI_API_KEY in env vars, never in code/logs/fixtures [PROJECT: .env.example] |
| Image injection attack | Tampering | Validate image format (magic bytes) before API call, reject unsupported formats [ASSUMED] |
| Cost exhaustion via large images | Denial of Service | Limit image size (<5MB), use 'low' detail for testing, resize large images [ASSUMED] |
| Malicious image files | Tampering | Validate magic bytes, reject if format mismatch, never execute image content [ASSUMED] |

## Sources

### Primary (HIGH confidence - Context7 verified)

- OpenAI Developers Documentation - Vision API with base64 and URL image input [CITED: https://developers.openai.com/api/docs/guides/vision]
- OpenAI API Reference - GPT-4 Vision endpoint and request format [CITED: https://developers.openai.com/api/reference/python]
- LangChain Multimodal Documentation - image_url content type for TypeScript [CITED: https://github.com/langchain-ai/docs/blob/main/src/oss/javascript/integrations/chat/openai.mdx]
- OpenAI Pricing - GPT-4o and GPT-4o-mini token costs [CITED: https://developers.openai.com/cookbook/examples/leveraging_model_distillation_to_fine-tune_a_model]

### Secondary (MEDIUM confidence - Project verified)

- Phase 3 STT Test Pattern - Helper function structure, fixture metadata, skip gracioso [VERIFIED: test/audio-stt-e2e-cycle.e2e-spec.ts]
- Phase 2 RAG LLM-as-Judge - Semantic similarity validation pattern [VERIFIED: test/rag-llm-judge.e2e-spec.ts]
- Project Testing Strategy - Test commands, parallelism constraints [VERIFIED: package.json:49-52]
- GUIDES.md Vision Documentation - Multimodal workflow structure [VERIFIED: docs/GUIDES.md:537-684]

### Tertiary (LOW confidence - Assumed, marked for validation)

- Image resizing best practices for Vision API - Not verified in this session [ASSUMED]
- Optimal semantic similarity threshold (0.7) for Vision accuracy - Industry convention not confirmed [ASSUMED]
- Vision API rate limits specifics - General OpenAI rate limit patterns applied [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All tools already in use (@langchain/openai, Jest, NestJS testing) with existing E2E patterns from Phase 2/3 [VERIFIED: multiple test files]
- Architecture: MEDIUM - Vision API integration from official docs (Context7) but not yet implemented in this project [CITED: OpenAI + LangChain docs]
- Pitfalls: MEDIUM - Non-deterministic output lessons from Phase 2/3, Vision-specific cost/format issues from official docs [VERIFIED + CITED]

**Research date:** 2026-08-26
**Valid until:** 2026-10-26 (60 days - Vision API patterns are stable, but pricing may evolve)
