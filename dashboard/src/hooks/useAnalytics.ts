/**
 * Phase 7 Plan 03 Task 1: TanStack Query hooks for analytics endpoints.
 *
 * Mirrors queries.ts conventions: queryKey namespace, refetchInterval, staleTime.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '../services/analytics';
import type {
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

// Query key namespace
export const analyticsKeys = {
  all: ['analytics'] as const,
  performance: (params: AnalyticsQueryParams) => ['analytics', 'performance', params] as const,
  cost: (params: AnalyticsQueryParams) => ['analytics', 'cost', params] as const,
  conversations: (params: AnalyticsQueryParams) => ['analytics', 'conversations', params] as const,
  alertRules: ['analytics', 'alerts', 'rules'] as const,
};

/**
 * Fetch performance metrics (latency percentiles p50/p95/p99).
 */
export function useAnalyticsPerformance(params: AnalyticsQueryParams) {
  return useQuery<AnalyticsPerformanceResponse>({
    queryKey: analyticsKeys.performance(params),
    queryFn: () => analyticsApi.getPerformance(params),
    refetchInterval: 30_000, // 30s
    staleTime: 20_000, // 20s
  });
}

/**
 * Fetch cost breakdown (total + per-key breakdown).
 */
export function useAnalyticsCost(params: AnalyticsQueryParams) {
  return useQuery<AnalyticsCostResponse>({
    queryKey: analyticsKeys.cost(params),
    queryFn: () => analyticsApi.getCost(params),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

/**
 * Fetch paginated conversations.
 */
export function useAnalyticsConversations(params: AnalyticsQueryParams) {
  return useQuery<AnalyticsConversationsResponse>({
    queryKey: analyticsKeys.conversations(params),
    queryFn: () => analyticsApi.getConversations(params),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });
}

/**
 * Fetch alert rules (list).
 */
export function useAlertRules() {
  return useQuery({
    queryKey: analyticsKeys.alertRules,
    queryFn: analyticsApi.getAlertRules,
    staleTime: 30_000,
  });
}

/**
 * Create alert rule mutation.
 */
export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: analyticsApi.createAlertRule,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.alertRules });
    },
  });
}

/**
 * Delete alert rule mutation.
 */
export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => analyticsApi.deleteAlertRule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: analyticsKeys.alertRules });
    },
  });
}
