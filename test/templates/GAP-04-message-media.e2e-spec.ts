/**
 * GAP #4: Message with Media E2E Test
 *
 * Validates sending WhatsApp messages with media attachments:
 * 1. Upload image/audio/video
 * 2. Send via /api/messages with mediaUrl
 * 3. Media is downloaded and cached
 * 4. Message is delivered to WhatsApp
 * 5. Webhook confirms delivery
 *
 * Priority: 🔴 ALTA
 * Estimated effort: 3h
 * Risk: 🔴 Alto (critical feature for users)
 */

jest.mock('archiver', () => ({ TarArchive: jest.fn() }));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createTestApp,
  createTestApiKey,
  TestWebhookServer,
  waitForCondition,
} from '../e2e/helpers/test-helpers';

describe('Message with Media E2E (GAP #4)', () => {
  let app: INestApplication;
  let apiKey: string;
  let webhookServer: TestWebhookServer;
  let testImagePath: string;
  let testAudioPath: string;

  beforeAll(async () => {
    app = await createTestApp();
    const keyData = await createTestApiKey(app);
    apiKey = keyData.key;

    // Setup test media files
    testImagePath = path.join(__dirname, '../fixtures/test-image.jpg');
    testAudioPath = path.join(__dirname, '../fixtures/test-audio.mp3');

    // Create test files if they don't exist
    if (!fs.existsSync(testImagePath)) {
      // Create a minimal valid JPEG (1x1 pixel)
      const jpegBuffer = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
        0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        // ... truncated for brevity
        0xFF, 0xD9
      ]);
      fs.writeFileSync(testImagePath, jpegBuffer);
    }

    // Start webhook server to capture delivery events
    webhookServer = new TestWebhookServer();
    await webhookServer.start();
  });

  afterAll(async () => {
    await webhookServer?.stop();
    try {
      await app?.close();
    } catch {
      /* ignore teardown quirk */
    }
  });

  describe('Happy Path: Send Image Message', () => {
    it('should send image via URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          body: 'Check out this image!',
          mediaUrl: 'https://picsum.photos/200/300',
          mediaType: 'image',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toMatch(/pending|sent/i);
    });

    it('should send image via file upload', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .field('to', '5511999999999')
        .field('body', 'Uploaded image')
        .attach('media', testImagePath)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.mediaUrl).toBeTruthy();
    });

    it('should cache downloaded media', async () => {
      const mediaUrl = 'https://picsum.photos/200/300';

      // First request - downloads and caches
      const response1 = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl,
          mediaType: 'image',
        });

      const messageId1 = response1.body.id;

      // Second request - should use cache
      const response2 = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl,
          mediaType: 'image',
        });

      const messageId2 = response2.body.id;

      // Both should reference same cached file
      expect(response1.body.mediaUrl).toBe(response2.body.mediaUrl);
    });
  });

  describe('Happy Path: Send Audio Message', () => {
    it('should send audio/voice message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl: 'https://example.com/audio.mp3',
          mediaType: 'audio',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.mediaType).toBe('audio');
    });

    it('should convert audio to WhatsApp-compatible format (opus)', async () => {
      // WhatsApp requires opus format for audio
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .field('to', '5511999999999')
        .attach('media', testAudioPath)
        .expect(200);

      // Check that media was converted (if needed)
      expect(response.body.mediaUrl).toMatch(/\.opus$|\.ogg$/);
    });
  });

  describe('Happy Path: Send Video Message', () => {
    it('should send video message', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          body: 'Video message',
          mediaUrl: 'https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4',
          mediaType: 'video',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.mediaType).toBe('video');
    });
  });

  describe('Happy Path: Send Document', () => {
    it('should send PDF document', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          body: 'PDF document',
          mediaUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          mediaType: 'document',
          fileName: 'document.pdf',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fileName).toBe('document.pdf');
    });
  });

  describe('Edge Cases: Media Validation', () => {
    it('should reject oversized media (> 16MB)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl: 'https://example.com/huge-file-20mb.mp4',
          mediaType: 'video',
        })
        .expect(400);

      expect(response.body.message).toMatch(/size|limit|too large/i);
    });

    it('should reject invalid media URL', async () => {
      await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl: 'not-a-valid-url',
          mediaType: 'image',
        })
        .expect(400);
    });

    it('should reject unsupported media type', async () => {
      await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl: 'https://example.com/file.exe',
          mediaType: 'executable',
        })
        .expect(400);
    });

    it('should handle media download failure gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl: 'https://nonexistent-domain-12345.com/image.jpg',
          mediaType: 'image',
        })
        .expect(400);

      expect(response.body.message).toMatch(/download|failed|unreachable/i);
    });
  });

  describe('Edge Cases: Media Format Conversion', () => {
    it('should convert HEIC to JPEG automatically', async () => {
      // iOS sends HEIC images - should convert to JPEG for WhatsApp
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          mediaUrl: 'https://example.com/photo.heic',
          mediaType: 'image',
        })
        .expect(200);

      // Converted media should be JPEG
      expect(response.body.mediaUrl).toMatch(/\.jpg$|\.jpeg$/i);
    });

    it('should handle corrupt media file', async () => {
      // Create corrupt file
      const corruptPath = path.join(__dirname, '../fixtures/corrupt.jpg');
      fs.writeFileSync(corruptPath, 'not a valid image');

      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .field('to', '5511999999999')
        .attach('media', corruptPath)
        .expect(400);

      expect(response.body.message).toMatch(/invalid|corrupt|format/i);

      // Cleanup
      fs.unlinkSync(corruptPath);
    });
  });

  describe('Integration: Webhook Delivery Events', () => {
    it('should emit message.sent event with media metadata', async () => {
      // Register webhook
      await request(app.getHttpServer())
        .post('/api/webhooks')
        .set('x-api-key', apiKey)
        .send({
          url: webhookServer.url,
          events: ['message.sent'],
          enabled: true,
        });

      webhookServer.clearPayloads();

      // Send message with media
      const response = await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .send({
          to: '5511999999999',
          body: 'Image message',
          mediaUrl: 'https://picsum.photos/200/300',
          mediaType: 'image',
        });

      const messageId = response.body.id;

      // Wait for webhook
      const webhooks = await webhookServer.waitForWebhook(5000, 1);

      expect(webhooks[0].body).toMatchObject({
        event: 'message.sent',
        messageId,
        mediaType: 'image',
      });
      expect(webhooks[0].body.mediaUrl).toBeTruthy();
    });
  });

  describe('Performance: Media Processing Speed', () => {
    it('should process image upload in less than 2 seconds', async () => {
      const start = Date.now();

      await request(app.getHttpServer())
        .post('/api/messages')
        .set('x-api-key', apiKey)
        .field('to', '5511999999999')
        .attach('media', testImagePath);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent media uploads', async () => {
      const uploads = Array.from({ length: 5 }, (_, i) =>
        request(app.getHttpServer())
          .post('/api/messages')
          .set('x-api-key', apiKey)
          .field('to', '5511999999999')
          .field('body', `Image ${i}`)
          .attach('media', testImagePath)
      );

      const responses = await Promise.all(uploads);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id');
      });
    });
  });
});
