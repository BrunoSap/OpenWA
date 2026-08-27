/**
 * Phase 7 Plan 02 Task 2: Analytics Overview page.
 *
 * Consumes useAnalyticsStream() to display live KPIs (resolutionRate, fallbackRate,
 * costPerConversation, dau, mau). Shows connecting state until first snapshot.
 */

import { useMemo } from 'react';
import { useAnalyticsStream } from '../../hooks/useAnalyticsStream';
import { KPICard } from '../../components/analytics/KPICard';
import { AnalyticsTabs } from '../../components/analytics/AnalyticsTabs';
import { formatKpi } from '../../utils/formatKpi';
import { CheckCircle, AlertTriangle, DollarSign, Users, Activity } from 'lucide-react';

export function AnalyticsOverview() {
  const { snapshot, status } = useAnalyticsStream();

  // Memoize derived card data keyed on snapshot (RESEARCH pitfall 2: avoid new array refs each render)
  const kpiCards = useMemo(() => {
    if (!snapshot) return [];

    return [
      {
        title: 'Resolution Rate',
        value: formatKpi(snapshot.kpis.resolutionRate, 'percent'),
        icon: CheckCircle,
      },
      {
        title: 'Fallback Rate',
        value: formatKpi(snapshot.kpis.fallbackRate, 'percent'),
        icon: AlertTriangle,
      },
      {
        title: 'Cost per Conversation',
        value: formatKpi(snapshot.kpis.costPerConversation, 'currency'),
        icon: DollarSign,
      },
      {
        title: 'Daily Active Users',
        value: formatKpi(snapshot.kpis.dau, 'integer'),
        icon: Users,
      },
      {
        title: 'Monthly Active Users',
        value: formatKpi(snapshot.kpis.mau, 'integer'),
        icon: Activity,
      },
    ];
  }, [snapshot]);

  if (!snapshot) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ fontSize: '1.125rem', color: 'var(--text-primary)' }}>
          Connecting to analytics stream...
        </div>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Real-time metrics will appear once connected
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <AnalyticsTabs />

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 700, margin: 0, marginBottom: '0.5rem' }}>
          Analytics Overview
        </h1>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Status: {status === 'live' ? '🟢 Live' : status === 'polling' ? '🟡 Polling' : '⚪ Connecting'}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        {kpiCards.map(card => (
          <KPICard key={card.title} title={card.title} value={card.value} icon={card.icon} />
        ))}
      </div>

      {/* Status Footer */}
      <div
        style={{
          marginTop: '2rem',
          paddingTop: '1rem',
          borderTop: '1px solid var(--border)',
          fontSize: '0.75rem',
          color: 'var(--text-tertiary)',
          textAlign: 'right',
        }}
      >
        Live updates • Last received: {new Date().toLocaleTimeString()}
      </div>
    </div>
  );
}
