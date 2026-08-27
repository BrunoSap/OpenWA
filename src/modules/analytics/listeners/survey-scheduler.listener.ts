import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 10 Plan 03 Task 2: Survey scheduling listener.
 *
 * Listens for conversation.resolved and conversation.escalated events and schedules
 * satisfaction surveys (NPS) to be sent 5 minutes after conversation ends.
 *
 * Survey scheduling is delayed to avoid immediate user disruption and increase
 * response rate (users have time to reflect on the interaction).
 */
@Injectable()
export class SurveySchedulerListener {
  private readonly logger = createLogger('SurveySchedulerListener');

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(QUEUE_NAMES.ANALYTICS)
    private readonly analyticsQueue: Queue,
  ) {}

  /**
   * Returns true if satisfaction surveys are enabled via config.
   */
  private get enabled(): boolean {
    return this.configService.get<boolean>('analytics.satisfaction.enabled', true);
  }

  /**
   * Get survey delay in milliseconds from config (default: 5 minutes).
   */
  private get surveyDelayMs(): number {
    const minutes = this.configService.get<number>('analytics.satisfaction.delayMinutes', 5);
    return minutes * 60 * 1000;
  }

  /**
   * Schedule NPS survey when conversation is resolved.
   *
   * @param payload - Event payload with sessionId, chatId, userId, conversationId
   */
  @OnEvent('conversation.resolved')
  async handleConversationResolved(payload: {
    sessionId: string;
    chatId: string;
    userId: string;
    conversationId: string;
    userName?: string;
  }) {
    if (!this.enabled) {
      return;
    }

    await this.scheduleSurvey(payload, 'resolved');
  }

  /**
   * Schedule NPS survey when conversation is escalated to human.
   *
   * @param payload - Event payload with sessionId, chatId, userId, conversationId
   */
  @OnEvent('conversation.escalated')
  async handleConversationEscalated(payload: {
    sessionId: string;
    chatId: string;
    userId: string;
    conversationId: string;
    userName?: string;
  }) {
    if (!this.enabled) {
      return;
    }

    await this.scheduleSurvey(payload, 'escalated');
  }

  /**
   * Schedule NPS survey job with delay.
   *
   * @param payload - Conversation event payload
   * @param outcome - Conversation outcome ('resolved' or 'escalated')
   */
  private async scheduleSurvey(
    payload: {
      sessionId: string;
      chatId: string;
      userId: string;
      conversationId: string;
      userName?: string;
    },
    outcome: string,
  ): Promise<void> {
    try {
      // Extract phone number from chatId (format: '5511999999999@c.us')
      const phoneNumber = payload.chatId.split('@')[0];
      const userName = payload.userName || 'Cliente';

      // Enqueue NPS survey job with 5-minute delay
      await this.analyticsQueue.add(
        'send-nps-survey',
        {
          phoneNumber,
          userName,
          conversationId: payload.conversationId,
          sessionId: payload.sessionId,
          outcome,
        },
        {
          delay: this.surveyDelayMs,
          jobId: `survey-${payload.conversationId}`, // Dedupe: one survey per conversation
        } as any,
      );

      this.logger.log(
        `Scheduled NPS survey for conversation ${payload.conversationId} (${outcome}, delay: ${this.surveyDelayMs}ms)`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to schedule survey for conversation ${payload.conversationId}: ${error}`,
      );
      // Don't throw — survey scheduling failure shouldn't break conversation processing
    }
  }
}
