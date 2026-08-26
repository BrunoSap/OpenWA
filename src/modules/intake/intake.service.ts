import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntakeLead } from './entities/intake-lead.entity';
import { advanceIntake, IntakeFlowState, IntakeStep } from './intake-flow';
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

    if (completed && lead.intakeStatus !== 'completed') {
      lead.intakeStatus = 'completed';
      lead.intakeCompletedAt = new Date().toISOString();
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
}
