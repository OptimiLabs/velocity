const CHARS_PER_TOKEN = 4;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function estimateTokensFromText(value: string): number {
  if (!value) return 0;
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / CHARS_PER_TOKEN));
}

export function estimateTokensFromBytes(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.max(1, Math.ceil(bytes / CHARS_PER_TOKEN));
}

export function estimateTokensFromUnknown(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return estimateTokensFromText(value);
  try {
    return estimateTokensFromText(JSON.stringify(value));
  } catch {
    return 0;
  }
}
