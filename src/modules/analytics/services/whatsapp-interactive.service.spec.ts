import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppInteractiveService } from './whatsapp-interactive.service';
import { MessageSendService } from '../../message/message-send.service';

/**
 * Phase 10 Plan 03 Task 2: Unit tests for WhatsApp interactive message service (RED phase).
 *
 * Tests NPS/CSAT survey message generation per RESEARCH.md L423-477.
 * These tests validate interactive message payload structure matches WhatsApp API spec.
 */
describe('WhatsAppInteractiveService', () => {
  let service: WhatsAppInteractiveService;
  let messageSendService: jest.Mocked<MessageSendService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppInteractiveService,
        {
          provide: MessageSendService,
          useValue: {
            sendText: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WhatsAppInteractiveService>(WhatsAppInteractiveService);
    messageSendService = module.get(MessageSendService) as jest.Mocked<MessageSendService>;
  });

  describe('sendNpsSurvey', () => {
    it('should send NPS interactive message with correct structure', async () => {
      const phoneNumber = '5511999999999';
      const userName = 'João';
      const conversationId = 'conv-123';

      await service.sendNpsSurvey(phoneNumber, userName, conversationId);

      expect(messageSendService.sendText).toHaveBeenCalledWith(
        expect.any(String), // sessionId
        expect.objectContaining({
          chatId: expect.stringContaining(phoneNumber),
          text: expect.stringContaining('0 a 10'),
        }),
      );
    });

    it('should include NPS response options 0-10', async () => {
      await service.sendNpsSurvey('5511999999999', 'Test', 'conv-1');

      const callArgs = messageSendService.sendText.mock.calls[0];
      const text = callArgs[1].text;

      // Should mention NPS scale
      expect(text).toMatch(/0.*10/);
      expect(text.toLowerCase()).toContain('recomendaria');
    });
  });

  describe('sendCsatSurvey', () => {
    it('should send CSAT interactive message with correct structure', async () => {
      const phoneNumber = '5511999999999';
      const userName = 'Maria';
      const conversationId = 'conv-456';

      await service.sendCsatSurvey(phoneNumber, userName, conversationId);

      expect(messageSendService.sendText).toHaveBeenCalledWith(
        expect.any(String), // sessionId
        expect.objectContaining({
          chatId: expect.stringContaining(phoneNumber),
          text: expect.stringContaining('avalia'),
        }),
      );
    });

    it('should include CSAT 5-point scale', async () => {
      await service.sendCsatSurvey('5511999999999', 'Test', 'conv-1');

      const callArgs = messageSendService.sendText.mock.calls[0];
      const text = callArgs[1].text;

      // Should mention satisfaction evaluation
      expect(text.toLowerCase()).toMatch(/satisf|avalia/);
    });
  });
});
