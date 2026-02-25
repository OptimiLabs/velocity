export type PricingProvider = "anthropic" | "openai" | "google";

export interface ModelPricingSnapshotEntry {
  modelId: string;
  provider: PricingProvider;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h: number;
  contextWindow: number;
  effectiveDate: string;
  sourceUrl: string;
  snapshotVersion: string;
}

export const PRICING_SNAPSHOT_VERSION = "2026-02-26";
export const PRICING_EFFECTIVE_DATE = "2026-02-26";

const SOURCE_URLS: Record<PricingProvider, string> = {
  anthropic: "https://docs.anthropic.com/en/docs/about-claude/pricing",
  openai: "https://openai.com/api/pricing",
  google: "https://ai.google.dev/pricing",
};

function makeEntry(
  modelId: string,
  provider: PricingProvider,
  rates: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h: number;
    contextWindow: number;
  },
): ModelPricingSnapshotEntry {
  return {
    modelId,
    provider,
    input: rates.input,
    output: rates.output,
    cacheRead: rates.cacheRead,
    cacheWrite: rates.cacheWrite,
    cacheWrite1h: rates.cacheWrite1h,
    contextWindow: rates.contextWindow,
    effectiveDate: PRICING_EFFECTIVE_DATE,
    sourceUrl: SOURCE_URLS[provider],
    snapshotVersion: PRICING_SNAPSHOT_VERSION,
  };
}

export const MODEL_PRICING_SNAPSHOT: Record<string, ModelPricingSnapshotEntry> =
  {
    "claude-opus-4-6": makeEntry("claude-opus-4-6", "anthropic", {
      input: 5.0,
      output: 25.0,
      cacheRead: 0.5,
      cacheWrite: 6.25,
      cacheWrite1h: 10.0,
      contextWindow: 1_000_000,
    }),
    "claude-opus-4-5-20251101": makeEntry(
      "claude-opus-4-5-20251101",
      "anthropic",
      {
        input: 5.0,
        output: 25.0,
        cacheRead: 0.5,
        cacheWrite: 6.25,
        cacheWrite1h: 10.0,
        contextWindow: 200_000,
      },
    ),
    "claude-opus-4-1": makeEntry("claude-opus-4-1", "anthropic", {
      input: 15.0,
      output: 75.0,
      cacheRead: 1.5,
      cacheWrite: 18.75,
      cacheWrite1h: 30.0,
      contextWindow: 200_000,
    }),
    "claude-opus-4": makeEntry("claude-opus-4", "anthropic", {
      input: 15.0,
      output: 75.0,
      cacheRead: 1.5,
      cacheWrite: 18.75,
      cacheWrite1h: 30.0,
      contextWindow: 200_000,
    }),
    "claude-sonnet-4-6": makeEntry("claude-sonnet-4-6", "anthropic", {
      input: 3.0,
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
      cacheWrite1h: 6.0,
      contextWindow: 1_000_000,
    }),
    "claude-sonnet-4-5-20250929": makeEntry(
      "claude-sonnet-4-5-20250929",
      "anthropic",
      {
        input: 3.0,
        output: 15.0,
        cacheRead: 0.3,
        cacheWrite: 3.75,
        cacheWrite1h: 6.0,
        contextWindow: 200_000,
      },
    ),
    "claude-sonnet-4": makeEntry("claude-sonnet-4", "anthropic", {
      input: 3.0,
      output: 15.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
      cacheWrite1h: 6.0,
      contextWindow: 200_000,
    }),
    "claude-3-5-sonnet-20241022": makeEntry(
      "claude-3-5-sonnet-20241022",
      "anthropic",
      {
        input: 3.0,
        output: 15.0,
        cacheRead: 0.3,
        cacheWrite: 3.75,
        cacheWrite1h: 6.0,
        contextWindow: 200_000,
      },
    ),
    "claude-haiku-4-5-20251001": makeEntry(
      "claude-haiku-4-5-20251001",
      "anthropic",
      {
        input: 1.0,
        output: 5.0,
        cacheRead: 0.1,
        cacheWrite: 1.25,
        cacheWrite1h: 2.0,
        contextWindow: 200_000,
      },
    ),
    "claude-3-5-haiku-20241022": makeEntry(
      "claude-3-5-haiku-20241022",
      "anthropic",
      {
        input: 0.8,
        output: 4.0,
        cacheRead: 0.08,
        cacheWrite: 1.0,
        cacheWrite1h: 1.6,
        contextWindow: 200_000,
      },
    ),
    "claude-3-opus": makeEntry("claude-3-opus", "anthropic", {
      input: 15.0,
      output: 75.0,
      cacheRead: 1.5,
      cacheWrite: 18.75,
      cacheWrite1h: 30.0,
      contextWindow: 200_000,
    }),
    "claude-3-haiku": makeEntry("claude-3-haiku", "anthropic", {
      input: 0.25,
      output: 1.25,
      cacheRead: 0.03,
      cacheWrite: 0.3,
      cacheWrite1h: 0.5,
      contextWindow: 200_000,
    }),
    "gpt-4o": makeEntry("gpt-4o", "openai", {
      input: 2.5,
      output: 10.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 128_000,
    }),
    "gpt-4o-mini": makeEntry("gpt-4o-mini", "openai", {
      input: 0.15,
      output: 0.6,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 128_000,
    }),
    o1: makeEntry("o1", "openai", {
      input: 15.0,
      output: 60.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 200_000,
    }),
    "o1-mini": makeEntry("o1-mini", "openai", {
      input: 3.0,
      output: 12.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 128_000,
    }),
    o3: makeEntry("o3", "openai", {
      input: 10.0,
      output: 40.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 200_000,
    }),
    "o3-mini": makeEntry("o3-mini", "openai", {
      input: 1.1,
      output: 4.4,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 200_000,
    }),
    "o4-mini": makeEntry("o4-mini", "openai", {
      input: 1.1,
      output: 4.4,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 200_000,
    }),
    "gpt-5-codex": makeEntry("gpt-5-codex", "openai", {
      input: 1.25,
      output: 10.0,
      cacheRead: 0.125,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 400_000,
    }),
    "gpt-5.1-codex": makeEntry("gpt-5.1-codex", "openai", {
      input: 1.25,
      output: 10.0,
      cacheRead: 0.125,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 400_000,
    }),
    "gpt-5.1-codex-max": makeEntry("gpt-5.1-codex-max", "openai", {
      input: 1.25,
      output: 10.0,
      cacheRead: 0.125,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 400_000,
    }),
    "gpt-5.1-codex-mini": makeEntry("gpt-5.1-codex-mini", "openai", {
      input: 0.25,
      output: 2.0,
      cacheRead: 0.025,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 400_000,
    }),
    "gpt-5.2-codex": makeEntry("gpt-5.2-codex", "openai", {
      input: 1.75,
      output: 14.0,
      cacheRead: 0.175,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 400_000,
    }),
    "gpt-5.3-codex": makeEntry("gpt-5.3-codex", "openai", {
      input: 1.75,
      output: 14.0,
      cacheRead: 0.175,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 400_000,
    }),
    "codex-mini-latest": makeEntry("codex-mini-latest", "openai", {
      input: 1.5,
      output: 6.0,
      cacheRead: 0.375,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 200_000,
    }),
    "gemini-3-pro-preview": makeEntry("gemini-3-pro-preview", "google", {
      input: 2.0,
      output: 12.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
    "gemini-3-flash-preview": makeEntry("gemini-3-flash-preview", "google", {
      input: 0.5,
      output: 3.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
    "gemini-2.5-pro": makeEntry("gemini-2.5-pro", "google", {
      input: 1.25,
      output: 10.0,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
    "gemini-2.5-flash": makeEntry("gemini-2.5-flash", "google", {
      input: 0.3,
      output: 2.5,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
    "gemini-2.5-flash-lite": makeEntry("gemini-2.5-flash-lite", "google", {
      input: 0.1,
      output: 0.4,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
    "gemini-2.0-flash": makeEntry("gemini-2.0-flash", "google", {
      input: 0.1,
      output: 0.4,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
    "gemini-2.0-flash-lite": makeEntry("gemini-2.0-flash-lite", "google", {
      input: 0.075,
      output: 0.3,
      cacheRead: 0,
      cacheWrite: 0,
      cacheWrite1h: 0,
      contextWindow: 1_000_000,
    }),
  };
