import { describe, it, expect } from "vitest";
import {
  computeCostBreakdown,
  computeCacheEfficiency,
  computeToolCostEstimates,
  computeCostPerMessage,
  generateOptimizationHints,
} from "@/lib/cost/analysis";
import type { Session } from "@/types/session";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "test-session-1",
    project_id: "proj-1",
    slug: "test",
    first_prompt: "Hello",
    summary: null,
    message_count: 10,
    tool_call_count: 5,
    input_tokens: 50000,
    output_tokens: 10000,
    cache_read_tokens: 30000,
    cache_write_tokens: 5000,
    thinking_blocks: 0,
    total_cost: 0.5,
    git_branch: null,
    project_path: "/test",
    created_at: "2025-01-01T00:00:00Z",
    modified_at: "2025-01-01T01:00:00Z",
    jsonl_path: "/test/session.jsonl",
    tool_usage: "{}",
    model_usage: "{}",
    enriched_tools: "{}",
    session_role: "standalone",
    tags: "[]",
    parent_session_id: null,
    subagent_type: null,
    avg_latency_ms: 0,
    p50_latency_ms: 0,
    p95_latency_ms: 0,
    max_latency_ms: 0,
    session_duration_ms: 0,
    ...overrides,
  };
}

describe("Cost Analysis", () => {
  describe("computeCostBreakdown", () => {
    it("computes breakdown with default pricing", () => {
      const session = makeSession();
      const bd = computeCostBreakdown(session);

      expect(bd.inputCost).toBeGreaterThan(0);
      expect(bd.outputCost).toBeGreaterThan(0);
      expect(bd.cacheReadCost).toBeGreaterThan(0);
      expect(bd.total).toBeCloseTo(
        bd.inputCost + bd.outputCost + bd.cacheReadCost + bd.cacheWriteCost,
      );
    });

    it("uses per-model pricing from model_usage", () => {
      const session = makeSession({
        input_tokens: 60000,
        output_tokens: 15000,
        cache_read_tokens: 40000,
        cache_write_tokens: 5000,
        model_usage: JSON.stringify({
          "claude-sonnet-4-5-20250929": {
            cost: 0.3,
            inputTokens: 40000,
            outputTokens: 10000,
            cacheReadTokens: 30000,
            cacheWriteTokens: 3000,
            messageCount: 5,
          },
          "claude-haiku-4-5-20251001": {
            cost: 0.05,
            inputTokens: 20000,
            outputTokens: 5000,
            cacheReadTokens: 10000,
            cacheWriteTokens: 2000,
            messageCount: 3,
          },
        }),
      });
      const bd = computeCostBreakdown(session);
      expect(bd.total).toBeGreaterThan(0);
      // Sonnet input: 40000/1M * 3.0 = 0.12
      // Haiku input: 20000/1M * 1.0 = 0.02
      expect(bd.inputCost).toBeCloseTo(0.14);
    });

    it("handles zero tokens", () => {
      const session = makeSession({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      });
      const bd = computeCostBreakdown(session);
      expect(bd.total).toBe(0);
    });
  });

  describe("computeCacheEfficiency", () => {
    it("computes hit rate correctly", () => {
      const session = makeSession({
        input_tokens: 20000,
        cache_read_tokens: 80000,
      });
      const eff = computeCacheEfficiency(session);
      expect(eff.hitRate).toBeCloseTo(0.8); // 80000 / (80000 + 20000)
      expect(eff.savingsEstimate).toBeGreaterThan(0);
    });

    it("returns zero for no tokens", () => {
      const session = makeSession({ input_tokens: 0, cache_read_tokens: 0 });
      const eff = computeCacheEfficiency(session);
      expect(eff.hitRate).toBe(0);
      expect(eff.savingsEstimate).toBe(0);
    });
  });

  describe("computeToolCostEstimates", () => {
    it("returns empty for no tool usage", () => {
      const session = makeSession({ tool_usage: "{}" });
      expect(computeToolCostEstimates(session)).toEqual([]);
    });

    it("distributes cost proportionally by tokens", () => {
      const session = makeSession({
        total_cost: 1.0,
        tool_usage: JSON.stringify({
          Read: { name: "Read", count: 10, totalTokens: 5000 },
          Edit: { name: "Edit", count: 5, totalTokens: 15000 },
        }),
      });
      const estimates = computeToolCostEstimates(session);
      expect(estimates).toHaveLength(2);
      // Edit has 3x the tokens of Read, so should have 3x the cost
      const edit = estimates.find((t) => t.name === "Edit")!;
      const read = estimates.find((t) => t.name === "Read")!;
      expect(edit.estimatedCost).toBeCloseTo(0.75); // 15000/20000 * $1
      expect(read.estimatedCost).toBeCloseTo(0.25);
      expect(edit.pctOfTotal).toBeCloseTo(75);
      expect(read.pctOfTotal).toBeCloseTo(25);
    });

    it("sorts by estimated cost descending", () => {
      const session = makeSession({
        total_cost: 1.0,
        tool_usage: JSON.stringify({
          Bash: { name: "Bash", count: 3, totalTokens: 1000 },
          Write: { name: "Write", count: 1, totalTokens: 9000 },
        }),
      });
      const estimates = computeToolCostEstimates(session);
      expect(estimates[0].name).toBe("Write");
    });
  });

  describe("computeCostPerMessage", () => {
    it("divides cost by message count", () => {
      const session = makeSession({ total_cost: 1.0, message_count: 10 });
      expect(computeCostPerMessage(session)).toBeCloseTo(0.1);
    });

    it("returns 0 for no messages", () => {
      const session = makeSession({ total_cost: 1.0, message_count: 0 });
      expect(computeCostPerMessage(session)).toBe(0);
    });
  });

  describe("generateOptimizationHints", () => {
    it("warns about low cache hit rate", () => {
      const session = makeSession({
        input_tokens: 10000,
        cache_read_tokens: 100,
      });
      const hints = generateOptimizationHints(session);
      expect(hints.some((h) => h.title === "Low cache hit rate")).toBe(true);
    });

    it("tips about high tool usage", () => {
      const session = makeSession({ tool_call_count: 50 });
      const hints = generateOptimizationHints(session);
      expect(hints.some((h) => h.title === "High tool usage")).toBe(true);
    });

    it("warns about expensive messages", () => {
      const session = makeSession({ total_cost: 10.0, message_count: 10 });
      const hints = generateOptimizationHints(session);
      expect(hints.some((h) => h.title === "Expensive messages")).toBe(true);
    });

    it("notes output-heavy sessions", () => {
      const session = makeSession({ input_tokens: 5000, output_tokens: 20000 });
      const hints = generateOptimizationHints(session);
      expect(hints.some((h) => h.title === "Output-heavy session")).toBe(true);
    });

    it("returns no hints for well-optimized sessions", () => {
      const session = makeSession({
        input_tokens: 50000,
        output_tokens: 10000,
        cache_read_tokens: 40000,
        tool_call_count: 5,
        total_cost: 0.1,
        message_count: 10,
      });
      const hints = generateOptimizationHints(session);
      expect(hints.length).toBe(0);
    });
  });
});
