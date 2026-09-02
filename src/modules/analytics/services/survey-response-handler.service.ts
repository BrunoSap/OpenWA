import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsSatisfactionResponse } from '../entities/analytics-satisfaction-response.entity';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 10 Plan 03 Task 2: Survey response webhook handler.
 *
 * Processes incoming WhatsApp messages to detect and store satisfaction survey responses.
 * Since we're using text-based surveys (not WhatsApp Business API interactive messages),
 * we parse numeric responses (0-10 for NPS, 1-5 for CSAT) from message text.
 *
 * This handler is called by the message processing pipeline when a message arrives.
 */
@Injectable()
export class SurveyResponseHandler {
  private readonly logger = createLogger('SurveyResponseHandler');

  constructor(
    @InjectRepository(AnalyticsSatisfactionResponse, 'data')
    private readonly satisfactionRepo: Repository<AnalyticsSatisfactionResponse>,
  ) {}

  /**
   * Process incoming message to detect survey response.
   * Parses numeric responses and stores them if valid.
   *
   * @param message - Incoming message object
   * @returns true if message was a survey response and was processed, false otherwise
   */
  async handleIncomingMessage(message: {
    from: string; // Phone number (e.g., '5511999999999@c.us')
    body: string; // Message text
    sessionId: string;
    conversationId?: string;
  }): Promise<boolean> {
    const trimmedBody = message.body.trim();

    // Check if message is a numeric response (0-10 for NPS, 1-5 for CSAT)
    const numericMatch = /^(\d+)$/.exec(trimmedBody);
    if (!numericMatch) {
      return false; // Not a numeric response
    }

    const score = parseInt(numericMatch[1], 10);

    // Determine survey type based on score range
    let surveyType: string | null = null;
    if (score >= 0 && score <= 10) {
      surveyType = 'nps'; // NPS: 0-10 scale
    } else if (score >= 1 && score <= 5) {
      surveyType = 'csat'; // CSAT: 1-5 scale (overlaps with NPS, prioritize NPS)
    } else {
      return false; // Score out of valid range
    }

    // Extract user ID from 'from' field (format: '5511999999999@c.us')
    const userId = message.from.split('@')[0];

    // Use conversationId from message context (or fallback to chatId:date pattern)
    const conversationId = message.conversationId || `${message.from}:${new Date().toISOString().split('T')[0]}`;

    try {
      // Store survey response (UNIQUE constraint prevents duplicates per conversation)
      await this.satisfactionRepo.save({
        conversation_id: conversationId,
        user_id: userId,
        session_id: message.sessionId,
        survey_type: surveyType,
        score,
      });

      this.logger.log(
        `Saved ${surveyType.toUpperCase()} response: score=${score}, conversation=${conversationId}, user=${userId}`,
      );

      return true; // Message was a survey response and was processed
    } catch (error) {
      // Check if it's a duplicate response (UNIQUE constraint violation)
      if ((error as any).code === '23505' || (error as any).code === 'SQLITE_CONSTRAINT') {
        this.logger.warn(
          `Duplicate ${surveyType.toUpperCase()} response ignored for conversation ${conversationId}`,
        );
        return true; // Still a survey response, just duplicate
      }

      this.logger.error(
        `Failed to save ${surveyType.toUpperCase()} response for conversation ${conversationId}: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Check if a conversation already has a survey response.
   * Used to implement rate limiting (threat T-10-12: max 1 survey per user per 7 days).
   *
   * @param userId - User identifier (phone number)
   * @param surveyType - Survey type ('nps' or 'csat')
   * @param withinDays - Check responses within N days (default: 7)
   * @returns true if user has responded to this survey type recently
   */
  async hasRecentResponse(
    userId: string,
    surveyType: string,
    withinDays: number = 7,
  ): Promise<boolean> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - withinDays);

    const count = await this.satisfactionRepo
      .createQueryBuilder('sr')
      .where('sr.user_id = :userId', { userId })
      .andWhere('sr.survey_type = :surveyType', { surveyType })
      .andWhere('sr.responded_at >= :cutoffDate', { cutoffDate })
      .getCount();

    return count > 0;
  }
}
