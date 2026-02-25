import { resolveModelPricing } from "./pricing";

export type PricingStatus = "priced" | "unpriced";
export type PricingUnpricedReason = "model_not_found" | "missing_rate_fields";

export interface CostCalculationResult {
  cost: number;
  status: PricingStatus;
  reason: PricingUnpricedReason | null;
  resolvedModelId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalBillableTokens: number;
}

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function zeroOrPositive(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function buildResult(
  base: Omit<CostCalculationResult, "cost" | "status" | "reason" | "resolvedModelId">,
  overrides?: Partial<
    Pick<CostCalculationResult, "cost" | "status" | "reason" | "resolvedModelId">
  >,
): CostCalculationResult {
  return {
    cost: 0,
    status: "priced",
    reason: null,
    resolvedModelId: null,
    ...base,
    ...overrides,
  };
}

export function calculateCostDetailed(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheWriteTokens: number = 0,
): CostCalculationResult {
  const safeInput = zeroOrPositive(inputTokens);
  const safeOutput = zeroOrPositive(outputTokens);
  const safeCacheRead = zeroOrPositive(cacheReadTokens);
  const safeCacheWrite = zeroOrPositive(cacheWriteTokens);
  const totalBillableTokens =
    safeInput + safeOutput + safeCacheRead + safeCacheWrite;

  const base = {
    inputTokens: safeInput,
    outputTokens: safeOutput,
    cacheReadTokens: safeCacheRead,
    cacheWriteTokens: safeCacheWrite,
    totalBillableTokens,
  };

  if (!modelId?.trim()) {
    return buildResult(base, {
      status: totalBillableTokens > 0 ? "unpriced" : "priced",
      reason: totalBillableTokens > 0 ? "model_not_found" : null,
    });
  }

  const resolved = resolveModelPricing(modelId);
  if (!resolved) {
    return buildResult(base, {
      status: totalBillableTokens > 0 ? "unpriced" : "priced",
      reason: totalBillableTokens > 0 ? "model_not_found" : null,
    });
  }

  const { input, output, cacheRead, cacheWrite } = resolved.pricing;
  if (
    !isValidRate(input) ||
    !isValidRate(output) ||
    !isValidRate(cacheRead) ||
    !isValidRate(cacheWrite)
  ) {
    return buildResult(base, {
      status: totalBillableTokens > 0 ? "unpriced" : "priced",
      reason: totalBillableTokens > 0 ? "missing_rate_fields" : null,
      resolvedModelId: resolved.modelId,
    });
  }

  const cost =
    (safeInput / 1_000_000) * input +
    (safeOutput / 1_000_000) * output +
    (safeCacheRead / 1_000_000) * cacheRead +
    (safeCacheWrite / 1_000_000) * cacheWrite;

  return buildResult(base, {
    cost,
    status: "priced",
    reason: null,
    resolvedModelId: resolved.modelId,
  });
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheWriteTokens: number = 0,
): number {
  return calculateCostDetailed(
    modelId,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  ).cost;
}

interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
}

/**
 * Calculate cost from stats-cache.json data.
 * Uses tokensByModel and modelUsage for proportional cost where possible.
 * Unknown/unpriced models are excluded instead of silently using a fallback rate.
 */
export function calculateCostFromStats(
  tokensByModel: Record<string, number>,
  modelUsage: Record<string, ModelUsage>,
): number {
  let totalCost = 0;

  for (const [model, tokens] of Object.entries(tokensByModel)) {
    const usage = modelUsage[model];
    if (usage && usage.costUSD > 0) {
      const totalModelTokens =
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadInputTokens +
        usage.cacheCreationInputTokens;
      if (totalModelTokens > 0) {
        totalCost += (tokens / totalModelTokens) * usage.costUSD;
      }
      continue;
    }

    // Fallback estimate only if the model has explicit pricing.
    const estimated = calculateCostDetailed(
      model,
      tokens * 0.3,
      tokens * 0.7,
      0,
      0,
    );
    if (estimated.status === "priced") {
      totalCost += estimated.cost;
    }
  }

  return totalCost;
}

export function getTotalTokens(s: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}): number {
  return (
    s.input_tokens +
    s.output_tokens +
    s.cache_read_tokens +
    s.cache_write_tokens
  );
}

export function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return String(tokens);
}

export function formatLatency(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

export type ModelTier =
  | "opus"
  | "sonnet"
  | "haiku"
  | "gpt"
  | "reasoning"
  | "codex"
  | "gemini"
  | "other";

export function getModelTier(model: string): ModelTier {
  if (model.includes("opus")) return "opus";
  if (model.includes("sonnet")) return "sonnet";
  if (model.includes("haiku")) return "haiku";
  if (model.startsWith("gemini-")) return "gemini";
  if (model.startsWith("codex-") || model.includes("codex")) return "codex";
  if (/^o\d+(-|$)/.test(model)) return "reasoning";
  if (model.startsWith("gpt-")) return "gpt";
  return "other";
}

export const TIER_LABELS: Record<ModelTier, string> = {
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  gpt: "GPT",
  reasoning: "Reasoning",
  codex: "Codex",
  gemini: "Gemini",
  other: "Other",
};

export const TIER_COLORS: Record<ModelTier, string> = {
  opus: "bg-chart-1",
  sonnet: "bg-chart-3",
  haiku: "bg-chart-5",
  gpt: "bg-chart-2",
  reasoning: "bg-chart-4",
  codex: "bg-chart-6",
  gemini: "bg-blue-500",
  other: "bg-muted-foreground",
};
