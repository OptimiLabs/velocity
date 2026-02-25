import type { Session } from "@/types/session";
import { DEFAULT_PRICING, resolveModelPricing } from "./pricing";

// Types
export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  total: number;
}

export interface CacheEfficiency {
  hitRate: number;
  savingsEstimate: number;
}

export interface ToolCostEstimate {
  name: string;
  count: number;
  totalTokens: number;
  estimatedCost: number;
  pctOfTotal: number;
}

export interface OptimizationHint {
  severity: "info" | "warning" | "tip";
  title: string;
  detail: string;
}

interface ParsedToolUsage {
  name: string;
  count: number;
  totalTokens: number;
}

interface ParsedModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  messageCount: number;
}

function parseJson<T>(json: string | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function computeCostBreakdown(session: Session): CostBreakdown {
  const parsed = parseJson<Record<string, ParsedModelUsage>>(
    session.model_usage,
    {},
  );
  const models = Object.entries(parsed);

  if (models.length === 0) {
    const inputCost = (session.input_tokens / 1_000_000) * DEFAULT_PRICING.input;
    const outputCost =
      (session.output_tokens / 1_000_000) * DEFAULT_PRICING.output;
    const cacheReadCost =
      (session.cache_read_tokens / 1_000_000) * DEFAULT_PRICING.cacheRead;
    const cacheWriteCost =
      (session.cache_write_tokens / 1_000_000) * DEFAULT_PRICING.cacheWrite;
    return {
      inputCost,
      outputCost,
      cacheReadCost,
      cacheWriteCost,
      total: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    };
  }

  let inputCost = 0,
    outputCost = 0,
    cacheReadCost = 0,
    cacheWriteCost = 0;
  for (const [modelId, usage] of models) {
    const resolved = resolveModelPricing(modelId);
    if (!resolved) continue;
    const pricing = resolved.pricing;
    inputCost += (usage.inputTokens / 1_000_000) * pricing.input;
    outputCost += (usage.outputTokens / 1_000_000) * pricing.output;
    cacheReadCost += (usage.cacheReadTokens / 1_000_000) * pricing.cacheRead;
    cacheWriteCost += (usage.cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  }
  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    total: inputCost + outputCost + cacheReadCost + cacheWriteCost,
  };
}

export function computeCacheEfficiency(session: Session): CacheEfficiency {
  const totalReadable = session.cache_read_tokens + session.input_tokens;
  const hitRate =
    totalReadable > 0 ? session.cache_read_tokens / totalReadable : 0;

  // Compute savings only from models with explicit pricing.
  const parsed = parseJson<Record<string, ParsedModelUsage>>(
    session.model_usage,
    {},
  );
  const models = Object.entries(parsed);

  let savingsEstimate = 0;
  if (models.length === 0) {
    savingsEstimate =
      (session.cache_read_tokens / 1_000_000) *
      (DEFAULT_PRICING.input - DEFAULT_PRICING.cacheRead);
  } else {
    for (const [modelId, usage] of models) {
      const resolved = resolveModelPricing(modelId);
      if (!resolved) continue;
      const pricing = resolved.pricing;
      savingsEstimate +=
        (usage.cacheReadTokens / 1_000_000) * (pricing.input - pricing.cacheRead);
    }
  }

  return { hitRate, savingsEstimate };
}

export function computeToolCostEstimates(session: Session): ToolCostEstimate[] {
  const tools = parseJson<Record<string, ParsedToolUsage>>(
    session.tool_usage,
    {},
  );
  const toolList = Object.values(tools);
  if (toolList.length === 0) return [];

  const totalTokens = toolList.reduce((sum, t) => sum + t.totalTokens, 0);
  const sessionCost = session.total_cost;

  return toolList
    .map((t) => ({
      name: t.name,
      count: t.count,
      totalTokens: t.totalTokens,
      estimatedCost:
        totalTokens > 0 ? (t.totalTokens / totalTokens) * sessionCost : 0,
      pctOfTotal: totalTokens > 0 ? (t.totalTokens / totalTokens) * 100 : 0,
    }))
    .sort((a, b) => b.estimatedCost - a.estimatedCost);
}

export function computeCostPerMessage(session: Session): number {
  return session.message_count > 0
    ? session.total_cost / session.message_count
    : 0;
}

export function generateOptimizationHints(
  session: Session,
): OptimizationHint[] {
  const hints: OptimizationHint[] = [];
  const { hitRate } = computeCacheEfficiency(session);
  const costPerMsg = computeCostPerMessage(session);
  const outputRatio =
    session.input_tokens > 0 ? session.output_tokens / session.input_tokens : 0;

  if (
    hitRate < 0.2 &&
    session.cache_read_tokens + session.input_tokens > 1000
  ) {
    hints.push({
      severity: "warning",
      title: "Low cache hit rate",
      detail: `Only ${(hitRate * 100).toFixed(0)}% of input served from cache. Prompt caching could reduce costs significantly.`,
    });
  }

  if (session.tool_call_count > 40) {
    hints.push({
      severity: "tip",
      title: "High tool usage",
      detail: `${session.tool_call_count} tool calls — consider subagent delegation for parallel work.`,
    });
  }

  if (costPerMsg > 0.5) {
    hints.push({
      severity: "warning",
      title: "Expensive messages",
      detail: `$${costPerMsg.toFixed(2)}/message — a smaller model may suffice for simpler turns.`,
    });
  }

  if (outputRatio > 2 && session.output_tokens > 10000) {
    hints.push({
      severity: "info",
      title: "Output-heavy session",
      detail: `Output tokens are ${outputRatio.toFixed(1)}x input — output costs 3-5x more than input.`,
    });
  }

  return hints;
}
