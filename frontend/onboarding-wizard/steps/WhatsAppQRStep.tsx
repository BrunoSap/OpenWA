import React, { useState, useEffect } from 'react';

interface StepProps {
  tenantId: string;
  apiKey: string;
  onNext: () => void;
  onPrevious?: () => void;
}

interface Session {
  id: string;
  name: string;
  status: string;
  qrCode?: string;
}

/**
 * WhatsAppQRStep - Connect WhatsApp via QR code
 * Polls session status until 'ready'
 */
export const WhatsAppQRStep: React.FC<StepProps> = ({ apiKey, onNext }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const pollSessions = async () => {
      try {
        const response = await fetch('/api/sessions', {
          headers: { 'X-API-Key': apiKey },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch sessions');
        }

        const data: Session[] = await response.json();
        setSessions(data);

        const hasReady = data.some((s) => s.status === 'ready');
        setIsReady(hasReady);
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    // Poll every 5 seconds
    const interval = setInterval(pollSessions, 5000);
    pollSessions(); // Initial call

    return () => clearInterval(interval);
  }, [apiKey]);

  const defaultSession = sessions.find((s) => s.name === 'default');

  return (
    <div className="whatsapp-qr-step">
      <div className="qr-content">
        {loading && <p>Loading session...</p>}

        {error && <p className="error">{error}</p>}

        {!loading && !error && defaultSession && (
          <>
            {defaultSession.status === 'qr_ready' && defaultSession.qrCode && (
              <div className="qr-code-display">
                <h4>Scan this QR code with WhatsApp:</h4>
                <img src={defaultSession.qrCode} alt="WhatsApp QR Code" />
                <p className="help-text">
                  Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                </p>
              </div>
            )}

            {defaultSession.status === 'ready' && (
              <div className="success-message">
                <h4>✅ WhatsApp Connected!</h4>
                <p>Your WhatsApp account is now linked and ready to use.</p>
              </div>
            )}

            {defaultSession.status === 'created' && (
              <div className="initializing-message">
                <p>Initializing session... Please wait.</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="step-actions">
        <button onClick={onNext} disabled={!isReady} className="btn-primary">
          {isReady ? 'Continue →' : 'Waiting for connection...'}
        </button>
      </div>
    </div>
  );
};
