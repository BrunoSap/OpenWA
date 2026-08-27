import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QUEUE_NAMES } from '../../queue/queue-names';
import { IntentClassificationService } from '../services/intent-classification.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { AnalyticsIntentClassification } from '../entities/analytics-intent-classification.entity';
import { createLogger } from '../../../common/services/logger.service';

/**
 * Phase 10 Plan 01: BullMQ processor for hourly intent classification (DASH-03).
 *
 * Runs on a repeatable job schedule (hourly at minute 0) to batch-classify unclassified messages
 * from the last hour. Fetches messages from analytics_events where event_type='message.processed'
 * and message_id NOT IN (already classified), calls IntentClassificationService.classifyIntentsBatch,
 * and stores results in analytics_intent_classifications.
 *
 * Job enqueued at module init (analytics.module.ts) with cron '0 * * * *'.
 */
@Processor(QUEUE_NAMES.ANALYTICS)
export class IntentClassificationProcessor extends WorkerHost {
  private readonly logger = createLogger('IntentClassificationProcessor');

  constructor(
    private readonly intentService: IntentClassificationService,
    @InjectRepository(AnalyticsEvent, 'data')
    private readonly eventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(AnalyticsIntentClassification, 'data')
    private readonly classificationRepository: Repository<AnalyticsIntentClassification>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'classify-intents-batch') {
      return; // Only process intent classification jobs
    }

    this.logger.log(`Processing intent classification batch job (id: ${job.id})`);

    try {
      // Fetch unclassified messages from last hour
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      const unclassifiedMessages = await this.eventRepository
        .createQueryBuilder('event')
        .select(['event.id', 'event.payload', 'event.session_id', 'event.chat_id', 'event.user_id'])
        .where('event.event_type = :eventType', { eventType: 'message.processed' })
        .andWhere('event.created_at >= :startTime', { startTime: oneHourAgo })
        .andWhere(
          `event.id NOT IN (
            SELECT message_id FROM analytics_intent_classifications
          )`,
        )
        .limit(100) // Batch size limit per RESEARCH.md threat T-10-02
        .getMany();

      if (unclassifiedMessages.length === 0) {
        this.logger.log('No unclassified messages in last hour');
        return;
      }

      this.logger.log(`Found ${unclassifiedMessages.length} unclassified messages`);

      // Extract message text from payload
      const messagesToClassify = unclassifiedMessages
        .map((event) => {
          const messageText = (event.payload as any)?.message_text || (event.payload as any)?.text;
          if (!messageText) {
            this.logger.warn(`Event ${event.id} has no message text in payload`);
            return null;
          }
          return {
            id: event.id,
            text: this.redactPII(messageText),
            sessionId: event.session_id,
            chatId: event.chat_id,
            userId: event.user_id,
          };
        })
        .filter((m) => m !== null) as {
        id: string;
        text: string;
        sessionId?: string;
        chatId?: string;
        userId?: string;
      }[];

      if (messagesToClassify.length === 0) {
        this.logger.log('No valid messages to classify (missing text)');
        return;
      }

      // Call intent classification service
      const classifications = await this.intentService.classifyIntentsBatch(
        messagesToClassify,
        'global',
      );

      // Store results
      const classificationsToSave = classifications.map((c) => {
        const originalMessage = messagesToClassify.find((m) => m.id === c.messageId);
        return this.classificationRepository.create({
          message_id: c.messageId,
          session_id: originalMessage?.sessionId || 'unknown',
          chat_id: originalMessage?.chatId || 'unknown',
          user_id: originalMessage?.userId,
          intent_name: c.intent,
          confidence: c.confidence,
        });
      });

      await this.classificationRepository.save(classificationsToSave);

      this.logger.log(`Saved ${classificationsToSave.length} intent classifications`);
    } catch (error) {
      this.logger.error(`Intent classification failed: ${error}`);
      throw error; // Re-throw so BullMQ marks the job as failed
    }
  }

  /**
   * Redact PII from message text per threat T-10-01.
   *
   * Strips phone numbers, emails, and CPF patterns before sending to Anthropic.
   */
  private redactPII(text: string): string {
    let redacted = text;

    // Redact phone numbers (BR format: (XX) XXXXX-XXXX or similar)
    redacted = redacted.replace(/(\+?\d{2})?\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}/g, '[PHONE]');

    // Redact emails
    redacted = redacted.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');

    // Redact CPF (Brazilian tax ID: XXX.XXX.XXX-XX)
    redacted = redacted.replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[CPF]');

    return redacted;
  }
}
