import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { WhatsAppInteractiveService } from '../services/whatsapp-interactive.service';
import { AnalyticsEventsService } from '../services/analytics-events.service';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 10 Plan 03 Task 2: BullMQ processor for scheduled satisfaction surveys.
 *
 * Handles 'send-nps-survey' and 'send-csat-survey' jobs scheduled 5 minutes after
 * conversation.resolved or conversation.escalated events. Sends WhatsApp survey message
 * and emits 'survey.sent' analytics event for tracking.
 *
 * Job payload: { phoneNumber, userName, conversationId, surveyType }
 */
@Processor(QUEUE_NAMES.ANALYTICS)
export class SurveySchedulerProcessor extends WorkerHost {
  private readonly logger = createLogger('SurveySchedulerProcessor');

  constructor(
    private readonly whatsappInteractiveService: WhatsAppInteractiveService,
    private readonly analyticsEventsService: AnalyticsEventsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'send-nps-survey') {
      await this.processSendNpsSurvey(job);
    } else if (job.name === 'send-csat-survey') {
      await this.processSendCsatSurvey(job);
    }
    // Other job types handled by other processors in this queue
  }

  private async processSendNpsSurvey(job: Job): Promise<void> {
    const { phoneNumber, userName, conversationId } = job.data;

    this.logger.log(
      `Processing NPS survey job for conversation ${conversationId} (phone: ${phoneNumber})`,
    );

    try {
      // Send NPS survey via WhatsApp
      await this.whatsappInteractiveService.sendNpsSurvey(
        phoneNumber,
        userName,
        conversationId,
      );

      // Track survey sent event
      await this.analyticsEventsService.recordEvent({
        event_type: 'survey.sent',
        conversation_id: conversationId,
        user_id: phoneNumber,
        payload: {
          survey_type: 'nps',
          sent_at: new Date().toISOString(),
        },
      });

      this.logger.log(
        `NPS survey sent successfully for conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send NPS survey for conversation ${conversationId}: ${error}`,
      );
      throw error; // Re-throw so BullMQ marks job as failed and retries
    }
  }

  private async processSendCsatSurvey(job: Job): Promise<void> {
    const { phoneNumber, userName, conversationId } = job.data;

    this.logger.log(
      `Processing CSAT survey job for conversation ${conversationId} (phone: ${phoneNumber})`,
    );

    try {
      // Send CSAT survey via WhatsApp
      await this.whatsappInteractiveService.sendCsatSurvey(
        phoneNumber,
        userName,
        conversationId,
      );

      // Track survey sent event
      await this.analyticsEventsService.recordEvent({
        event_type: 'survey.sent',
        conversation_id: conversationId,
        user_id: phoneNumber,
        payload: {
          survey_type: 'csat',
          sent_at: new Date().toISOString(),
        },
      });

      this.logger.log(
        `CSAT survey sent successfully for conversation ${conversationId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send CSAT survey for conversation ${conversationId}: ${error}`,
      );
      throw error;
    }
  }
}
