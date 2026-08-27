// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import * as fs from 'fs';
import * as path from 'path';
import {
  analyzeImage,
  semanticSimilarity,
  analyzeWithFallback,
  buildFallbackReply,
} from './support/vision-analyze';

/**
 * Vision Accuracy E2E Tests (VIS-06, VIS-07, VIS-09)
 *
 * This suite expands Vision testing beyond the tracer to cover:
 * - VIS-06: Document/OCR case (text extraction from images)
 * - VIS-07: Scene/environment case (ambient/workspace description)
 * - VIS-09: Semantic validation via LLM-as-judge (not exact string matching)
 *
 * Each test case validates description quality using semantic similarity scoring
 * (gpt-4o-mini as judge), accepting descriptions that capture key visual elements
 * even if wording differs from the expected description.
 *
 * The suite also validates fallback behavior when Vision API fails (timeout/error).
 */
describe('Vision Accuracy (LLM-as-judge)', () => {
  let app: INestApplication;
  let shouldSkip = false;
  let skipReason = '';

  // Fixture states
  const fixtureStates = {
    document: { skip: false, reason: '', buffer: null as Buffer | null, meta: null as any },
    scene: { skip: false, reason: '', buffer: null as Buffer | null, meta: null as any },
  };

  jest.setTimeout(60000);

  beforeAll(async () => {
    // Check if OPENAI_API_KEY is available
    if (!process.env.OPENAI_API_KEY) {
      shouldSkip = true;
      skipReason = 'OPENAI_API_KEY not set';
      console.warn('⚠️  OPENAI_API_KEY not set - Vision accuracy tests will be skipped');
      return;
    }

    // Load document fixture
    try {
      const docMetaPath = path.join(__dirname, 'fixtures/images/document-scan-expected.json');
      if (!fs.existsSync(docMetaPath)) {
        fixtureStates.document.skip = true;
        fixtureStates.document.reason = 'Metadata not found';
      } else {
        fixtureStates.document.meta = JSON.parse(fs.readFileSync(docMetaPath, 'utf-8'));
        const docImagePath = path.join(__dirname, 'fixtures/images', fixtureStates.document.meta.imageFile);
        if (!fs.existsSync(docImagePath)) {
          fixtureStates.document.skip = true;
          fixtureStates.document.reason = 'Image file not found';
        } else {
          fixtureStates.document.buffer = fs.readFileSync(docImagePath);
          if (fixtureStates.document.buffer.length < 1000) {
            fixtureStates.document.skip = true;
            fixtureStates.document.reason = 'Placeholder image (< 1KB)';
          }
        }
      }
    } catch (err) {
      fixtureStates.document.skip = true;
      fixtureStates.document.reason = `Load error: ${err instanceof Error ? err.message : 'unknown'}`;
    }

    // Load scene fixture
    try {
      const sceneMetaPath = path.join(__dirname, 'fixtures/images/scene-photo-expected.json');
      if (!fs.existsSync(sceneMetaPath)) {
        fixtureStates.scene.skip = true;
        fixtureStates.scene.reason = 'Metadata not found';
      } else {
        fixtureStates.scene.meta = JSON.parse(fs.readFileSync(sceneMetaPath, 'utf-8'));
        const sceneImagePath = path.join(__dirname, 'fixtures/images', fixtureStates.scene.meta.imageFile);
        if (!fs.existsSync(sceneImagePath)) {
          fixtureStates.scene.skip = true;
          fixtureStates.scene.reason = 'Image file not found';
        } else {
          fixtureStates.scene.buffer = fs.readFileSync(sceneImagePath);
          if (fixtureStates.scene.buffer.length < 1000) {
            fixtureStates.scene.skip = true;
            fixtureStates.scene.reason = 'Placeholder image (< 1KB)';
          }
        }
      }
    } catch (err) {
      fixtureStates.scene.skip = true;
      fixtureStates.scene.reason = `Load error: ${err instanceof Error ? err.message : 'unknown'}`;
    }

    // Log fixture states
    if (fixtureStates.document.skip) {
      console.warn(`⚠️  Document fixture: ${fixtureStates.document.reason}`);
    }
    if (fixtureStates.scene.skip) {
      console.warn(`⚠️  Scene fixture: ${fixtureStates.scene.reason}`);
    }

    // Boot app
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

  describe('VIS-06 - Document/OCR case', () => {
    it('should analyze document image and extract text content with semantic validation', async () => {
      if (shouldSkip) {
        console.warn(`⚠️  Skipping: ${skipReason}`);
        return;
      }

      if (fixtureStates.document.skip) {
        console.warn(`⚠️  Skipping document test: ${fixtureStates.document.reason}`);
        return;
      }

      const { buffer, meta } = fixtureStates.document;

      // Analyze image (may use detail: 'high' for better OCR if needed)
      const result = await analyzeImage(buffer!, {
        model: 'gpt-4o-mini',
        detail: 'low', // Can be overridden to 'high' if OCR accuracy requires it
      });

      console.log(`✓ Document analyzed in ${result.latencyMs}ms`);
      console.log(`✓ Description: ${result.description.substring(0, 150)}...`);
      console.log(`✓ Cost: $${result.costUsd.toFixed(6)}`);

      // LLM-as-judge semantic validation
      const similarity = await semanticSimilarity(
        meta.expectedDescription,
        result.description
      );

      console.log(`✓ Semantic similarity score: ${similarity.score.toFixed(2)}`);
      console.log(`✓ Judge explanation: ${similarity.explanation}`);

      // Assert score meets threshold
      expect(similarity.score).toBeGreaterThanOrEqual(meta.minSimilarity);
      expect(result.description.length).toBeGreaterThan(20);
    });
  });

  describe('VIS-07 - Scene/environment case', () => {
    it('should analyze scene image and capture key environmental elements with semantic validation', async () => {
      if (shouldSkip) {
        console.warn(`⚠️  Skipping: ${skipReason}`);
        return;
      }

      if (fixtureStates.scene.skip) {
        console.warn(`⚠️  Skipping scene test: ${fixtureStates.scene.reason}`);
        return;
      }

      const { buffer, meta } = fixtureStates.scene;

      // Analyze image
      const result = await analyzeImage(buffer!, {
        model: 'gpt-4o-mini',
        detail: 'low',
      });

      console.log(`✓ Scene analyzed in ${result.latencyMs}ms`);
      console.log(`✓ Description: ${result.description.substring(0, 150)}...`);
      console.log(`✓ Cost: $${result.costUsd.toFixed(6)}`);

      // LLM-as-judge semantic validation
      const similarity = await semanticSimilarity(
        meta.expectedDescription,
        result.description
      );

      console.log(`✓ Semantic similarity score: ${similarity.score.toFixed(2)}`);
      console.log(`✓ Judge explanation: ${similarity.explanation}`);

      // Assert score meets threshold
      expect(similarity.score).toBeGreaterThanOrEqual(meta.minSimilarity);
      expect(result.description.length).toBeGreaterThan(20);
    });
  });

  describe('Fallback behavior (error handling)', () => {
    it('should return fallback result on invalid buffer without throwing exception', async () => {
      // This test does NOT require OPENAI_API_KEY or network - it's deterministic
      const invalidBuffer = Buffer.from([1, 2, 3, 4]); // Not a valid image format

      const result = await analyzeWithFallback(invalidBuffer, { timeoutMs: 500 });

      // Assert fallback behavior
      expect(result.ok).toBe(false);
      expect(result.fallbackReason).toBeDefined();
      expect(['timeout', 'api_error']).toContain(result.fallbackReason);
      expect(result.description).toBe('');

      console.log(`✓ Fallback triggered: ${result.fallbackReason}`);

      // Assert buildFallbackReply returns PT message
      const message = buildFallbackReply(result.fallbackReason!);
      expect(message).toBeDefined();
      expect(message.length).toBeGreaterThan(10);
      expect(message).toMatch(/[Dd]esculpe/); // Portuguese apology

      console.log(`✓ Fallback message: ${message}`);
    });

    it('should return distinct messages for timeout vs api_error', () => {
      const timeoutMsg = buildFallbackReply('timeout');
      const errorMsg = buildFallbackReply('api_error');

      expect(timeoutMsg).not.toBe(errorMsg);
      expect(timeoutMsg).toMatch(/tempo esgotado/i);
      expect(errorMsg).toMatch(/erro/i);

      console.log(`✓ Timeout message: ${timeoutMsg}`);
      console.log(`✓ Error message: ${errorMsg}`);
    });
  });
});
