/**
 * Phase 7 Plan 02 Task 1: Real-time analytics stream hook.
 *
 * Uses fetch-based SSE (so X-API-Key header CAN be sent, unlike EventSource).
 * Falls back to TanStack Query polling when stream fails.
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../services/analytics';
import type { AnalyticsOverviewResponse } from '../types/analytics';

type StreamStatus = 'connecting' | 'live' | 'polling' | 'error';

interface UseAnalyticsStreamResult {
  snapshot: AnalyticsOverviewResponse | null;
  status: StreamStatus;
}

/**
 * Hook for real-time analytics stream with polling fallback.
 *
 * On mount: opens fetch-based SSE stream for GET /analytics/stream.
 * On stream error: falls back to TanStack Query polling of getOverview at 10s interval.
 * On unmount: aborts stream.
 */
export function useAnalyticsStream(): UseAnalyticsStreamResult {
  const [snapshot, setSnapshot] = useState<AnalyticsOverviewResponse | null>(null);
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const [streamFailed, setStreamFailed] = useState(false);

  // Polling fallback: only enabled when stream fails
  const { data: polledData } = useQuery({
    queryKey: ['analytics', 'overview', 'polling'],
    queryFn: () =>
      analyticsApi.getOverview({
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24h ago
        endDate: new Date(),
      }),
    enabled: streamFailed,
    refetchInterval: 10_000, // 10s polling
    staleTime: 5_000,
  });

  // Update snapshot when polling data arrives
  useEffect(() => {
    if (streamFailed && polledData) {
      setSnapshot(polledData);
      setStatus('polling');
    }
  }, [streamFailed, polledData]);

  // SSE stream setup
  useEffect(() => {
    if (streamFailed) return; // Don't retry stream after fallback

    setStatus('connecting');

    const abort = analyticsApi.streamOverview(
      data => {
        setSnapshot(data);
        setStatus('live');
      },
      error => {
        console.error('Analytics stream error:', error);
        setStatus('error');
        setStreamFailed(true); // Trigger polling fallback
      },
    );

    return () => {
      abort();
    };
  }, [streamFailed]);

  // Memoize result to prevent parent re-renders from reopening stream
  return useMemo(
    () => ({
      snapshot,
      status,
    }),
    [snapshot, status],
  );
}
