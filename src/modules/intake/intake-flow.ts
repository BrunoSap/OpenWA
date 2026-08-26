/**
 * Deterministic conversational engine for the intake bot. A PURE function — no I/O, no repository,
 * no clock — so the whole step machine is unit-testable in isolation (intake-flow.spec.ts) and the
 * IntakeService (Plan 02 Task 2) is the only place that touches persistence.
 *
 * The five collected fields mirror the NUCLEAR columns of intake_staging.leads (migration 003):
 * full_name, phone, email, case_type, urgency_level. urgency_level is domain-constrained to
 * normal/high/critical (a DB CHECK on Postgres, threat T-02-02 here): advanceIntake validates it and
 * REFUSES to store an out-of-domain value, repeating the question instead.
 */

export type IntakeStep =
  | 'collect_name'
  | 'collect_phone'
  | 'collect_email'
  | 'collect_demand'
  | 'collect_urgency'
  | 'completed';

/** The subset of lead fields the flow collects. Every field is optional until the step fills it. */
export interface IntakeFlowState {
  fullName?: string;
  phone?: string;
  email?: string;
  caseType?: string;
  urgencyLevel?: string;
}

export interface AdvanceResult {
  nextState: IntakeFlowState;
  step: IntakeStep;
  reply: string;
  completed: boolean;
}

/** The domain values persisted for urgency_level — must match the migration-003 CHECK constraint. */
type UrgencyLevel = 'normal' | 'high' | 'critical';

/**
 * pt-BR urgency synonyms -> the three domain values. An input not in this map is REJECTED (not
 * stored), which is how T-02-02 (tampering with urgency_level) is mitigated in the flow layer.
 */
const URGENCY_SYNONYMS: Record<string, UrgencyLevel> = {
  baixa: 'normal',
  normal: 'normal',
  alta: 'high',
  high: 'high',
  critica: 'critical',
  urgente: 'critical',
  critical: 'critical',
};

/** Strip accents + lowercase + trim so 'Crítica', ' CRITICA ', 'critica' all map the same. */
function normalizeUrgency(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** The pt-BR question (or confirmation) that belongs to each step. */
const STEP_PROMPTS: Record<IntakeStep, string> = {
  collect_name: 'Olá! Para começarmos, qual é o seu nome completo?',
  collect_phone: 'Qual é o seu telefone para contato?',
  collect_email: 'Qual é o seu e-mail?',
  collect_demand: 'Descreva brevemente a sua demanda ou o motivo do contato.',
  collect_urgency: 'Qual a urgência do seu caso? Responda: normal, alta ou crítica.',
  completed: '',
};

/**
 * The current step is the FIRST still-empty field in the canonical order. This keeps the engine
 * stateless about "where we are": the state itself determines it, so a re-delivered message or a
 * resumed conversation lands on the right question deterministically.
 */
function stepFor(state: IntakeFlowState): IntakeStep {
  if (!state.fullName) return 'collect_name';
  if (!state.phone) return 'collect_phone';
  if (!state.email) return 'collect_email';
  if (!state.caseType) return 'collect_demand';
  if (!state.urgencyLevel) return 'collect_urgency';
  return 'completed';
}

/** Human-readable summary echoed back when all five fields are collected. */
function confirmationReply(state: IntakeFlowState): string {
  return (
    'Obrigado! Registramos seus dados:\n' +
    `- Nome: ${state.fullName}\n` +
    `- Telefone: ${state.phone}\n` +
    `- E-mail: ${state.email}\n` +
    `- Demanda: ${state.caseType}\n` +
    `- Urgência: ${state.urgencyLevel}\n` +
    'Em breve entraremos em contato.'
  );
}

/**
 * Advance the intake conversation by one message. Determines the current step from the first empty
 * field, records `message` into it (validating urgency), and returns the next question. Never mutates
 * the input `state` — always returns a fresh `nextState`.
 */
export function advanceIntake(state: IntakeFlowState, message: string): AdvanceResult {
  const currentStep = stepFor(state);

  // Already complete before this message: nothing to record, just re-confirm.
  if (currentStep === 'completed') {
    return { nextState: { ...state }, step: 'completed', reply: confirmationReply(state), completed: true };
  }

  const trimmed = message.trim();
  const nextState: IntakeFlowState = { ...state };

  // First call on an empty state (or an empty message) just asks the current question — nothing to
  // record yet. This is how the bot opens the conversation with "qual é o seu nome?".
  if (trimmed.length === 0) {
    return { nextState, step: currentStep, reply: STEP_PROMPTS[currentStep], completed: false };
  }

  switch (currentStep) {
    case 'collect_name':
      nextState.fullName = trimmed;
      break;
    case 'collect_phone':
      nextState.phone = trimmed;
      break;
    case 'collect_email':
      nextState.email = trimmed;
      break;
    case 'collect_demand':
      nextState.caseType = trimmed;
      break;
    case 'collect_urgency': {
      const mapped = URGENCY_SYNONYMS[normalizeUrgency(trimmed)];
      if (!mapped) {
        // Out-of-domain input (T-02-02): do NOT store, repeat the urgency question.
        return { nextState, step: 'collect_urgency', reply: STEP_PROMPTS.collect_urgency, completed: false };
      }
      nextState.urgencyLevel = mapped;
      break;
    }
  }

  const step = stepFor(nextState);
  const completed = step === 'completed';
  const reply = completed ? confirmationReply(nextState) : STEP_PROMPTS[step];
  return { nextState, step, reply, completed };
}
