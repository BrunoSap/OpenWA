/**
 * Phase 7 Plan 03 Task 2: Alert rule form component.
 *
 * Collects alert rule fields: name, metric, condition, threshold, enabled, notification_channels.
 */

import { useState, type FormEvent } from 'react';

interface AlertRuleFormProps {
  onSubmit: (rule: AlertRuleInput) => void;
  onCancel: () => void;
}

export interface AlertRuleInput {
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  notification_channels: {
    slack?: {
      webhookUrl: string;
    };
  };
}

const METRICS = [
  { value: 'fallback_rate', label: 'Fallback Rate' },
  { value: 'resolution_rate', label: 'Resolution Rate' },
  { value: 'cost_total_usd', label: 'Total Cost (USD)' },
  { value: 'latency_p95', label: 'Latency p95' },
];

const CONDITIONS = [
  { value: 'above', label: 'Above' },
  { value: 'below', label: 'Below' },
];

export function AlertRuleForm({ onSubmit, onCancel }: AlertRuleFormProps) {
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('fallback_rate');
  const [condition, setCondition] = useState('above');
  const [threshold, setThreshold] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const rule: AlertRuleInput = {
      name,
      metric,
      condition,
      threshold,
      enabled,
      notification_channels: slackWebhookUrl
        ? { slack: { webhookUrl: slackWebhookUrl } }
        : {},
    };

    onSubmit(rule);
  };

  return (
    <form onSubmit={handleSubmit} className="alert-rule-form">
      <div className="form-group">
        <label htmlFor="rule-name">Rule Name</label>
        <input
          id="rule-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g., High Fallback Rate Alert"
        />
      </div>

      <div className="form-group">
        <label htmlFor="rule-metric">Metric</label>
        <select
          id="rule-metric"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          {METRICS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="rule-condition">Condition</label>
        <select
          id="rule-condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
        >
          {CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="rule-threshold">Threshold</label>
        <input
          id="rule-threshold"
          type="number"
          step="0.01"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          required
        />
      </div>

      <div className="form-group">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Enabled</span>
        </label>
      </div>

      <div className="form-group">
        <label htmlFor="slack-webhook">Slack Webhook URL (optional)</label>
        <input
          id="slack-webhook"
          type="url"
          value={slackWebhookUrl}
          onChange={(e) => setSlackWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/..."
        />
      </div>

      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          Create Rule
        </button>
      </div>
    </form>
  );
}
