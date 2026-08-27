import { percentile } from './percentile.util';

describe('percentile', () => {
  it('should return null for empty array', () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it('should return the only value for single-element array', () => {
    expect(percentile([42], 0.5)).toBe(42);
  });

  it('should calculate p50 (median) with interpolation', () => {
    const result = percentile([10, 20, 30, 40], 0.5);
    expect(result).toBe(25); // Linear interpolation between 20 and 30
  });

  it('should calculate p95', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const result = percentile(values, 0.95);
    // p95 at rank 9.5 (95% of 10 values) → interpolate between 95 and 100
    expect(result).toBeCloseTo(95, 0);
  });

  it('should calculate p99', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1 to 100
    const result = percentile(values, 0.99);
    // p99 at rank 99 → should be near 99
    expect(result).toBeCloseTo(99, 0);
  });

  it('should handle unsorted input (sorts internally)', () => {
    const result = percentile([40, 10, 30, 20], 0.5);
    expect(result).toBe(25);
  });

  it('should return minimum for p0', () => {
    const result = percentile([10, 20, 30, 40], 0.0);
    expect(result).toBe(10);
  });

  it('should return maximum for p100', () => {
    const result = percentile([10, 20, 30, 40], 1.0);
    expect(result).toBe(40);
  });

  it('should handle duplicate values', () => {
    const result = percentile([10, 10, 20, 20], 0.5);
    expect(result).toBe(15); // Interpolation between the two middle values
  });

  it('should handle floating point values', () => {
    const result = percentile([10.5, 20.7, 30.2, 40.8], 0.5);
    expect(result).toBeCloseTo(25.45, 2);
  });
});
