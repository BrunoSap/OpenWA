// archiver v8 is ESM-only (pulled in transitively via @Global StorageModule); stub for ts-jest CJS.
jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module';
import { applyGlobalValidation } from './../src/config/app-validation';
import { ChatOpenAI } from '@langchain/openai';
import * as fs from 'fs';
import * as path from 'path';
import { transcribeOgg, wordAccuracy } from './support/stt-transcribe';

/**
 * Audio STT E2E Cycle (STT-01, STT-02, STT-03, STT-04, STT-05, STT-08, STT-09 tracer).
 *
 * This suite validates the complete Speech-to-Text pipeline using Groq Whisper API:
 *
 *   1. Obtain audio buffer from fixture (.ogg simulating WhatsApp webhook download) - STT-02
 *   2. Transcribe via Groq Whisper (whisper-large-v3) - STT-03
 *   3. Measure transcription accuracy against expected text (>= 90%) - STT-01, STT-05, STT-08
 *   4. Measure transcription latency (< 5000ms for ~10s audio) - STT-09
 *   5. Feed transcription to LLM and validate text response - STT-04
 *
 * The test uses a clean Portuguese audio fixture (~10 seconds) with pre-verified transcription.
 * This tracer proves the thin vertical slice before expanding to English, noisy audio, and
 * fallback handling (Plan 03-02) and CI integration (Plan 03-03).
 */
describe('Audio STT E2E (full cycle)', () => {
  let app: INestApplication;
  let shouldSkip = false;
  let skipReason = '';
  let audioBuffer: Buffer;
  let expectedTranscript: string;
  let minAccuracy: number;
  let llm: ChatOpenAI;

  jest.setTimeout(60000);

  beforeAll(async () => {
    // Check if GROQ_API_KEY is available
    if (!process.env.GROQ_API_KEY) {
      shouldSkip = true;
      skipReason = 'GROQ_API_KEY not set';
      console.warn('⚠️  GROQ_API_KEY not set - Audio STT tests will be skipped');
      return;
    }

    // Load audio fixture metadata
    const fixtureMetaPath = path.join(__dirname, 'fixtures/audio/pt-clean-expected.json');
    if (!fs.existsSync(fixtureMetaPath)) {
      shouldSkip = true;
      skipReason = 'Audio fixture metadata not found';
      console.warn('⚠️  Audio fixture metadata not found - Audio STT tests will be skipped');
      return;
    }

    const fixtureMeta = JSON.parse(fs.readFileSync(fixtureMetaPath, 'utf-8'));
    expectedTranscript = fixtureMeta.expectedTranscript;
    minAccuracy = fixtureMeta.accuracyThreshold;

    // Load audio buffer
    const audioPath = path.join(__dirname, 'fixtures/audio', fixtureMeta.audioFile);
    if (!fs.existsSync(audioPath)) {
      shouldSkip = true;
      skipReason = 'Audio fixture file not found';
      console.warn(`⚠️  Audio fixture file not found: ${fixtureMeta.audioFile} - Audio STT tests will be skipped`);
      return;
    }

    audioBuffer = fs.readFileSync(audioPath);

    // Check if buffer looks like a real audio file (not our placeholder)
    if (audioBuffer.length < 1000) {
      shouldSkip = true;
      skipReason = 'Audio fixture is placeholder (< 1KB)';
      console.warn('⚠️  Audio fixture is placeholder - Replace with real .ogg file to run tests');
      return;
    }

    // Initialize LLM for STT-04 (transcription → LLM response)
    llm = new ChatOpenAI({
      model: 'openai/gpt-oss-20b',
      temperature: 0,
      apiKey: process.env.GROQ_API_KEY,
      configuration: {
        baseURL: 'https://api.groq.com/openai/v1',
      },
    });

    // Initialize NestJS app (for future API endpoint tests)
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

  describe('STT-01/02/03/05/08/09: Portuguese clean audio (happy path)', () => {
    it('STT-02: should obtain audio buffer from fixture (simulating webhook download)', () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      // Assert buffer exists and has content
      expect(audioBuffer).toBeDefined();
      expect(audioBuffer.length).toBeGreaterThan(0);

      // Check for audio format magic bytes (OggS or ID3 for MP3 or MP3 sync)
      const magic4 = audioBuffer.slice(0, 4).toString('ascii');
      const magic3 = audioBuffer.slice(0, 3).toString('ascii');
      const isValidAudio = magic4 === 'OggS' || magic3 === 'ID3' || (audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0);
      expect(isValidAudio).toBe(true);

      console.log(`✅ Audio buffer loaded: ${audioBuffer.length} bytes (format: ${magic3})`);
    });

    it('STT-03/09: should transcribe audio via Groq Whisper with latency < 5000ms', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      const result = await transcribeOgg(audioBuffer, { language: 'pt' });

      // STT-09: Assert latency < 5000ms
      expect(result.latencyMs).toBeLessThan(5000);
      console.log(`⏱️  Transcription latency: ${result.latencyMs}ms`);

      // STT-03: Assert transcription returned text
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      console.log(`🎤 Transcribed text: "${result.text}"`);

      // Store for next test
      (global as any).__sttTranscript = result.text;
    });

    it('STT-01/05/08: should achieve >= 90% accuracy against expected transcription', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      const transcribedText = (global as any).__sttTranscript;
      expect(transcribedText).toBeDefined();

      const accuracy = wordAccuracy(expectedTranscript, transcribedText);

      console.log(`📊 Expected: "${expectedTranscript}"`);
      console.log(`📊 Actual:   "${transcribedText}"`);
      console.log(`📊 Accuracy: ${(accuracy * 100).toFixed(1)}%`);

      // STT-01/05/08: Assert accuracy >= minAccuracy (0.9)
      expect(accuracy).toBeGreaterThanOrEqual(minAccuracy);
    });

    it('STT-04: should feed transcription to LLM and get coherent text response', async () => {
      if (shouldSkip) {
        console.warn(`⏭️  Skipped: ${skipReason}`);
        return;
      }

      const transcribedText = (global as any).__sttTranscript;
      expect(transcribedText).toBeDefined();

      // Send transcription as user question to LLM
      const response = await llm.invoke([
        {
          role: 'system',
          content: 'Você é um assistente útil. Responda a pergunta do usuário de forma clara e concisa.',
        },
        {
          role: 'user',
          content: transcribedText,
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
