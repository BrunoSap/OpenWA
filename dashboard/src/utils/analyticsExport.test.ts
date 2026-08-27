/**
 * Phase 7 Plan 03 Task 2 (TDD RED): Test analytics export utilities.
 *
 * Tests buildExportUrl query string construction.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportUrl } from './analyticsExport.ts';

test('buildExportUrl builds correct query string for csv', () => {
  const url = buildExportUrl({
    format: 'csv',
    startDate: new Date('2026-08-20T00:00:00Z'),
    endDate: new Date('2026-08-27T23:59:59Z'),
  });

  assert.match(url, /\/analytics\/export/);
  assert.match(url, /format=csv/);
  assert.match(url, /startDate=2026-08-20/);
  assert.match(url, /endDate=2026-08-27/);
});

test('buildExportUrl builds correct query string for json', () => {
  const url = buildExportUrl({
    format: 'json',
    startDate: new Date('2026-08-01T00:00:00Z'),
    endDate: new Date('2026-08-31T23:59:59Z'),
  });

  assert.match(url, /format=json/);
  assert.match(url, /startDate=2026-08-01/);
  assert.match(url, /endDate=2026-08-31/);
});

test('buildExportUrl includes sessionId if provided', () => {
  const url = buildExportUrl({
    format: 'csv',
    sessionId: 'test-session-123',
  });

  assert.match(url, /sessionId=test-session-123/);
});
