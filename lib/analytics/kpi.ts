/**
 * Compute percentage change between two values.
 * Returns 100 when previous is 0 and current > 0 (new activity).
 * Returns 0 when both are 0.
 */
export function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
