import React from 'react';

interface StepProps {
  tenantId: string;
  apiKey: string;
  onNext: () => void;
  onPrevious?: () => void;
}

/**
 * CompleteStep - Onboarding complete celebration
 */
export const CompleteStep: React.FC<StepProps> = () => {
  const handleGoToDashboard = () => {
    window.location.href = '/dashboard';
  };

  return (
    <div className="complete-step">
      <div className="celebration">
        <h3>🎉 Setup Complete!</h3>
        <p>Your OpenWA tenant is ready to use. You can now:</p>
        <ul>
          <li>✅ Send and receive WhatsApp messages via API</li>
          <li>✅ Configure webhooks for incoming messages</li>
          <li>✅ Upload knowledge base documents for AI responses</li>
          <li>✅ Create automation rules and workflows</li>
        </ul>

        <div className="next-steps">
          <h4>Next Steps:</h4>
          <ol>
            <li>
              <strong>Explore the Dashboard:</strong> View your sessions, messages, and analytics
            </li>
            <li>
              <strong>Read the API Docs:</strong> Learn how to integrate OpenWA with your
              application
            </li>
            <li>
              <strong>Configure Webhooks:</strong> Receive real-time notifications for incoming
              messages
            </li>
          </ol>
        </div>

        <div className="resources">
          <h4>Helpful Resources:</h4>
          <ul>
            <li>
              <a href="/api/docs" target="_blank" rel="noopener noreferrer">
                📚 API Documentation
              </a>
            </li>
            <li>
              <a href="/docs/guides" target="_blank" rel="noopener noreferrer">
                📖 User Guides
              </a>
            </li>
            <li>
              <a href="/docs/architecture" target="_blank" rel="noopener noreferrer">
                🏗️ Architecture Overview
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="step-actions">
        <button onClick={handleGoToDashboard} className="btn-primary btn-large">
          Go to Dashboard →
        </button>
      </div>
    </div>
  );
};
