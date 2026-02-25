import {
  MODEL_PRICING_SNAPSHOT,
  PRICING_SNAPSHOT_VERSION,
  type ModelPricingSnapshotEntry,
} from "./snapshots";

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  contextWindow: number;
}

export interface ResolvedModelPricing {
  modelId: string;
  pricing: ModelPricing;
  snapshot: ModelPricingSnapshotEntry;
}

export const MODEL_PRICING: Record<string, ModelPricing> = Object.fromEntries(
  Object.entries(MODEL_PRICING_SNAPSHOT).map(([modelId, entry]) => [
    modelId,
    {
      input: entry.input,
      output: entry.output,
      cacheRead: entry.cacheRead,
      cacheWrite: entry.cacheWrite,
      cacheWrite1h: entry.cacheWrite1h,
      contextWindow: entry.contextWindow,
    },
  ]),
);

// Retained for UI-only fallback contexts where a default reference rate is useful.
// Cost math should use resolveModelPricing() and treat unknown models as unpriced.
export const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-5-20250929"];

const MODEL_KEYS_SORTED = Object.keys(MODEL_PRICING).sort(
  (a, b) => b.length - a.length,
);

function normalizeModelId(modelId?: string | null): string {
  return typeof modelId === "string" ? modelId.trim().toLowerCase() : "";
}

export function resolveModelPricing(
  modelId?: string | null,
): ResolvedModelPricing | null {
  const normalized = normalizeModelId(modelId);
  if (!normalized) return null;

  const exactSnapshot = MODEL_PRICING_SNAPSHOT[normalized];
  if (exactSnapshot) {
    return {
      modelId: normalized,
      pricing: MODEL_PRICING[normalized],
      snapshot: exactSnapshot,
    };
  }

  // Prefix match for dated variants, e.g. claude-opus-4-6-20260205.
  const prefixKey = MODEL_KEYS_SORTED.find((key) => normalized.startsWith(key));
  if (!prefixKey) return null;

  const snapshot = MODEL_PRICING_SNAPSHOT[prefixKey];
  if (!snapshot) return null;
  return {
    modelId: prefixKey,
    pricing: MODEL_PRICING[prefixKey],
    snapshot,
  };
}

export function isModelPriced(modelId?: string | null): boolean {
  return !!resolveModelPricing(modelId);
}

const DEFAULT_CONTEXT_WINDOW = 200_000;

export function getContextWindow(modelId?: string): number {
  const resolved = resolveModelPricing(modelId);
  return resolved?.pricing.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
}

export function getPricingSnapshotVersion(): string {
  return PRICING_SNAPSHOT_VERSION;
}
