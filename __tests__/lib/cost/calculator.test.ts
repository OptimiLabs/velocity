import { describe, it, expect } from "vitest";
import {
  calculateCost,
  calculateCostFromStats,
  formatCost,
  formatTokens,
  getModelTier,
} from "@/lib/cost/calculator";
import { MODEL_PRICING, DEFAULT_PRICING } from "@/lib/cost/pricing";

describe("calculateCost", () => {
  it("calculates cost for a known model (sonnet 4.5)", () => {
    const model = "claude-sonnet-4-5-20250929";
    const pricing = MODEL_PRICING[model];
    // 1000 input, 500 output, 200 cache read, 100 cache write
    const cost = calculateCost(model, 1000, 500, 200, 100);
    const expected =
      (1000 / 1_000_000) * pricing.input +
      (500 / 1_000_000) * pricing.output +
      (200 / 1_000_000) * pricing.cacheRead +
      (100 / 1_000_000) * pricing.cacheWrite;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("calculates cost for opus 4.6", () => {
    const model = "claude-opus-4-6";
    const pricing = MODEL_PRICING[model];
    const cost = calculateCost(model, 10000, 5000, 2000, 1000);
    const expected =
      (10000 / 1_000_000) * pricing.input +
      (5000 / 1_000_000) * pricing.output +
      (2000 / 1_000_000) * pricing.cacheRead +
      (1000 / 1_000_000) * pricing.cacheWrite;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("falls back to DEFAULT_PRICING for unknown model", () => {
    const cost = calculateCost("unknown-model-xyz", 1000, 500, 0, 0);
    const expected =
      (1000 / 1_000_000) * DEFAULT_PRICING.input +
      (500 / 1_000_000) * DEFAULT_PRICING.output;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("returns 0 for zero tokens", () => {
    expect(calculateCost("claude-sonnet-4-5-20250929", 0, 0, 0, 0)).toBe(0);
  });

  it("handles default cache params (0)", () => {
    const cost = calculateCost("claude-sonnet-4-5-20250929", 1000, 500);
    const pricing = MODEL_PRICING["claude-sonnet-4-5-20250929"];
    const expected =
      (1000 / 1_000_000) * pricing.input + (500 / 1_000_000) * pricing.output;
    expect(cost).toBeCloseTo(expected, 10);
  });
});

describe("calculateCostFromStats", () => {
  it("uses proportional cost when modelUsage has costUSD", () => {
    const tokensByModel = { "claude-sonnet-4-5-20250929": 5000 };
    const modelUsage = {
      "claude-sonnet-4-5-20250929": {
        inputTokens: 8000,
        outputTokens: 2000,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 1.0,
      },
    };
    const cost = calculateCostFromStats(tokensByModel, modelUsage);
    // 5000 / (8000 + 2000 + 0) * 1.00 = 0.50
    expect(cost).toBeCloseTo(0.5, 10);
  });

  it("falls back to 30/70 ratio estimate for unknown model", () => {
    const tokensByModel = { "unknown-model": 1_000_000 };
    const modelUsage = {};
    const cost = calculateCostFromStats(tokensByModel, modelUsage);
    // Fallback: 30% input, 70% output with DEFAULT_PRICING
    const expected =
      ((1_000_000 * 0.3) / 1_000_000) * DEFAULT_PRICING.input +
      ((1_000_000 * 0.7) / 1_000_000) * DEFAULT_PRICING.output;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("falls back when costUSD is 0", () => {
    const tokensByModel = { "claude-sonnet-4-5-20250929": 1_000_000 };
    const modelUsage = {
      "claude-sonnet-4-5-20250929": {
        inputTokens: 500_000,
        outputTokens: 500_000,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0,
      },
    };
    const cost = calculateCostFromStats(tokensByModel, modelUsage);
    const pricing = MODEL_PRICING["claude-sonnet-4-5-20250929"];
    const expected =
      ((1_000_000 * 0.3) / 1_000_000) * pricing.input +
      ((1_000_000 * 0.7) / 1_000_000) * pricing.output;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("sums across multiple models", () => {
    const tokensByModel = {
      "claude-sonnet-4-5-20250929": 5000,
      "claude-opus-4-6": 3000,
    };
    const modelUsage = {
      "claude-sonnet-4-5-20250929": {
        inputTokens: 10000,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 2.0,
      },
      "claude-opus-4-6": {
        inputTokens: 6000,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 3.0,
      },
    };
    const cost = calculateCostFromStats(tokensByModel, modelUsage);
    // (5000/10000)*2 + (3000/6000)*3 = 1.0 + 1.5 = 2.5
    expect(cost).toBeCloseTo(2.5, 10);
  });

  it("handles empty input", () => {
    expect(calculateCostFromStats({}, {})).toBe(0);
  });
});

describe("formatCost", () => {
  it("formats small costs with 4 decimals", () => {
    expect(formatCost(0.001)).toBe("$0.0010");
  });
  it("formats medium costs with 2 decimals", () => {
    expect(formatCost(0.5)).toBe("$0.50");
  });
  it("formats large costs with 2 decimals", () => {
    expect(formatCost(12.5)).toBe("$12.50");
  });
});

describe("OpenAI model pricing", () => {
  it("should have pricing for gpt-4o", () => {
    const pricing = MODEL_PRICING["gpt-4o"];
    expect(pricing).toBeDefined();
    expect(pricing.input).toBe(2.5);
    expect(pricing.output).toBe(10.0);
  });

  it("should have pricing for o4-mini", () => {
    expect(MODEL_PRICING["o4-mini"]).toBeDefined();
    expect(MODEL_PRICING["o4-mini"].input).toBe(1.1);
  });

  it("should have pricing for codex-mini-latest", () => {
    const pricing = MODEL_PRICING["codex-mini-latest"];
    expect(pricing).toBeDefined();
    expect(pricing.input).toBe(1.5);
    expect(pricing.output).toBe(6.0);
    expect(pricing.cacheRead).toBe(0.375);
  });

  it("should have pricing for gpt-5 codex models", () => {
    const base = MODEL_PRICING["gpt-5-codex"];
    const next = MODEL_PRICING["gpt-5.2-codex"];
    const mini = MODEL_PRICING["gpt-5.1-codex-mini"];

    expect(base).toBeDefined();
    expect(base.input).toBe(1.25);
    expect(base.output).toBe(10.0);
    expect(base.cacheRead).toBe(0.125);

    expect(next).toBeDefined();
    expect(next.input).toBe(1.75);
    expect(next.output).toBe(14.0);
    expect(next.cacheRead).toBe(0.175);

    expect(mini).toBeDefined();
    expect(mini.input).toBe(0.25);
    expect(mini.output).toBe(2.0);
    expect(mini.cacheRead).toBe(0.025);
  });

  it("should calculate correct cost for gpt-4o (not Sonnet fallback)", () => {
    const cost = calculateCost("gpt-4o", 1_000_000, 1_000_000, 0, 0);
    // gpt-4o: $2.50 + $10.00 = $12.50
    expect(cost).toBe(12.5);
    // Should NOT be Sonnet's $3 + $15 = $18
    expect(cost).not.toBe(18.0);
  });

  it("should calculate correct cost for o4-mini", () => {
    const cost = calculateCost("o4-mini", 1_000_000, 1_000_000, 0, 0);
    expect(cost).toBe(5.5); // $1.10 + $4.40
  });

  it("should not fall back to Claude pricing for unknown codex variants", () => {
    const cost = calculateCost("gpt-5.3-codex", 1_000_000, 1_000_000, 0, 0);
    const codexExpected = 1.25 + 10.0;
    const sonnetFallback = DEFAULT_PRICING.input + DEFAULT_PRICING.output;
    expect(cost).toBe(codexExpected);
    expect(cost).not.toBe(sonnetFallback);
  });

  it("should have zero cache pricing for OpenAI models", () => {
    const pricing = MODEL_PRICING["gpt-4o"];
    expect(pricing.cacheRead).toBe(0);
    expect(pricing.cacheWrite).toBe(0);
  });
});

describe("formatTokens", () => {
  it("formats millions", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });
  it("formats thousands", () => {
    expect(formatTokens(2_500)).toBe("2.5K");
  });
  it("formats small numbers as-is", () => {
    expect(formatTokens(42)).toBe("42");
  });
});

describe("getModelTier for OpenAI models", () => {
  it("classifies gpt-4o as gpt tier", () => {
    expect(getModelTier("gpt-4o")).toBe("gpt");
  });

  it("classifies gpt-4o-mini as gpt tier", () => {
    expect(getModelTier("gpt-4o-mini")).toBe("gpt");
  });

  // Codex check intentionally wins when model IDs include "codex"
  it("classifies gpt-5-codex as codex tier", () => {
    expect(getModelTier("gpt-5-codex")).toBe("codex");
  });

  it("classifies o1 as reasoning tier", () => {
    expect(getModelTier("o1")).toBe("reasoning");
  });

  it("classifies o3-mini as reasoning tier", () => {
    expect(getModelTier("o3-mini")).toBe("reasoning");
  });

  it("classifies o4-mini as reasoning tier", () => {
    expect(getModelTier("o4-mini")).toBe("reasoning");
  });

  it("classifies o5-mini as reasoning tier", () => {
    expect(getModelTier("o5-mini")).toBe("reasoning");
  });

  it("classifies unknown model as other tier", () => {
    expect(getModelTier("unknown-model-xyz")).toBe("other");
  });

  it("classifies codex-mini-latest as codex tier", () => {
    expect(getModelTier("codex-mini-latest")).toBe("codex");
  });

  // Ensure Claude models still work
  it("still classifies claude-opus-4-6 as opus", () => {
    expect(getModelTier("claude-opus-4-6")).toBe("opus");
  });

  it("still classifies claude-sonnet-4-5 as sonnet", () => {
    expect(getModelTier("claude-sonnet-4-5-20250929")).toBe("sonnet");
  });
});
