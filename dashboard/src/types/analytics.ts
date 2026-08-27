/**
 * Phase 7 Plan 02 Task 1: Analytics TypeScript types.
 *
 * Mirrors src/modules/analytics/dto/analytics-response.dto.ts exactly.
 * Timestamps are strings on the wire (JSON serializes Date → string).
 */

export interface AnalyticsOverviewKpis {
  resolutionRate: number;
  fallbackRate: number;
  costPerConversation: number;
  dau: number;
  mau: number;
}

export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
}

export interface AnalyticsOverviewResponse {
  kpis: AnalyticsOverviewKpis;
  messagesChart: TimeSeriesDataPoint[];
  latencyChart: TimeSeriesDataPoint[];
  costChart: TimeSeriesDataPoint[];
}

export interface PercentileDataPoint {
  timestamp: string;
  p50: number;
  p95: number;
  p99: number;
}

export interface AnalyticsPerformanceResponse {
  latency: PercentileDataPoint[];
}

export interface CostBreakdownItem {
  key: string;
  cost: number;
  tokens: number;
}

export interface AnalyticsCostResponse {
  total: number;
  breakdown: CostBreakdownItem[];
}

export interface ConversationSummary {
  conversation_id: string;
  session_id: string;
  message_count: number;
  cost: number;
  avg_latency: number;
  started_at: string;
  ended_at: string;
}

export interface AnalyticsConversationsResponse {
  data: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
}
