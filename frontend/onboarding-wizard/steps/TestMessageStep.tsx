import React, { useState } from 'react';

interface StepProps {
  tenantId: string;
  apiKey: string;
  onNext: () => void;
  onPrevious?: () => void;
}

/**
 * TestMessageStep - Send a test message to verify setup
 */
export const TestMessageStep: React.FC<StepProps> = ({ apiKey, onNext }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [messageBody, setMessageBody] = useState('Hello! This is a test message from OpenWA.');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async () => {
    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    try {
      setSending(true);
      setError(null);

      const response = await fetch('/api/sessions/default/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          to: phoneNumber,
          body: messageBody,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="test-message-step">
      <div className="test-message-form">
        <p>Send a test message to verify your WhatsApp connection is working correctly.</p>

        <div className="form-group">
          <label htmlFor="phoneNumber">Phone Number (with country code):</label>
          <input
            id="phoneNumber"
            type="tel"
            placeholder="+1234567890"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={success}
          />
          <p className="help-text">Example: +5511999887766 (include country code)</p>
        </div>

        <div className="form-group">
          <label htmlFor="messageBody">Message:</label>
          <textarea
            id="messageBody"
            rows={3}
            value={messageBody}
            onChange={(e) => setMessageBody(e.target.value)}
            disabled={success}
          />
        </div>

        {error && <p className="error">{error}</p>}

        {success && (
          <div className="success-message">
            <h4>✅ Message Sent Successfully!</h4>
            <p>Check your phone to confirm delivery.</p>
          </div>
        )}

        <div className="form-actions">
          <button
            onClick={handleSendMessage}
            disabled={sending || success}
            className="btn-secondary"
          >
            {sending ? 'Sending...' : success ? 'Message Sent' : 'Send Test Message'}
          </button>
        </div>
      </div>

      <div className="step-actions">
        <button onClick={onNext} disabled={!success} className="btn-primary">
          {success ? 'Continue →' : 'Send a message first'}
        </button>
      </div>
    </div>
  );
};
