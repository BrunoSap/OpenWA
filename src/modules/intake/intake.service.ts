import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IntakeLead } from './entities/intake-lead.entity';
import { createLogger } from '../../common/services/logger.service';

/**
 * Owns intake-lead persistence on the 'data' connection. ingestMessage is idempotent per chat_id
 * (upsert), so re-delivering the same WhatsApp message never creates a duplicate lead — the tracer
 * proves this end-to-end. Domain validation of the inbound message shape lives in the DTO layer.
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
   * Create-or-reuse a lead by chat_id. A new chat_id creates a lead in 'in_progress'; an existing
   * chat_id appends the message text to case_data.messages and reuses the row (upsert idempotent by
   * chat_id). Returns the persisted lead.
   */
  async ingestMessage(input: { sessionId: string; chatId: string; text: string }): Promise<IntakeLead> {
    const existing = await this.leads.findOne({ where: { chatId: input.chatId } });
    if (existing) {
      const messages = Array.isArray(existing.caseData?.messages)
        ? (existing.caseData.messages as unknown[])
        : [];
      existing.caseData = { ...existing.caseData, messages: [...messages, input.text] };
      const saved = await this.leads.save(existing);
      this.logger.debug('Appended message to existing intake lead', {
        sessionId: input.sessionId,
        chatId: input.chatId,
        leadId: saved.id,
      });
      return saved;
    }

    const created = this.leads.create({
      chatId: input.chatId,
      caseType: 'unknown',
      caseData: { messages: [input.text] },
      intakeStatus: 'in_progress',
    });
    const saved = await this.leads.save(created);
    this.logger.debug('Created intake lead', {
      sessionId: input.sessionId,
      chatId: input.chatId,
      leadId: saved.id,
    });
    return saved;
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
