/**
 * Phase 7 Plan 03 Task 1: Percentile data transformation utility.
 *
 * Pure helper extracted for node --test compatibility (node cannot import .tsx).
 */

import type { PercentileDataPoint } from '../types/analytics.ts';

export interface ChartDataPoint {
  label: string;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Transform PercentileDataPoint[] to Recharts format.
 * Extracts time portion (HH:MM) for hour buckets or date (MM-DD) for day buckets.
 */
export function preparePercentileData(data: PercentileDataPoint[]): ChartDataPoint[] {
  return data.map(point => {
    // '2026-08-27T10:00:00Z' → '10:00' (hour) or '08-27' (day)
    const timestamp = point.timestamp;
    const label = timestamp.includes('T') && timestamp.slice(11, 13) !== '00'
      ? timestamp.slice(11, 16) // Hour bucket: '10:00'
      : timestamp.slice(5, 10); // Day bucket: '08-27'

    return {
      label,
      p50: point.p50,
      p95: point.p95,
      p99: point.p99,
    };
  });
}
