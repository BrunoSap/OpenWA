import React, { useState, useEffect } from 'react';
import { OnboardingStateDto } from './api/onboarding-client';
import { WelcomeStep } from './steps/WelcomeStep';
import { WhatsAppQRStep } from './steps/WhatsAppQRStep';
import { TestMessageStep } from './steps/TestMessageStep';
import { CompleteStep } from './steps/CompleteStep';

/**
 * OnboardingWizard - Multi-step tenant onboarding wizard
 * Phase 09 Plan 04: Tenant onboarding automation
 *
 * Usage:
 *   <OnboardingWizard tenantId={tenantId} apiKey={adminKey} />
 *
 * Props:
 *   - tenantId: Tenant UUID from signup response
 *   - apiKey: Admin API key (shown once during signup)
 */

interface OnboardingWizardProps {
  tenantId: string;
  apiKey: string;
}

interface WizardStep {
  id: string;
  title: string;
  component: React.ComponentType<StepProps>;
}

interface StepProps {
  tenantId: string;
  apiKey: string;
  onNext: () => void;
  onPrevious?: () => void;
}

const steps: WizardStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to OpenWA',
    component: WelcomeStep,
  },
  {
    id: 'whatsapp',
    title: 'Connect WhatsApp',
    component: WhatsAppQRStep,
  },
  {
    id: 'test-message',
    title: 'Send Test Message',
    component: TestMessageStep,
  },
  {
    id: 'complete',
    title: 'Setup Complete!',
    component: CompleteStep,
  },
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ tenantId, apiKey }) => {
  const [state, setState] = useState<OnboardingStateDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current onboarding state on mount
  useEffect(() => {
    fetchState();
  }, [tenantId, apiKey]);

  const fetchState = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/onboarding/${tenantId}/state`, {
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch onboarding state: ${response.statusText}`);
      }

      const data: OnboardingStateDto = await response.json();
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (!state) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/onboarding/${tenantId}/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ step: state.currentStep }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to advance step');
      }

      const newState: OnboardingStateDto = await response.json();
      setState(newState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !state) {
    return <div className="onboarding-wizard loading">Loading...</div>;
  }

  if (error) {
    return (
      <div className="onboarding-wizard error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={fetchState}>Retry</button>
      </div>
    );
  }

  if (!state) {
    return null;
  }

  const currentStepIndex = steps.findIndex((s) => s.id === state.currentStep);
  const currentStepDef = steps[currentStepIndex];

  if (!currentStepDef) {
    return <div className="onboarding-wizard error">Unknown step: {state.currentStep}</div>;
  }

  const StepComponent = currentStepDef.component;

  return (
    <div className="onboarding-wizard">
      {/* Progress indicator */}
      <div className="progress-indicator">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`progress-step ${index <= currentStepIndex ? 'active' : ''} ${
              state.completedSteps.includes(step.id) ? 'completed' : ''
            }`}
          >
            <div className="step-number">
              {state.completedSteps.includes(step.id) ? '✓' : index + 1}
            </div>
            <div className="step-title">{step.title}</div>
          </div>
        ))}
      </div>

      {/* Current step content */}
      <div className="step-content">
        <h2>{currentStepDef.title}</h2>
        <StepComponent
          tenantId={tenantId}
          apiKey={apiKey}
          onNext={handleNext}
          onPrevious={currentStepIndex > 0 ? () => {} : undefined}
        />
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner">Processing...</div>
        </div>
      )}
    </div>
  );
};
