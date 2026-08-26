import { advanceIntake, IntakeFlowState } from './intake-flow';

/**
 * Unit tests for the deterministic conversational engine. advanceIntake is a PURE function (no I/O,
 * no repository) so the whole step machine — order of fields, urgency validation, completion — is
 * proven here in isolation, independent of NestJS/TypeORM boot.
 */
describe('advanceIntake', () => {
  it('Test 1: empty state asks for the name first (step collect_name)', () => {
    const result = advanceIntake({}, '');
    expect(result.step).toBe('collect_name');
    expect(result.completed).toBe(false);
    expect(result.reply).toMatch(/nome/i);
  });

  it('Test 2: a message in collect_name records fullName and advances to collect_phone', () => {
    const result = advanceIntake({}, 'Maria Silva');
    expect(result.nextState.fullName).toBe('Maria Silva');
    expect(result.step).toBe('collect_phone');
    expect(result.reply).toMatch(/telefone/i);
    expect(result.completed).toBe(false);
  });

  it('Test 3: the full sequence name -> phone -> email -> demand -> urgency reaches completed', () => {
    let state: IntakeFlowState = {};

    let r = advanceIntake(state, 'Maria Silva');
    state = r.nextState;
    expect(r.step).toBe('collect_phone');

    r = advanceIntake(state, '+5511999998888');
    state = r.nextState;
    expect(state.phone).toBe('+5511999998888');
    expect(r.step).toBe('collect_email');

    r = advanceIntake(state, 'maria@example.com');
    state = r.nextState;
    expect(state.email).toBe('maria@example.com');
    expect(r.step).toBe('collect_demand');

    r = advanceIntake(state, 'Preciso de ajuda com um caso trabalhista');
    state = r.nextState;
    expect(state.caseType).toBe('Preciso de ajuda com um caso trabalhista');
    expect(r.step).toBe('collect_urgency');

    r = advanceIntake(state, 'alta');
    state = r.nextState;
    expect(state.urgencyLevel).toBe('high');
    expect(r.step).toBe('completed');
    expect(r.completed).toBe(true);
    // Confirmation message summarises collected data.
    expect(r.reply).toMatch(/Maria Silva/);
  });

  it('Test 4: invalid urgency input keeps the step and repeats the urgency question', () => {
    const state: IntakeFlowState = {
      fullName: 'Maria Silva',
      phone: '+5511999998888',
      email: 'maria@example.com',
      caseType: 'caso trabalhista',
    };

    const r = advanceIntake(state, 'talvez');
    expect(r.nextState.urgencyLevel).toBeUndefined();
    expect(r.step).toBe('collect_urgency');
    expect(r.completed).toBe(false);
    expect(r.reply).toMatch(/urg/i);
  });

  it('does not mutate the input state (returns a new nextState)', () => {
    const state: IntakeFlowState = {};
    const r = advanceIntake(state, 'Maria Silva');
    expect(state.fullName).toBeUndefined();
    expect(r.nextState).not.toBe(state);
  });

  it('normalizes urgency synonyms: baixa/normal -> normal, alta/high -> high, critica/urgente/critical -> critical', () => {
    const base: IntakeFlowState = {
      fullName: 'X',
      phone: '+551199',
      email: 'x@x.com',
      caseType: 'y',
    };
    expect(advanceIntake(base, 'baixa').nextState.urgencyLevel).toBe('normal');
    expect(advanceIntake(base, 'normal').nextState.urgencyLevel).toBe('normal');
    expect(advanceIntake(base, 'alta').nextState.urgencyLevel).toBe('high');
    expect(advanceIntake(base, 'high').nextState.urgencyLevel).toBe('high');
    expect(advanceIntake(base, 'critica').nextState.urgencyLevel).toBe('critical');
    expect(advanceIntake(base, 'urgente').nextState.urgencyLevel).toBe('critical');
    expect(advanceIntake(base, 'critical').nextState.urgencyLevel).toBe('critical');
  });
});
