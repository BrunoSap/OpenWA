/**
 * Phase 7 Plan 03 Task 1: Cost page.
 *
 * Displays total cost and breakdown by key.
 */

import { useState } from 'react';
import { useAnalyticsCost } from '../../hooks/useAnalytics';
import { CostBreakdown } from '../../components/analytics/CostBreakdown';
import { AnalyticsTabs } from '../../components/analytics/AnalyticsTabs';

export function AnalyticsCost() {
  const [dateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    endDate: new Date(),
  });

  const { data, isFetching, isError, error } = useAnalyticsCost({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  return (
    <div className="analytics-page">
      <AnalyticsTabs />

      <div className="page-header">
        <h1>Cost Analysis</h1>
        <p className="page-description">Total cost and breakdown by provider/model</p>
      </div>

      {isFetching && !data && (
        <div className="loading-indicator">
          <p>Loading cost data...</p>
        </div>
      )}

      {isError && (
        <div className="error-message">
          <p>Error loading cost data: {(error as Error).message}</p>
        </div>
      )}

      {data && (
        <div className="analytics-content">
          <div className="chart-card">
            <CostBreakdown total={data.total} breakdown={data.breakdown} />
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
