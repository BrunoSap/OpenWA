/**
 * Phase 7 Plan 03 Task 1 (TDD RED): Test percentile data transformation.
 *
 * Tests the pure helper that maps PercentileDataPoint[] to Recharts data format.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preparePercentileData } from '../../utils/preparePercentileData.ts';
import type { PercentileDataPoint } from '../../types/analytics.ts';

test('preparePercentileData formats timestamp and passes through percentiles', () => {
  const input: PercentileDataPoint[] = [
    { timestamp: '2026-08-27T10:00:00Z', p50: 120, p95: 450, p99: 890 },
    { timestamp: '2026-08-27T11:00:00Z', p50: 135, p95: 520, p99: 1050 },
  ];

  const result = preparePercentileData(input);

  assert.equal(result.length, 2);
  assert.equal(result[0].label, '10:00');
  assert.equal(result[0].p50, 120);
  assert.equal(result[0].p95, 450);
  assert.equal(result[0].p99, 890);
  assert.equal(result[1].label, '11:00');
  assert.equal(result[1].p50, 135);
});

test('preparePercentileData handles empty array', () => {
  const result = preparePercentileData([]);
  assert.equal(result.length, 0);
});

test('preparePercentileData handles date buckets (day granularity)', () => {
  const input: PercentileDataPoint[] = [
    { timestamp: '2026-08-25T00:00:00Z', p50: 100, p95: 400, p99: 800 },
  ];

  const result = preparePercentileData(input);
  assert.equal(result[0].label, '08-25');
});
