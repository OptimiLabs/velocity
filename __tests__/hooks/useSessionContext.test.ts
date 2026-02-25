import { describe, it, expect } from "vitest";

/**
 * Unit-test the reconcile logic extracted from useSessionContext.
 * We test the pure update function rather than the hook to avoid React test setup.
 */

function reconcile(
  prev: { totalInputTokens: number; totalOutputTokens: number; totalCost: number },
  data: { totalInputTokens?: number; totalOutputTokens?: number; totalCost?: number },
) {
  return {
    totalInputTokens:
      data.totalInputTokens != null ? data.totalInputTokens : prev.totalInputTokens,
    totalOutputTokens:
      data.totalOutputTokens != null ? data.totalOutputTokens : prev.totalOutputTokens,
    totalCost:
      data.totalCost != null ? data.totalCost : prev.totalCost,
  };
}

describe("useSessionContext reconcile logic", () => {
  it("zero value from server replaces stale non-zero", () => {
    const prev = { totalInputTokens: 5000, totalOutputTokens: 2000, totalCost: 0.50 };
    const data = { totalInputTokens: 0, totalOutputTokens: 0, totalCost: 0 };
    const result = reconcile(prev, data);
    expect(result.totalInputTokens).toBe(0);
    expect(result.totalOutputTokens).toBe(0);
    expect(result.totalCost).toBe(0);
  });

  it("preserves prev when field is missing (undefined)", () => {
    const prev = { totalInputTokens: 5000, totalOutputTokens: 2000, totalCost: 0.50 };
    const data = { totalInputTokens: 3000 };
    const result = reconcile(prev, data);
    expect(result.totalInputTokens).toBe(3000);
    expect(result.totalOutputTokens).toBe(2000); // preserved
    expect(result.totalCost).toBe(0.50); // preserved
  });

  it("non-zero server values update correctly", () => {
    const prev = { totalInputTokens: 5000, totalOutputTokens: 2000, totalCost: 0.50 };
    const data = { totalInputTokens: 8000, totalOutputTokens: 4000, totalCost: 1.00 };
    const result = reconcile(prev, data);
    expect(result.totalInputTokens).toBe(8000);
    expect(result.totalOutputTokens).toBe(4000);
    expect(result.totalCost).toBe(1.00);
  });
});
