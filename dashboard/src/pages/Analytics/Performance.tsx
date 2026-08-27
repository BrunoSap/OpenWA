/**
 * Phase 7 Plan 03 Task 1: Performance page.
 *
 * Displays latency percentiles (p50/p95/p99) over time.
 */

import { useState } from 'react';
import { useAnalyticsPerformance } from '../../hooks/useAnalytics';
import { PercentileChart } from '../../components/analytics/PercentileChart';

export function AnalyticsPerformance() {
  const [dateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    endDate: new Date(),
  });

  const { data, isLoading, isFetching, isError, error } = useAnalyticsPerformance({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: 'hour',
  });

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Performance Metrics</h1>
        <p className="page-description">Latency percentiles (p50, p95, p99) over time</p>
      </div>

      {isFetching && !data && (
        <div className="loading-indicator">
          <p>Loading performance data...</p>
        </div>
      )}

      {isError && (
        <div className="error-message">
          <p>Error loading performance data: {(error as Error).message}</p>
        </div>
      )}

      {data && (
        <div className="analytics-content">
          <div className="chart-card">
            <h2>Latency Percentiles</h2>
            <PercentileChart data={data.latency} />
          </div>

          {isFetching && (
            <div className="updating-indicator">
              <small>Updating...</small>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
