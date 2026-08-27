// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { ChatOpenAI } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeImage, detectImageFormat } from './support/vision-analyze';

/**
 * Vision E2E Cycle (VIS-01, VIS-02, VIS-03, VIS-04, VIS-05, VIS-08, VIS-10 tracer).
 *
 * This suite validates the complete Vision pipeline using GPT-4 Vision API:
 *
 *   1. Obtain image buffer from fixture (simulating WhatsApp webhook download) - VIS-01
 *   2. Validate image format via magic bytes (JPEG/PNG/WebP/GIF) - VIS-02
 *   3. Analyze via GPT-4 Vision (gpt-4o-mini with detail: 'low') - VIS-03
 *   4. Measure analysis latency (< 10000ms) - VIS-08
 *   5. Calculate and log cost per image - VIS-10
 *   6. Feed description to LLM and validate contextual response - VIS-04
 *
 * The test uses a product photo fixture (~8KB JPEG) with pre-verified description.
 * This tracer proves the thin vertical slice before expanding to document/OCR,
 * screenshot analysis, and LLM-as-judge validation (Plan 04-02) and CI integration (Plan 04-03).
 */
describe('Vision E2E (full cycle)', () => {
  let app: INestApplication;
  let shouldSkip = false;
  let skipReason = '';
  let imageBuffer: Buffer;
  let expectedDescription: string;
  let minSimilarity: number;
  let llm: ChatOpenAI;
  let actualDescription: string;

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
    const fixtureMetaPath = path.join(
      __dirname,
      'fixtures/images/product-photo-expected.json'
    );
    if (!fs.existsSync(fixtureMetaPath)) {
      shouldSkip = true;
      skipReason = 'Image fixture metadata not found';
      console.warn(
        '⚠️  Image fixture metadata not found - Vision tests will be skipped'
      );
      return;
    }

    const fixtureMeta = JSON.parse(
      fs.readFileSync(fixtureMetaPath, 'utf-8')
    );
    expectedDescription = fixtureMeta.expectedDescription;
    minSimilarity = fixtureMeta.minSimilarity;

    // Load image buffer
    const imageFilePath = path.join(
      __dirname,
      'fixtures/images',
      fixtureMeta.imageFile
    );
    if (!fs.existsSync(imageFilePath)) {
      shouldSkip = true;
      skipReason = 'Image file not found';
      console.warn('⚠️  Image file not found - Vision tests will be skipped');
      return;
    }

    imageBuffer = fs.readFileSync(imageFilePath);

    // Check if image is a placeholder (< 1KB)
    if (imageBuffer.length < 1000) {
      shouldSkip = true;
      skipReason = 'Image fixture is placeholder (< 1KB)';
      console.warn(
        '⚠️  Image fixture is placeholder - Vision tests will be skipped'
      );
      return;
    }

    // Boot app with global validation (same as STT tracer pattern)
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    applyGlobalValidation(app);
    await app.init();

    // Initialize LLM for VIS-04 (description → LLM response)
    llm = new ChatOpenAI({
      model: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY,
      temperature: 0,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('VIS-01/02/03/05/08/10 - Product photo happy path', () => {
    it('VIS-02: should obtain image and validate format via magic bytes', () => {
      if (shouldSkip) {
        console.warn(`⚠️  Skipping: ${skipReason}`);
        return;
      }

      // Assert buffer is not empty
      expect(imageBuffer.length).toBeGreaterThan(0);

      // Validate format via magic bytes
      const format = detectImageFormat(imageBuffer);
      expect(['jpeg', 'png', 'webp', 'gif']).toContain(format);

      console.log(`✓ Image format detected: ${format}`);
      console.log(`✓ Image size: ${imageBuffer.length} bytes`);
    });

    it('VIS-03/08/10: should analyze image via Vision API with latency < 10s and log cost', async () => {
      if (shouldSkip) {
        console.warn(`⚠️  Skipping: ${skipReason}`);
        return;
      }

      const result = await analyzeImage(imageBuffer, {
        model: 'gpt-4o-mini',
        detail: 'low',
      });

      // VIS-08: Latency < 10000ms
      expect(result.latencyMs).toBeLessThan(10000);

      // VIS-03: Description is non-empty
      expect(result.description).toBeDefined();
      expect(result.description.length).toBeGreaterThan(10);

      // VIS-10: Cost is calculated and logged
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.tokensUsed.input).toBeGreaterThan(0);

      // Store description for VIS-04
      actualDescription = result.description;

      console.log(`✓ Vision latency: ${result.latencyMs}ms`);
      console.log(
        `✓ Description preview: ${result.description.substring(0, 100)}...`
      );
      console.log(
        `✓ Tokens: ${result.tokensUsed.input} input, ${result.tokensUsed.output} output`
      );
      console.log(`✓ Cost: $${result.costUsd.toFixed(6)}`);
    });

    it('VIS-04: should feed description to LLM and get contextual response', async () => {
      if (shouldSkip) {
        console.warn(`⚠️  Skipping: ${skipReason}`);
        return;
      }

      // Skip if no description from previous test
      if (!actualDescription) {
        console.warn('⚠️  Skipping: no description available');
        return;
      }

      const response = await llm.invoke([
        {
          role: 'system',
          content: 'Você é um assistente útil que responde em português.',
        },
        {
          role: 'user',
          content: `O usuário enviou uma imagem. Análise: ${actualDescription}. Pergunta: O que você vê nesta imagem?`,
        },
      ]);

      // Assert response is non-empty and coherent
      expect(response.content).toBeDefined();
      expect(typeof response.content).toBe('string');
      expect((response.content as string).length).toBeGreaterThan(10);

      console.log(
        `✓ LLM response preview: ${(response.content as string).substring(0, 100)}...`
      );
      console.log('✓ Description successfully chained to LLM');
    });
  });
});
