/**
 * Phase 7 Plan 02 Task 2: Unit tests for Overview page formatters (TDD RED phase).
 *
 * Tests the exported formatKpi helper for percent/currency/integer formatting.
 * This is the automated gate for DASH-UI-01/06.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { formatKpi } from '../../utils/formatKpi.ts';

test('formatKpi formats percent values', () => {
  assert.strictEqual(formatKpi(0.732, 'percent'), '73.2%');
  assert.strictEqual(formatKpi(0.1, 'percent'), '10.0%');
  assert.strictEqual(formatKpi(1.0, 'percent'), '100.0%');
  assert.strictEqual(formatKpi(0, 'percent'), '0.0%');
});

test('formatKpi formats currency values', () => {
  assert.strictEqual(formatKpi(0.0234, 'currency'), '$0.0234');
  assert.strictEqual(formatKpi(1.5, 'currency'), '$1.5000');
  assert.strictEqual(formatKpi(0, 'currency'), '$0.0000');
});

test('formatKpi formats integer values', () => {
  assert.strictEqual(formatKpi(1234, 'integer'), '1,234');
  assert.strictEqual(formatKpi(0, 'integer'), '0');
  assert.strictEqual(formatKpi(1000000, 'integer'), '1,000,000');
});
