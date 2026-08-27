/**
 * Phase 7 Plan 02 Task 1: Analytics API client.
 *
 * Built on the same auth pattern as api.ts:
 * - Import API_BASE_URL
 * - Read sessionStorage 'openwa_api_key'
 * - Send X-API-Key header (NOT Authorization Bearer, NOT withCredentials cookies)
 *
 * The research doc's cookie approach is wrong for this codebase — api-key.guard.ts
 * extractApiKey reads only X-API-Key header or Authorization Bearer.
 */

import { API_BASE_URL } from './api';
import type {
  AnalyticsOverviewResponse,
  AnalyticsPerformanceResponse,
  AnalyticsCostResponse,
  AnalyticsConversationsResponse,
} from '../types/analytics';

interface AnalyticsQueryParams {
  startDate?: Date;
  endDate?: Date;
  sessionId?: string;
  granularity?: string;
  page?: number;
  limit?: number;
}

/**
 * Get overview KPIs and charts.
 */
async function getOverview(params: AnalyticsQueryParams): Promise<AnalyticsOverviewResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate.toISOString());
  if (params.endDate) query.set('endDate', params.endDate.toISOString());
  if (params.sessionId) query.set('sessionId', params.sessionId);

  const apiKey = sessionStorage.getItem('openwa_api_key');
  const response = await fetch(`${API_BASE_URL}/analytics/overview?${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Analytics API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get performance metrics (latency percentiles).
 */
async function getPerformance(params: AnalyticsQueryParams): Promise<AnalyticsPerformanceResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate.toISOString());
  if (params.endDate) query.set('endDate', params.endDate.toISOString());
  if (params.granularity) query.set('granularity', params.granularity);

  const apiKey = sessionStorage.getItem('openwa_api_key');
  const response = await fetch(`${API_BASE_URL}/analytics/performance?${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Analytics API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get cost breakdown.
 */
async function getCost(params: AnalyticsQueryParams): Promise<AnalyticsCostResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate.toISOString());
  if (params.endDate) query.set('endDate', params.endDate.toISOString());
  if (params.sessionId) query.set('sessionId', params.sessionId);

  const apiKey = sessionStorage.getItem('openwa_api_key');
  const response = await fetch(`${API_BASE_URL}/analytics/cost?${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Analytics API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get paginated conversations.
 */
async function getConversations(params: AnalyticsQueryParams): Promise<AnalyticsConversationsResponse> {
  const query = new URLSearchParams();
  if (params.startDate) query.set('startDate', params.startDate.toISOString());
  if (params.endDate) query.set('endDate', params.endDate.toISOString());
  if (params.sessionId) query.set('sessionId', params.sessionId);
  if (params.page !== undefined) query.set('page', String(params.page));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const apiKey = sessionStorage.getItem('openwa_api_key');
  const response = await fetch(`${API_BASE_URL}/analytics/conversations?${query}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Analytics API error: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get alert rules (stub for Plan 03).
 */
async function getAlertRules(): Promise<unknown[]> {
  return [];
}

/**
 * Create alert rule (stub for Plan 03).
 */
async function createAlertRule(_rule: unknown): Promise<unknown> {
  throw new Error('Not implemented');
}

/**
 * Delete alert rule (stub for Plan 03).
 */
async function deleteAlertRule(_id: string): Promise<void> {
  throw new Error('Not implemented');
}

/**
 * Export events as CSV or JSON (stub for Plan 03).
 */
async function exportEvents(_params: AnalyticsQueryParams, _format: 'csv' | 'json'): Promise<Blob> {
  throw new Error('Not implemented');
}

/**
 * Stream overview KPIs via fetch-based SSE.
 *
 * Native EventSource CANNOT set the X-API-Key header, so we use fetch()
 * to read the ReadableStream and parse SSE manually.
 *
 * @param onSnapshot - Callback invoked on each SSE data frame
 * @param onError - Callback invoked on stream error
 * @returns Abort function to close the stream
 */
function streamOverview(
  onSnapshot: (snapshot: AnalyticsOverviewResponse) => void,
  onError: (error: Error) => void,
): () => void {
  const apiKey = sessionStorage.getItem('openwa_api_key');
  const controller = new AbortController();

  fetch(`${API_BASE_URL}/analytics/stream`, {
    headers: {
      'Content-Type': 'text/event-stream',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    signal: controller.signal,
  })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body not readable');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onSnapshot(data);
            } catch (err) {
              console.warn('Failed to parse SSE data:', err);
            }
          }
        }
      }
    })
    .catch(error => {
      if (error.name !== 'AbortError') {
        onError(error);
      }
    });

  return () => controller.abort();
}

export const analyticsApi = {
  getOverview,
  getPerformance,
  getCost,
  getConversations,
  getAlertRules,
  createAlertRule,
  deleteAlertRule,
  exportEvents,
  streamOverview,
};
