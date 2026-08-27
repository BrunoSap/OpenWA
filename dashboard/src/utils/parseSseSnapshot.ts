/**
 * Phase 7 Plan 02 Task 1: SSE parser utility (standalone for testing).
 *
 * Extracted as a pure function so it can be unit-tested without browser dependencies.
 */

import type { AnalyticsOverviewResponse } from '../types/analytics';

/**
 * Parse SSE data line into AnalyticsOverviewResponse.
 * Returns null for partial/heartbeat frames.
 */
export function parseSseSnapshot(chunk: string): AnalyticsOverviewResponse | null {
  // SSE format: "data: {...}\n\n"
  const match = chunk.match(/^data: (.+)$/m);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
