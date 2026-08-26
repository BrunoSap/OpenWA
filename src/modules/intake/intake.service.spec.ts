import { IntakeService } from './intake.service';
import { IntakeLead } from './entities/intake-lead.entity';
import type { Repository } from 'typeorm';

/**
 * Unit tests for IntakeService.ingestMessage wired to the conversational engine (advanceIntake).
 * A hand-rolled in-memory fake stands in for the TypeORM Repository so the step-by-step collection
 * and the completed transition are proven without booting TypeORM/NestJS.
 */
describe('IntakeService.ingestMessage (conversational flow)', () => {
  function makeRepo(): Repository<IntakeLead> {
    const rows: IntakeLead[] = [];
    let seq = 1;
    const repo = {
      findOne: jest.fn(async ({ where }: { where: { chatId?: string; id?: number } }) => {
        return (
          rows.find(r => (where.chatId ? r.chatId === where.chatId : r.id === where.id)) ?? null
        );
      }),
      create: jest.fn((data: Partial<IntakeLead>) => ({ ...data }) as IntakeLead),
      save: jest.fn(async (lead: IntakeLead) => {
        if (!lead.id) {
          lead.id = seq++;
          rows.push(lead);
        }
        return lead;
      }),
    };
    return repo as unknown as Repository<IntakeLead>;
  }

  function newService(): IntakeService {
    return new IntakeService(makeRepo());
  }

  const chatId = '5511999999999@c.us';
  const sessionId = 'test-session';

  it('Test 1: first message on a new lead records fullName and asks for the phone', async () => {
    const service = newService();
    const res = await service.ingestMessage({ sessionId, chatId, text: 'Maria Silva' });

    expect(res.lead.fullName).toBe('Maria Silva');
    expect(res.step).toBe('collect_phone');
    expect(res.reply).toMatch(/telefone/i);
    expect(res.completed).toBe(false);
    expect(res.lead.intakeStatus).toBe('in_progress');
  });

  it('Test 2: after the five fields the lead becomes completed with intakeCompletedAt set', async () => {
    const service = newService();
    await service.ingestMessage({ sessionId, chatId, text: 'Maria Silva' });
    await service.ingestMessage({ sessionId, chatId, text: '+5511999998888' });
    await service.ingestMessage({ sessionId, chatId, text: 'maria@example.com' });
    await service.ingestMessage({ sessionId, chatId, text: 'Caso trabalhista' });
    const res = await service.ingestMessage({ sessionId, chatId, text: 'alta' });

    expect(res.completed).toBe(true);
    expect(res.step).toBe('completed');
    expect(res.lead.intakeStatus).toBe('completed');
    expect(res.lead.urgencyLevel).toBe('high');
    expect(res.lead.intakeCompletedAt).toBeTruthy();
  });

  it('Test 3: reply at each step matches the next question of the flow', async () => {
    const service = newService();

    const r1 = await service.ingestMessage({ sessionId, chatId, text: 'Maria Silva' });
    expect(r1.reply).toMatch(/telefone/i);

    const r2 = await service.ingestMessage({ sessionId, chatId, text: '+5511999998888' });
    expect(r2.reply).toMatch(/e-?mail/i);

    const r3 = await service.ingestMessage({ sessionId, chatId, text: 'maria@example.com' });
    expect(r3.reply).toMatch(/demanda|motivo/i);

    const r4 = await service.ingestMessage({ sessionId, chatId, text: 'Caso trabalhista' });
    expect(r4.reply).toMatch(/urg/i);
  });

  it('keeps one lead per chatId (idempotent upsert) across messages', async () => {
    const repo = makeRepo();
    const service = new IntakeService(repo);
    await service.ingestMessage({ sessionId, chatId, text: 'Maria Silva' });
    await service.ingestMessage({ sessionId, chatId, text: '+5511999998888' });
    // save called twice but create only once (second call reuses the existing row).
    expect((repo.create as jest.Mock).mock.calls.length).toBe(1);
  });

  it('caps case_data.messages at the last 50 entries (T-02-03)', async () => {
    const service = newService();
    for (let i = 0; i < 60; i++) {
      await service.ingestMessage({ sessionId, chatId, text: `msg ${i}` });
    }
    const lead = await service.getByChatId(chatId);
    const messages = lead.caseData.messages as string[];
    expect(messages.length).toBe(50);
    expect(messages[messages.length - 1]).toBe('msg 59');
  });
});
