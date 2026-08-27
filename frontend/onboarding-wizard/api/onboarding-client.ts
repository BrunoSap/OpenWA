/**
 * OnboardingClient - API client for onboarding endpoints
 * Phase 09 Plan 04: Tenant onboarding automation
 */

export interface OnboardingStateDto {
  currentStep: string;
  completedSteps: string[];
  metadata?: Record<string, any>;
}

export interface Session {
  id: string;
  name: string;
  status: string;
  qrCode?: string;
}

export interface SendMessageDto {
  to: string;
  body: string;
}

/**
 * Fetch onboarding state for a tenant
 */
export async function getState(tenantId: string, apiKey: string): Promise<OnboardingStateDto> {
  const response = await fetch(`/api/onboarding/${tenantId}/state`, {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch onboarding state: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Advance to the next onboarding step
 */
export async function advanceStep(
  tenantId: string,
  step: string,
  apiKey: string,
): Promise<OnboardingStateDto> {
  const response = await fetch(`/api/onboarding/${tenantId}/advance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ step }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to advance step');
  }

  return response.json();
}

/**
 * Get all sessions for the tenant
 */
export async function getSessions(apiKey: string): Promise<Session[]> {
  const response = await fetch('/api/sessions', {
    headers: {
      'X-API-Key': apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Send a message via a session
 */
export async function sendMessage(
  sessionId: string,
  to: string,
  body: string,
  apiKey: string,
): Promise<any> {
  const response = await fetch(`/api/sessions/${sessionId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ to, body }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send message: ${response.statusText}`);
  }

  return response.json();
}
