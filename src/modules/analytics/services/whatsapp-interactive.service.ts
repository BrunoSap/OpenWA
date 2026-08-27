import { Injectable } from '@nestjs/common';
import { MessageSendService } from '../../message/message-send.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 10 Plan 03 Task 2: WhatsApp interactive message service for satisfaction surveys.
 *
 * Sends NPS/CSAT surveys via WhatsApp. Since @open-wa/wa-automate doesn't support true
 * interactive messages (list_reply), we send formatted text messages with numbered options.
 * Users reply with numbers (0-10 for NPS, 1-5 for CSAT), and webhook handler parses responses.
 *
 * Note: True WhatsApp Business API interactive messages require official Business API access.
 * This implementation uses text-based survey simulation compatible with open-wa engine.
 */
@Injectable()
export class WhatsAppInteractiveService {
  private readonly logger = createLogger('WhatsAppInteractive');

  constructor(private readonly messageSendService: MessageSendService) {}

  /**
   * Send NPS survey (0-10 scale) via formatted text message.
   * User replies with number 0-10, webhook handler parses response.
   * @param phoneNumber User's phone number (e.g., '5511999999999')
   * @param userName User's name for personalization
   * @param conversationId Conversation identifier linking survey to conversation
   */
  async sendNpsSurvey(phoneNumber: string, userName: string, conversationId: string): Promise<void> {
    const chatId = `${phoneNumber}@c.us`;

    // Formatted NPS survey message (text-based, compatible with open-wa)
    const surveyText = `
🎯 *Como foi seu atendimento?*

Olá ${userName}!

Em uma escala de *0 a 10*, o quanto você recomendaria nosso serviço?

📊 *Responda com um número:*
• 0 - Muito insatisfeito
• 5 - Neutro
• 10 - Extremamente satisfeito

_Responda apenas com o número (0 a 10)._
    `.trim();

    try {
      // Send via existing MessageSendService (reuses session/engine infrastructure)
      // SessionId is extracted from phoneNumber or default session
      await this.messageSendService.sendText('default', {
        chatId,
        text: surveyText,
      });

      this.logger.log(
        `NPS survey sent to ${phoneNumber} for conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send NPS survey to ${phoneNumber}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Send CSAT survey (1-5 scale) via formatted text message.
   * User replies with number 1-5, webhook handler parses response.
   * @param phoneNumber User's phone number
   * @param userName User's name for personalization
   * @param conversationId Conversation identifier
   */
  async sendCsatSurvey(phoneNumber: string, userName: string, conversationId: string): Promise<void> {
    const chatId = `${phoneNumber}@c.us`;

    // Formatted CSAT survey message
    const surveyText = `
⭐ *Satisfação com o atendimento*

Olá ${userName}!

Como você avalia o atendimento recebido?

📊 *Responda com um número:*
• 1 ⭐ - Muito Insatisfeito
• 2 ⭐⭐ - Insatisfeito
• 3 ⭐⭐⭐ - Neutro
• 4 ⭐⭐⭐⭐ - Satisfeito
• 5 ⭐⭐⭐⭐⭐ - Muito Satisfeito

_Responda apenas com o número (1 a 5)._
    `.trim();

    try {
      await this.messageSendService.sendText('default', {
        chatId,
        text: surveyText,
      });

      this.logger.log(
        `CSAT survey sent to ${phoneNumber} for conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send CSAT survey to ${phoneNumber}: ${error}`,
      );
      throw error;
    }
  }
}
