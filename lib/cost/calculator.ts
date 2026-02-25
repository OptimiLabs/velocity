import { MODEL_PRICING, DEFAULT_PRICING } from "./pricing";

function resolveCodexPricing(modelId: string) {
  const normalized = modelId.toLowerCase();
  if (!normalized.includes("codex")) return null;

  if (normalized.includes("codex-mini")) {
    return (
      MODEL_PRICING["gpt-5.1-codex-mini"] ??
      MODEL_PRICING["codex-mini-latest"] ??
      MODEL_PRICING["gpt-5-codex"]
    );
  }

  if (normalized.includes("codex-max")) {
    return MODEL_PRICING["gpt-5.1-codex-max"] ?? MODEL_PRICING["gpt-5-codex"];
  }

  return MODEL_PRICING["gpt-5-codex"] ?? null;
}

function resolvePricing(modelId: string) {
  // Exact match first
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  // Prefix match for dated variants (e.g. "claude-opus-4-6-20260205")
  const key = Object.keys(MODEL_PRICING).find((k) => modelId.startsWith(k));
  if (key) return MODEL_PRICING[key];

  // Codex variants should never fall back to Claude defaults.
  const codexPricing = resolveCodexPricing(modelId);
  return codexPricing ?? DEFAULT_PRICING;
}

export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheWriteTokens: number = 0,
): number {
  const pricing = resolvePricing(modelId);
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead +
    (cacheWriteTokens / 1_000_000) * pricing.cacheWrite
  );
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
 * Uses the tokensByModel map and modelUsage for pricing info.
 */
export function calculateCostFromStats(
  tokensByModel: Record<string, number>,
  modelUsage: Record<string, ModelUsage>,
): number {
  let totalCost = 0;

  for (const [model, tokens] of Object.entries(tokensByModel)) {
    const usage = modelUsage[model];
    if (usage && usage.costUSD > 0) {
      // Use proportional cost: this day's tokens / total model tokens * total model cost
      const totalModelTokens =
        usage.inputTokens +
        usage.outputTokens +
        usage.cacheReadInputTokens +
        usage.cacheCreationInputTokens;
      if (totalModelTokens > 0) {
        totalCost += (tokens / totalModelTokens) * usage.costUSD;
      }
    } else {
      // Fallback: estimate from token count using pricing table
      const pricing = resolvePricing(model);
      // Rough estimate: assume 30% input, 70% output ratio
      totalCost +=
        ((tokens * 0.3) / 1_000_000) * pricing.input +
        ((tokens * 0.7) / 1_000_000) * pricing.output;
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

export type ModelTier = "opus" | "sonnet" | "haiku" | "gpt" | "reasoning" | "codex" | "gemini" | "other";

// Order matters: Claude checks (includes) must come before prefix checks so that
// e.g. "claude-opus-4-6" is classified correctly. The codex- prefix check must
// come before gpt- to handle codex-* models that would otherwise not match.
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
