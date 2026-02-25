import { describe, expect, it } from "vitest";
import { MODEL_LABELS, MODELS, formatPrice, DEFAULT_MODEL } from "@/lib/console/models";
import { MODEL_PRICING } from "@/lib/cost/pricing";

describe("lib/console/models", () => {
  it("MODEL_LABELS keys are a subset of MODEL_PRICING keys", () => {
    const pricingKeys = Object.keys(MODEL_PRICING);
    for (const key of Object.keys(MODEL_LABELS)) {
      expect(pricingKeys).toContain(key);
    }
  });

  it("MODELS length matches MODEL_LABELS length", () => {
    expect(MODELS.length).toBe(Object.keys(MODEL_LABELS).length);
  });

  it("MODELS entries have correct id and label", () => {
    for (const model of MODELS) {
      expect(MODEL_LABELS[model.id]).toBe(model.label);
    }
  });

  it("DEFAULT_MODEL is a valid model key", () => {
    expect(MODEL_LABELS[DEFAULT_MODEL]).toBeDefined();
  });

  it("formatPrice renders integers without decimals", () => {
    expect(formatPrice(3)).toBe("$3");
    expect(formatPrice(15)).toBe("$15");
  });

  it("formatPrice renders decimals with two places", () => {
    expect(formatPrice(3.14)).toBe("$3.14");
    expect(formatPrice(0.5)).toBe("$0.50");
  });
});
