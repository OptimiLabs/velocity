export const DEFAULT_MODEL = "claude-sonnet-4-6";

export const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-opus-4-5-20251101": "Opus 4.5",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-3-5-sonnet-20241022": "Sonnet 3.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
  "claude-3-5-haiku-20241022": "Haiku 3.5",
};

export const MODELS = Object.entries(MODEL_LABELS).map(([id, label]) => ({ id, label }));

export function formatPrice(n: number): string {
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}
