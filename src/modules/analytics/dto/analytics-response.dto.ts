/**
 * Phase 6 Plan 02b: Analytics response DTOs for KPI endpoints.
 *
 * Defines the shape of responses for /overview, /performance, /cost, /conversations.
 */

export interface AnalyticsOverviewKpis {
  resolutionRate: number;
  fallbackRate: number;
  costPerConversation: number;
  dau: number;
  mau: number;
}

export interface TimeSeriesDataPoint {
  timestamp: Date;
  value: number;
}

export interface AnalyticsOverviewResponse {
  kpis: AnalyticsOverviewKpis;
  messagesChart: TimeSeriesDataPoint[];
  latencyChart: TimeSeriesDataPoint[];
  costChart: TimeSeriesDataPoint[];
}

export interface PercentileDataPoint {
  timestamp: Date;
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
  started_at: Date;
  ended_at: Date;
}

export interface AnalyticsConversationsResponse {
  data: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
}
