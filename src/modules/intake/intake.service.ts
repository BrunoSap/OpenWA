import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IntakeLead } from './entities/intake-lead.entity';
import { advanceIntake, IntakeFlowState, IntakeStep } from './intake-flow';
import { postWebhookPayload } from '../webhook/utils/deliver-once';
import { ABTestingService } from '../analytics/services/ab-testing.service';
import { createLogger } from '../../common/services/logger.service';

/** How many raw message texts case_data.messages retains — bounds unbounded growth (T-02-03). */
const MAX_MESSAGE_HISTORY = 50;

/** The step-by-step result of ingesting one inbound message. */
export interface IngestResult {
  lead: IntakeLead;
  reply: string;
  step: IntakeStep;
  completed: boolean;
}

/**
 * Owns intake-lead persistence on the 'data' connection. ingestMessage is idempotent per chat_id
 * (upsert), so re-delivering the same WhatsApp message never creates a duplicate lead — the tracer
 * proves this end-to-end. The conversational flow itself lives in the pure advanceIntake engine
 * (intake-flow.ts); this service is the only layer that touches the DB.
 */
@Injectable()
export class IntakeService {
  private readonly logger = createLogger('IntakeService');

  // The named 'data' connection is mandatory: without it the repository token does not resolve
  // (the default connection is 'main', the always-SQLite auth/audit DB).
  constructor(
    @InjectRepository(IntakeLead, 'data')
    private readonly leads: Repository<IntakeLead>,
    private readonly eventEmitter: EventEmitter2,
    private readonly abTestingService: ABTestingService,
  ) {}

  /**
   * Advance the intake conversation by one inbound message. Create-or-reuse the lead by chat_id
   * (upsert idempotent by chat_id), map its collected fields into the flow state, run the
   * deterministic engine, persist the resulting fields, and — when the five fields are complete —
   * mark the lead 'completed' with intake_completed_at set. Returns the persisted lead plus the
   * next question the bot should send.
   */
  async ingestMessage(input: { sessionId: string; chatId: string; text: string }): Promise<IngestResult> {
    const existing = await this.leads.findOne({ where: { chatId: input.chatId } });
    const lead =
      existing ??
      this.leads.create({
        chatId: input.chatId,
        caseType: '',
        caseData: { messages: [] },
        intakeStatus: 'in_progress',
      });

    // Assign A/B test variant for this user (consistent hashing ensures same variant each time)
    const userId = input.chatId; // Use chatId as userId for intake flow
    const variantId = this.abTestingService.assignVariant(userId, 'intake-flow-v2', 2);

    // Emit 'initiated' stage on first message
    if (!existing) {
      this.eventEmitter.emit('funnel.stage_entered', {
        sessionId: input.sessionId,
        userId,
        conversationId: input.chatId,
        stage: 'initiated',
        variantId,
        timestamp: new Date(),
      });
    }

    // Build the flow state from the lead's collected fields. caseType 'unknown'/'' from the tracer
    // reads as "not yet collected" so the demand step still runs.
    const state: IntakeFlowState = {
      fullName: lead.fullName ?? undefined,
      phone: lead.phone ?? undefined,
      email: lead.email ?? undefined,
      caseType: lead.caseType && lead.caseType !== 'unknown' ? lead.caseType : undefined,
      urgencyLevel:
        lead.intakeStatus === 'completed' || (lead.urgencyLevel && lead.urgencyLevel !== 'normal')
          ? lead.urgencyLevel
          : undefined,
    };

    const { nextState, reply, step, completed } = advanceIntake(state, input.text);

    // Apply the collected fields back onto the lead.
    lead.fullName = nextState.fullName ?? null;
    lead.phone = nextState.phone ?? null;
    lead.email = nextState.email ?? null;
    if (nextState.caseType) lead.caseType = nextState.caseType;
    if (nextState.urgencyLevel) lead.urgencyLevel = nextState.urgencyLevel;

    // Append the raw message, bounded to the last MAX_MESSAGE_HISTORY entries (T-02-03).
    const prior = Array.isArray(lead.caseData?.messages) ? (lead.caseData.messages as unknown[]) : [];
    const messages = [...prior, input.text].slice(-MAX_MESSAGE_HISTORY);
    lead.caseData = { ...lead.caseData, messages };

    // Emit funnel stage events based on flow progression
    const wasCompleted = lead.intakeStatus === 'completed';
    if (completed && !wasCompleted) {
      lead.intakeStatus = 'completed';
      lead.intakeCompletedAt = new Date().toISOString();

      // Emit 'data_collected' stage when all fields are complete
      this.eventEmitter.emit('funnel.stage_entered', {
        sessionId: input.sessionId,
        userId,
        conversationId: input.chatId,
        stage: 'data_collected',
        variantId,
        timestamp: new Date(),
      });
    } else if (step && nextState.urgencyLevel && !state.urgencyLevel) {
      // Emit 'qualified' stage after qualification questions answered (TODO: fix type check)
      this.eventEmitter.emit('funnel.stage_entered', {
        sessionId: input.sessionId,
        userId,
        conversationId: input.chatId,
        stage: 'qualified',
        variantId,
        timestamp: new Date(),
      });
    }

    const saved = await this.leads.save(lead);
    this.logger.debug('Advanced intake lead', {
      sessionId: input.sessionId,
      chatId: input.chatId,
      leadId: saved.id,
      step,
      completed,
    });

    return { lead: saved, reply, step, completed };
  }

  async getByChatId(chatId: string): Promise<IntakeLead> {
    const lead = await this.leads.findOne({ where: { chatId } });
    if (!lead) {
      throw new NotFoundException(`Intake lead for chat ${chatId} not found`);
    }
    return lead;
  }

  async findById(id: number): Promise<IntakeLead> {
    const lead = await this.leads.findOne({ where: { id } });
    if (!lead) {
      throw new NotFoundException(`Intake lead ${id} not found`);
    }
    return lead;
  }

  /**
   * Export a qualified lead to an external URL (webhook out). Only a lead that finished the flow
   * ('completed') is exportable — an in-progress lead throws ConflictException, so partial personal
   * data never leaves the system (threat T-02-01). The POST reuses postWebhookPayload, the shared
   * SSRF-guarded delivery core, so the same host allowlist/guard the webhook module enforces applies
   * here — no second HTTP client. Returns whether the receiver answered 2xx and its status.
   */
  async export(
    chatId: string,
    target: { url: string; headers?: Record<string, string> },
  ): Promise<{ delivered: boolean; status?: number }> {
    const lead = await this.getByChatId(chatId);
    if (lead.intakeStatus !== 'completed') {
      throw new ConflictException('Lead intake not completed');
    }

    const payload = {
      id: lead.id,
      chatId: lead.chatId,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      caseType: lead.caseType,
      urgencyLevel: lead.urgencyLevel,
      caseData: lead.caseData,
      intakeStatus: lead.intakeStatus,
      intakeCompletedAt: lead.intakeCompletedAt,
    };

    const headers = {
      ...(target.headers ?? {}),
      'Content-Type': 'application/json',
      'User-Agent': 'OpenWA-Intake/1.0.0',
    };

    try {
      const { status } = await postWebhookPayload(target.url, JSON.stringify(payload), headers, 10000);
      this.logger.debug('Exported intake lead', { chatId, leadId: lead.id, status });

      // Emit 'exported' stage when data successfully exported
      const userId = chatId;
      const variantId = this.abTestingService.assignVariant(userId, 'intake-flow-v2', 2);
      this.eventEmitter.emit('funnel.stage_entered', {
        sessionId: 'export', // No session context in export method
        userId,
        conversationId: chatId,
        stage: 'exported',
        variantId,
        timestamp: new Date(),
      });

      return { delivered: true, status };
    } catch (error) {
      // A non-2xx or a network/SSRF error: report as not delivered without leaking the destination.
      this.logger.warn('Intake lead export failed', { chatId, leadId: lead.id, error: String(error) });
      return { delivered: false };
    }
  }
}
