/**
 * Phase 7 Plan 03 Task 2: Alerts page.
 *
 * Displays alert rules table with create/delete CRUD + CSV/JSON export buttons.
 */

import { useState } from 'react';
import { useAlertRules, useCreateAlertRule, useDeleteAlertRule } from '../../hooks/useAnalytics';
import { AlertRuleForm, type AlertRuleInput } from '../../components/analytics/AlertRuleForm';
import { AnalyticsTabs } from '../../components/analytics/AnalyticsTabs';
import { analyticsApi } from '../../services/analytics';
import { triggerBlobDownload } from '../../utils/analyticsExport';

export function AlertsPage() {
  const [showForm, setShowForm] = useState(false);
  const [dateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
  });

  const { data: rules, isLoading, isError, error } = useAlertRules();
  const createMutation = useCreateAlertRule();
  const deleteMutation = useDeleteAlertRule();

  const handleCreate = (rule: AlertRuleInput) => {
    createMutation.mutate(rule, {
      onSuccess: () => {
        setShowForm(false);
      },
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this alert rule?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const blob = await analyticsApi.exportEvents({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        format,
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `analytics-export-${timestamp}.${format}`;
      triggerBlobDownload(blob, filename);
    } catch (err) {
      alert(`Export failed: ${(err as Error).message}`);
    }
  };

  return (
    <div className="analytics-page">
      <AnalyticsTabs />

      <div className="page-header">
        <div>
          <h1>Alert Rules</h1>
          <p className="page-description">Configure alerts for business metrics</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            onClick={() => handleExport('csv')}
            className="btn-secondary"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => handleExport('json')}
            className="btn-secondary"
          >
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            Create Alert Rule
          </button>
        </div>
      </div>

      {showForm && (
        <div className="form-card">
          <h2>Create Alert Rule</h2>
          <AlertRuleForm
            onSubmit={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {isError && (
        <div className="error-message">
          <p>Error loading alert rules: {(error as Error).message}</p>
        </div>
      )}

      {isLoading && !rules && (
        <div className="loading-indicator">
          <p>Loading alert rules...</p>
        </div>
      )}

      {rules && (
        <div className="table-card">
          <table className="alerts-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Metric</th>
                <th>Condition</th>
                <th>Threshold</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No alert rules configured. Create one to get started.
                  </td>
                </tr>
              )}
              {rules.map((rule: any) => (
                <tr key={rule.id}>
                  <td>{rule.name}</td>
                  <td>{rule.metric}</td>
                  <td>{rule.condition}</td>
                  <td>{rule.threshold}</td>
                  <td>
                    <span className={`status-badge ${rule.enabled ? 'active' : 'inactive'}`}>
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleDelete(rule.id)}
                      className="btn-danger-small"
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
