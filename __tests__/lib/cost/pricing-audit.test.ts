import { describe, expect, it } from "vitest";
import { calculateCost } from "@/lib/cost/calculator";
import { auditSessionPricing } from "@/lib/cost/pricing-audit";

describe("auditSessionPricing", () => {
  it("recomputes priced sessions and tracks unknown/unpriced models", () => {
    const exactCost = calculateCost("gpt-5.1-codex-mini", 1_000, 500, 100, 0);

    const audit = auditSessionPricing([
      {
        id: "s-1",
        provider: "codex",
        billing_plan: null,
        effort_mode: "xhigh",
        total_cost: exactCost,
        model_usage: JSON.stringify({
          "gpt-5.1-codex-mini": {
            inputTokens: 1_000,
            outputTokens: 500,
            cacheReadTokens: 100,
            cacheWriteTokens: 0,
          },
        }),
      },
      {
        id: "s-2",
        provider: "codex",
        billing_plan: "max20x",
        effort_mode: "medium",
        total_cost: 0.5,
        model_usage: JSON.stringify({
          "gpt-5.9-codex": {
            inputTokens: 2_000,
            outputTokens: 1_000,
            cacheReadTokens: 50,
            cacheWriteTokens: 0,
          },
        }),
        unpriced_tokens: 3_050,
        unpriced_messages: 1,
      },
    ]);

    expect(audit.totalSessions).toBe(2);
    expect(audit.comparedSessions).toBe(2);
    expect(audit.estimatedPlanSessions).toBe(1);
    expect(audit.mismatchSessions).toBe(0);
    expect(audit.unpricedSessions).toBe(1);
    expect(audit.unpricedTokens).toBeGreaterThan(3_000);
    expect(audit.byEffortMode.xhigh.sessions).toBe(1);
    expect(audit.byEffortMode.medium.sessions).toBe(1);
    expect(audit.unknownModels[0]?.model).toBe("gpt-5.9-codex");
    expect(audit.unknownModels[0]?.provider).toBe("codex");
  });

  it("skips sessions with missing model_usage", () => {
    const audit = auditSessionPricing([
      {
        id: "s-3",
        provider: "claude",
        billing_plan: null,
        effort_mode: null,
        total_cost: 1.2,
        model_usage: null,
      },
    ]);

    expect(audit.totalSessions).toBe(1);
    expect(audit.comparedSessions).toBe(0);
    expect(audit.skippedSessions).toBe(1);
    expect(audit.topMismatches).toHaveLength(0);
    expect(audit.unknownModels).toHaveLength(0);
  });
});
