/**
 * Percentile Calculation Utility
 *
 * Implements linear interpolation for percentile calculation.
 * Used for computing p50/p95/p99 latency metrics.
 */

/**
 * Calculate a percentile value from an array of numbers using linear interpolation.
 *
 * @param values - Array of numeric values
 * @param q - Quantile (0.0 to 1.0, e.g., 0.5 for median, 0.95 for p95)
 * @returns The interpolated percentile value, or null if array is empty
 *
 * @example
 * percentile([10, 20, 30, 40], 0.5) // returns 25 (median between 20 and 30)
 * percentile([10, 20, 30, 40], 0.95) // returns 37 (near max)
 * percentile([], 0.5) // returns null
 */
export function percentile(values: number[], q: number): number | null {
  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return values[0];
  }

  // Sort ascending
  const sorted = [...values].sort((a, b) => a - b);

  // Calculate rank using linear interpolation formula
  // Rank = q * (n - 1) where n is array length
  const rank = q * (sorted.length - 1);

  // Get the lower and upper indices
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);

  // If rank is exactly an integer, return that element
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  // Linear interpolation between lower and upper values
  const lowerValue = sorted[lowerIndex];
  const upperValue = sorted[upperIndex];
  const fraction = rank - lowerIndex;

  return lowerValue + (upperValue - lowerValue) * fraction;
}
