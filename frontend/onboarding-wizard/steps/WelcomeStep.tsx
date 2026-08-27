import React from 'react';

interface StepProps {
  tenantId: string;
  apiKey: string;
  onNext: () => void;
  onPrevious?: () => void;
}

/**
 * WelcomeStep - First onboarding step
 * Static content introducing the platform
 */
export const WelcomeStep: React.FC<StepProps> = ({ onNext }) => {
  return (
    <div className="welcome-step">
      <div className="welcome-content">
        <h3>🎉 Welcome to OpenWA!</h3>
        <p>
          Your tenant has been created successfully. Let's get you set up in just a few steps.
        </p>
        <ul>
          <li>✅ Connect your WhatsApp account</li>
          <li>✅ Send a test message</li>
          <li>✅ Start automating!</li>
        </ul>
        <p>
          <strong>Your admin API key has been generated.</strong> Make sure you've saved it
          securely - you won't be able to retrieve it again.
        </p>
      </div>
      <div className="step-actions">
        <button onClick={onNext} className="btn-primary">
          Get Started →
        </button>
      </div>
    </div>
  );
};
