export interface RuntimeProviderCandidate {
  provider: string;
  providerSlug?: string | null;
  modelId?: string | null;
}

export type ApiProviderResolutionReason =
  | "model-provider"
  | "model-id"
  | "first-active"
  | "none";

export interface ApiProviderResolutionResult<
  T extends RuntimeProviderCandidate = RuntimeProviderCandidate,
> {
  candidate?: T;
  providerId?: string;
  inferredFromModel?: string;
  reason: ApiProviderResolutionReason;
}

const OPENAI_MODEL_PREFIXES = [
  "o1",
  "o3",
  "o4",
  "gpt-3",
  "gpt-4",
  "gpt-5",
  "codex-mini",
];

function normalizeModelId(value?: string | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function providerRuntimeId(candidate: RuntimeProviderCandidate): string {
  if (candidate.provider === "custom" && candidate.providerSlug) {
    return candidate.providerSlug;
  }
  return candidate.provider;
}

export function inferApiProviderFromModel(model?: string | null): string | undefined {
  const normalized = normalizeModelId(model);
  if (!normalized) return undefined;

  if (normalized.startsWith("claude-") || normalized.startsWith("anthropic/")) {
    return "anthropic";
  }
  if (normalized.startsWith("gemini-") || normalized.startsWith("google/")) {
    return "google";
  }
  if (
    normalized.startsWith("openai/") ||
    OPENAI_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    return "openai";
  }
  if (normalized.startsWith("openrouter/")) {
    return "openrouter";
  }
  if (
    normalized.startsWith("local/") ||
    normalized.startsWith("ollama/") ||
    normalized.startsWith("lmstudio/")
  ) {
    return "local";
  }

  return undefined;
}

export function resolveApiProviderCandidate<
  T extends RuntimeProviderCandidate,
>(
  candidates: readonly T[],
  model?: string | null,
): ApiProviderResolutionResult<T> {
  const normalizedModel = normalizeModelId(model);
  const inferredFromModel = inferApiProviderFromModel(normalizedModel);
  const byModelId = normalizedModel
    ? candidates.find(
        (candidate) => normalizeModelId(candidate.modelId) === normalizedModel,
      )
    : undefined;

  if (inferredFromModel) {
    const byProvider = candidates.find(
      (candidate) => providerRuntimeId(candidate) === inferredFromModel,
    );
    if (byProvider) {
      return {
        candidate: byProvider,
        providerId: providerRuntimeId(byProvider),
        inferredFromModel,
        reason: "model-provider",
      };
    }
    if (byModelId) {
      return {
        candidate: byModelId,
        providerId: providerRuntimeId(byModelId),
        inferredFromModel,
        reason: "model-id",
      };
    }
    return { inferredFromModel, reason: "none" };
  }

  if (byModelId) {
    return {
      candidate: byModelId,
      providerId: providerRuntimeId(byModelId),
      reason: "model-id",
    };
  }

  if (candidates.length > 0) {
    const first = candidates[0];
    return {
      candidate: first,
      providerId: providerRuntimeId(first),
      reason: "first-active",
    };
  }

  return { reason: "none" };
}
