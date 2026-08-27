/**
 * Phase 7 Plan 02 Task 2: KPI formatting utilities (standalone for testing).
 *
 * Extracted as pure functions so they can be unit-tested without React/JSX dependencies.
 */

/**
 * Format KPI values for display.
 */
export function formatKpi(value: number, type: 'percent' | 'currency' | 'integer'): string {
  if (type === 'percent') {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (type === 'currency') {
    return `$${value.toFixed(4)}`;
  }
  // integer
  return value.toLocaleString('en-US');
}
