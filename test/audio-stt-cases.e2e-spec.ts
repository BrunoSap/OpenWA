// archiver v8 is ESM-only (pulled in transitively via @GlobalStorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import * as fs from 'fs';
import * as path from 'path';
import { transcribeOgg, wordAccuracy, transcribeWithFallback, buildFallbackReply } from './support/stt-transcribe';

/**
 * Audio STT E2E Cases — Expanded coverage (STT-06, STT-07, STT-10).
 *
 * This suite validates additional STT scenarios beyond the PT-clean tracer:
 *
 *   STT-06: English clean audio with accuracy >= 90%
 *   STT-07: Portuguese noisy audio with measured accuracy degradation (tolerant threshold)
 *   STT-10: Fallback behavior when transcription fails (timeout / API error)
 *
 * Each case skips gracefully when GROQ_API_KEY is absent or fixture is missing/placeholder.
 */
describe('Audio STT E2E (expanded cases)', () => {
  let app: INestApplication;

  jest.setTimeout(60000);

  beforeAll(async () => {
    // Initialize NestJS app for consistency with tracer
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

  describe('STT-06: English clean audio', () => {
    let shouldSkip = false;
    let skipReason = '';
    let audioBuffer: Buffer;
    let expectedTranscript: string;
    let minAccuracy: number;

    beforeAll(() => {
      // Check GROQ_API_KEY
      if (!process.env.GROQ_API_KEY) {
        shouldSkip = true;
        skipReason = 'GROQ_API_KEY not set';
        console.warn('⚠️  GROQ_API_KEY not set - STT-06 will be skipped');
        return;
      }

      // Load EN clean fixture metadata
      const fixtureMetaPath = path.join(__dirname, 'fixtures/audio/en-clean-expected.json');
      if (!fs.existsSync(fixtureMetaPath)) {
        shouldSkip = true;
        skipReason = 'EN fixture metadata not found';
        console.warn('⚠️  EN fixture metadata not found - STT-06 will be skipped');
        return;
      }

      const fixtureMeta = JSON.parse(fs.readFileSync(fixtureMetaPath, 'utf-8'));
      expectedTranscript = fixtureMeta.expectedTranscript;
      minAccuracy = fixtureMeta.accuracyThreshold;

      // Load audio buffer
      const audioPath = path.join(__dirname, 'fixtures/audio', fixtureMeta.audioFile);
      if (!fs.existsSync(audioPath)) {
        shouldSkip = true;
        skipReason = 'EN fixture .ogg file not found';
        console.warn(`⚠️  EN audio fixture not found: ${fixtureMeta.file} - STT-06 will be skipped`);
        return;
      }

      audioBuffer = fs.readFileSync(audioPath);

      // Check if buffer is placeholder
      if (audioBuffer.length < 1000) {
        shouldSkip = true;
        skipReason = 'EN fixture is placeholder (< 1KB)';
        console.warn('⚠️  EN audio fixture is placeholder - Replace with real .ogg to run STT-06');
        return;
      }
    });

    it('should transcribe English clean audio with accuracy >= 90%', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped STT-06: ${skipReason}`);
        return;
      }

      const result = await transcribeOgg(audioBuffer, { language: 'en' });
      const accuracy = wordAccuracy(expectedTranscript, result.text);

      console.log(`\n[STT-06] EN Clean Audio`);
      console.log(`  Expected: "${expectedTranscript}"`);
      console.log(`  Actual:   "${result.text}"`);
      console.log(`  Accuracy: ${(accuracy * 100).toFixed(1)}%`);
      console.log(`  Latency:  ${result.latencyMs}ms`);

      expect(accuracy).toBeGreaterThanOrEqual(minAccuracy);
      expect(result.latencyMs).toBeLessThan(5000);
    });
  });

  describe('STT-07: Portuguese noisy audio', () => {
    let shouldSkip = false;
    let skipReason = '';
    let audioBuffer: Buffer;
    let expectedTranscript: string;
    let minAccuracy: number;

    beforeAll(() => {
      // Check GROQ_API_KEY
      if (!process.env.GROQ_API_KEY) {
        shouldSkip = true;
        skipReason = 'GROQ_API_KEY not set';
        console.warn('⚠️  GROQ_API_KEY not set - STT-07 will be skipped');
        return;
      }

      // Load PT noisy fixture metadata
      const fixtureMetaPath = path.join(__dirname, 'fixtures/audio/pt-noisy-expected.json');
      if (!fs.existsSync(fixtureMetaPath)) {
        shouldSkip = true;
        skipReason = 'PT-noisy fixture metadata not found';
        console.warn('⚠️  PT-noisy fixture metadata not found - STT-07 will be skipped');
        return;
      }

      const fixtureMeta = JSON.parse(fs.readFileSync(fixtureMetaPath, 'utf-8'));
      expectedTranscript = fixtureMeta.expectedTranscript;
      minAccuracy = fixtureMeta.accuracyThreshold;

      // Load audio buffer
      const audioPath = path.join(__dirname, 'fixtures/audio', fixtureMeta.audioFile);
      if (!fs.existsSync(audioPath)) {
        shouldSkip = true;
        skipReason = 'PT-noisy fixture .ogg file not found';
        console.warn(`⚠️  PT-noisy audio fixture not found: ${fixtureMeta.file} - STT-07 will be skipped`);
        return;
      }

      audioBuffer = fs.readFileSync(audioPath);

      // Check if buffer is placeholder
      if (audioBuffer.length < 1000) {
        shouldSkip = true;
        skipReason = 'PT-noisy fixture is placeholder (< 1KB)';
        console.warn('⚠️  PT-noisy audio fixture is placeholder - Replace with real .ogg to run STT-07');
        return;
      }
    });

    it('should transcribe Portuguese noisy audio and measure accuracy degradation', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped STT-07: ${skipReason}`);
        return;
      }

      const result = await transcribeOgg(audioBuffer, { language: 'pt' });
      const accuracy = wordAccuracy(expectedTranscript, result.text);

      console.log(`\n[STT-07] PT Noisy Audio`);
      console.log(`  Expected: "${expectedTranscript}"`);
      console.log(`  Actual:   "${result.text}"`);
      console.log(`  Accuracy: ${(accuracy * 100).toFixed(1)}% (degraded due to noise)`);
      console.log(`  Latency:  ${result.latencyMs}ms`);
      console.log(`  Threshold: ${(minAccuracy * 100).toFixed(1)}% (tolerant for noisy audio)`);

      // Assert against tolerant threshold (0.6)
      expect(accuracy).toBeGreaterThanOrEqual(minAccuracy);
      expect(result.latencyMs).toBeLessThan(5000);
    });
  });

  describe('STT-10: Fallback when transcription fails', () => {
    it('STT-10a: should return fallback result on timeout', async () => {
      // Use absurdly short timeout to force timeout condition
      const dummyBuffer = Buffer.from('dummy');
      const result = await transcribeWithFallback(dummyBuffer, {
        language: 'pt',
        timeoutMs: 1, // Force timeout
      });

      console.log(`\n[STT-10a] Timeout Fallback`);
      console.log(`  ok: ${result.ok}`);
      console.log(`  fallbackReason: ${result.fallbackReason}`);
      console.log(`  latencyMs: ${result.latencyMs}`);

      expect(result.ok).toBe(false);
      expect(result.fallbackReason).toBe('timeout');
      expect(result.text).toBe('');
    });

    it('STT-10b: should return fallback result on API error', async () => {
      if (!process.env.GROQ_API_KEY) {
        console.warn('⏭️  Skipped STT-10b: GROQ_API_KEY not set (cannot test API error)');
        return;
      }

      // Empty buffer will trigger API error
      const emptyBuffer = Buffer.alloc(0);
      const result = await transcribeWithFallback(emptyBuffer, {
        language: 'pt',
        timeoutMs: 5000,
      });

      console.log(`\n[STT-10b] API Error Fallback`);
      console.log(`  ok: ${result.ok}`);
      console.log(`  fallbackReason: ${result.fallbackReason}`);
      console.log(`  latencyMs: ${result.latencyMs}`);

      expect(result.ok).toBe(false);
      expect(result.fallbackReason).toBe('api_error');
      expect(result.text).toBe('');
    });

    it('STT-10c: should provide deterministic fallback message to user', () => {
      const timeoutMsg = buildFallbackReply('timeout');
      const apiErrorMsg = buildFallbackReply('api_error');

      console.log(`\n[STT-10c] Fallback Messages`);
      console.log(`  timeout: "${timeoutMsg}"`);
      console.log(`  api_error: "${apiErrorMsg}"`);

      expect(timeoutMsg).toBeTruthy();
      expect(timeoutMsg.length).toBeGreaterThan(10);
      expect(timeoutMsg).toContain('texto');

      expect(apiErrorMsg).toBeTruthy();
      expect(apiErrorMsg.length).toBeGreaterThan(10);
      expect(apiErrorMsg).toContain('texto');
    });
  });
});
