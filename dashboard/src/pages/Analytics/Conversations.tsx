/**
 * Phase 7 Plan 03 Task 1: Conversations page.
 *
 * Displays paginated conversation summaries with page controls.
 */

import { useState } from 'react';
import { useAnalyticsConversations } from '../../hooks/useAnalytics';

export function AnalyticsConversations() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const [dateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
    endDate: new Date(),
  });

  const { data, isLoading, isFetching, isError, error } = useAnalyticsConversations({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    page,
    limit,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  const handlePrevPage = () => {
    if (page > 1) setPage(page - 1);
  };

  const handleNextPage = () => {
    if (page < totalPages) setPage(page + 1);
  };

  return (
    <div className="analytics-page">
      <div className="page-header">
        <h1>Conversations</h1>
        <p className="page-description">Detailed conversation summaries and metrics</p>
      </div>

      {isFetching && !data && (
        <div className="loading-indicator">
          <p>Loading conversations...</p>
        </div>
      )}

      {isError && (
        <div className="error-message">
          <p>Error loading conversations: {(error as Error).message}</p>
        </div>
      )}

      {data && (
        <div className="analytics-content">
          <div className="table-card">
            <table className="conversations-table">
              <thead>
                <tr>
                  <th>Conversation ID</th>
                  <th>Session</th>
                  <th>Messages</th>
                  <th>Cost</th>
                  <th>Avg Latency</th>
                  <th>Started</th>
                  <th>Ended</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map(conv => (
                  <tr key={conv.conversation_id}>
                    <td><code>{conv.conversation_id.slice(0, 8)}</code></td>
                    <td>{conv.session_id}</td>
                    <td>{conv.message_count}</td>
                    <td>${conv.cost.toFixed(4)}</td>
                    <td>{conv.avg_latency.toFixed(0)}ms</td>
                    <td>{new Date(conv.started_at).toLocaleString()}</td>
                    <td>{new Date(conv.ended_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination-controls">
              <button
                type="button"
                onClick={handlePrevPage}
                disabled={page === 1 || isFetching}
                className="btn-secondary"
              >
                Previous
              </button>
              <span className="page-info">
                Page {page} of {totalPages} ({data.total} total)
              </span>
              <button
                type="button"
                onClick={handleNextPage}
                disabled={page >= totalPages || isFetching}
                className="btn-secondary"
              >
                Next
              </button>
            </div>
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
