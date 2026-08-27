/**
 * Phase 7 Plan 02 Task 1: Unit test for SSE parser.
 *
 * Tests the parseSseSnapshot helper (pure function) to satisfy the Nyquist gate
 * without requiring a browser.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { parseSseSnapshot } from '../utils/parseSseSnapshot.ts';

test('parseSseSnapshot extracts JSON from SSE data frame', () => {
  const chunk = 'data: {"kpis":{"resolutionRate":0.85,"fallbackRate":0.15,"costPerConversation":0.02,"dau":120,"mau":450},"messagesChart":[],"latencyChart":[],"costChart":[]}\n\n';

  const result = parseSseSnapshot(chunk);

  assert.strictEqual(result !== null, true, 'Should parse valid SSE frame');
  assert.strictEqual(result?.kpis.resolutionRate, 0.85);
  assert.strictEqual(result?.kpis.dau, 120);
});

test('parseSseSnapshot returns null for heartbeat frame', () => {
  const chunk = ':heartbeat\n\n';

  const result = parseSseSnapshot(chunk);

  assert.strictEqual(result, null, 'Should return null for heartbeat');
});

test('parseSseSnapshot returns null for partial frame', () => {
  const chunk = 'data: {"kpis":{"resolution'; // incomplete JSON

  const result = parseSseSnapshot(chunk);

  assert.strictEqual(result, null, 'Should return null for partial/invalid JSON');
});

test('parseSseSnapshot handles multi-line buffer', () => {
  const chunk = 'event: message\ndata: {"kpis":{"resolutionRate":0.9,"fallbackRate":0.1,"costPerConversation":0.01,"dau":100,"mau":400},"messagesChart":[],"latencyChart":[],"costChart":[]}\n\n';

  const result = parseSseSnapshot(chunk);

  assert.strictEqual(result !== null, true, 'Should extract data line from multi-line frame');
  assert.strictEqual(result?.kpis.resolutionRate, 0.9);
});
