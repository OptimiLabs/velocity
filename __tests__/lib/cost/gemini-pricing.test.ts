import { describe, it, expect } from "vitest";
import { MODEL_PRICING } from "@/lib/cost/pricing";
import { calculateCost, getModelTier } from "@/lib/cost/calculator";

const GEMINI_MODELS = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
];

describe("Gemini model pricing entries", () => {
  it.each(GEMINI_MODELS)("%s has a pricing entry", (model) => {
    expect(MODEL_PRICING[model]).toBeDefined();
    expect(MODEL_PRICING[model].input).toBeGreaterThan(0);
    expect(MODEL_PRICING[model].output).toBeGreaterThan(0);
    expect(MODEL_PRICING[model].contextWindow).toBe(1_000_000);
  });
});

describe("calculateCost for Gemini models", () => {
  it("calculates cost for gemini-2.5-pro", () => {
    const cost = calculateCost("gemini-2.5-pro", 1_000_000, 1_000_000, 0, 0);
    // $1.25 input + $10.00 output = $11.25
    expect(cost).toBe(11.25);
  });

  it("calculates cost for gemini-2.5-flash", () => {
    const cost = calculateCost("gemini-2.5-flash", 1_000_000, 1_000_000, 0, 0);
    // $0.30 input + $2.50 output = $2.80
    expect(cost).toBe(2.8);
  });

  it("gemini-2.5-pro costs more than gemini-2.5-flash for same tokens", () => {
    const proCost = calculateCost("gemini-2.5-pro", 1_000_000, 1_000_000, 0, 0);
    const flashCost = calculateCost(
      "gemini-2.5-flash",
      1_000_000,
      1_000_000,
      0,
      0,
    );
    expect(proCost).toBeGreaterThan(flashCost);
  });
});

describe("getModelTier for Gemini models", () => {
  it.each(GEMINI_MODELS)("returns 'gemini' for %s", (model) => {
    expect(getModelTier(model)).toBe("gemini");
  });

  it("does not return 'gemini' for claude models", () => {
    expect(getModelTier("claude-sonnet-4-5-20250929")).not.toBe("gemini");
    expect(getModelTier("claude-opus-4-6")).not.toBe("gemini");
  });

  it("does not return 'gemini' for gpt models", () => {
    expect(getModelTier("gpt-4o")).not.toBe("gemini");
    expect(getModelTier("gpt-4o-mini")).not.toBe("gemini");
  });
});
