// Pricing per million tokens (as of Feb 2026)
// Cache write has two tiers: 5-minute (default) and 1-hour TTL
// cacheWrite = 5-minute rate (1.25x base input), used for cost calculations
// cacheWrite1h = 1-hour rate (2x base input), shown in pricing reference only
export const MODEL_PRICING: Record<
  string,
  {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cacheWrite1h: number;
    contextWindow: number;
  }
> = {
  "claude-opus-4-6": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    cacheWrite1h: 10.0,
    contextWindow: 1_000_000,
  },
  "claude-opus-4-5-20251101": {
    input: 5.0,
    output: 25.0,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    cacheWrite1h: 10.0,
    contextWindow: 200_000,
  },
  "claude-opus-4-1": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
    cacheWrite1h: 30.0,
    contextWindow: 200_000,
  },
  "claude-opus-4": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
    cacheWrite1h: 30.0,
    contextWindow: 200_000,
  },
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6.0,
    contextWindow: 1_000_000,
  },
  "claude-sonnet-4-5-20250929": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6.0,
    contextWindow: 200_000,
  },
  "claude-sonnet-4": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6.0,
    contextWindow: 200_000,
  },
  "claude-3-5-sonnet-20241022": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheWrite: 3.75,
    cacheWrite1h: 6.0,
    contextWindow: 200_000,
  },
  "claude-haiku-4-5-20251001": {
    input: 1.0,
    output: 5.0,
    cacheRead: 0.1,
    cacheWrite: 1.25,
    cacheWrite1h: 2.0,
    contextWindow: 200_000,
  },
  "claude-3-5-haiku-20241022": {
    input: 0.8,
    output: 4.0,
    cacheRead: 0.08,
    cacheWrite: 1.0,
    cacheWrite1h: 1.6,
    contextWindow: 200_000,
  },
  "claude-3-opus": {
    input: 15.0,
    output: 75.0,
    cacheRead: 1.5,
    cacheWrite: 18.75,
    cacheWrite1h: 30.0,
    contextWindow: 200_000,
  },
  "claude-3-haiku": {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.3,
    cacheWrite1h: 0.5,
    contextWindow: 200_000,
  },
  // OpenAI models (prices in $ per million tokens)
  // Most entries keep cacheRead/cacheWrite/cacheWrite1h at 0 because session logs
  // don't consistently expose cache token splits for all OpenAI model families.
  // Codex variants below include explicit cached-input rates from OpenAI pricing.
  "gpt-4o": {
    input: 2.5,
    output: 10.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 128_000,
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 128_000,
  },
  "o1": {
    input: 15.0,
    output: 60.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 200_000,
  },
  "o1-mini": {
    input: 3.0,
    output: 12.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 128_000,
  },
  "o3": {
    input: 10.0,
    output: 40.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 200_000,
  },
  "o3-mini": {
    input: 1.1,
    output: 4.4,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 200_000,
  },
  "o4-mini": {
    input: 1.1,
    output: 4.4,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 200_000,
  },
  "gpt-5-codex": {
    input: 1.25,
    output: 10.0,
    cacheRead: 0.125,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 400_000,
  },
  "gpt-5.1-codex": {
    input: 1.25,
    output: 10.0,
    cacheRead: 0.125,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 400_000,
  },
  "gpt-5.1-codex-max": {
    input: 1.25,
    output: 10.0,
    cacheRead: 0.125,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 400_000,
  },
  "gpt-5.1-codex-mini": {
    input: 0.25,
    output: 2.0,
    cacheRead: 0.025,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 400_000,
  },
  "gpt-5.2-codex": {
    input: 1.75,
    output: 14.0,
    cacheRead: 0.175,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 400_000,
  },
  "codex-mini-latest": {
    input: 1.5,
    output: 6.0,
    cacheRead: 0.375,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 200_000,
  },
  // Google Gemini models (prices in $ per million tokens)
  // Context caching rates set to 0 — Gemini CLI sessions don't report
  // cache tokens separately in their session files.
  "gemini-3-pro-preview": {
    input: 2.0,
    output: 12.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-3-flash-preview": {
    input: 0.5,
    output: 3.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-pro": {
    input: 1.25,
    output: 10.0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash": {
    input: 0.3,
    output: 2.5,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.5-flash-lite": {
    input: 0.1,
    output: 0.4,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.0-flash": {
    input: 0.1,
    output: 0.4,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
  "gemini-2.0-flash-lite": {
    input: 0.075,
    output: 0.3,
    cacheRead: 0,
    cacheWrite: 0,
    cacheWrite1h: 0,
    contextWindow: 1_000_000,
  },
};

// Default pricing for unknown models (use Sonnet pricing as fallback)
export const DEFAULT_PRICING = MODEL_PRICING["claude-sonnet-4-5-20250929"];


const DEFAULT_CONTEXT_WINDOW = 200_000;

export function getContextWindow(modelId?: string): number {
  if (!modelId) return DEFAULT_CONTEXT_WINDOW;
  // Exact match first
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId].contextWindow;
  // Prefix match for dated variants (e.g. "claude-opus-4-6-20260205")
  const key = Object.keys(MODEL_PRICING).find((k) => modelId.startsWith(k));
  return key ? MODEL_PRICING[key].contextWindow : DEFAULT_CONTEXT_WINDOW;
}
