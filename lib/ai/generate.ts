import { claudeOneShot } from "@/lib/ai/claude";
import { readSettings } from "@/lib/claude-settings";
import { aiLog } from "@/lib/logger";
import { getAIProvider } from "@/lib/providers/ai-registry";

function normalizeProviderId(provider?: string): string {
  if (provider === "openrouter" || provider === "local") return "custom";
  return provider || "anthropic";
}

/**
 * Unified AI generation helper.
 * Looks up the provider via the AI registry (strategy pattern),
 * falls back to spawning the Claude CLI (no key required).
 */
export async function aiGenerate(
  prompt: string,
  opts?: {
    system?: string;
    cwd?: string;
    model?: string;
    timeoutMs?: number;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    thinkingBudget?: number;
    provider?: string;
  },
): Promise<string> {
  const SHORT_MODEL_MAP: Record<string, string> = {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  };

  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const maxTokens = opts?.maxTokens ?? 16_384;

  // Registry lookup — no if/else
  const requestedProviderId = opts?.provider;
  const providerId = normalizeProviderId(requestedProviderId);
  const adapter = getAIProvider(providerId);

  // Fail fast if an explicit provider was requested but doesn't exist
  if (requestedProviderId && !adapter) {
    throw new Error(`Unknown AI provider: ${requestedProviderId}`);
  }

  // Only apply settings model for the default (anthropic) path;
  // for explicit provider calls, let the adapter use its own default
  const rawModel = opts?.model
    ? opts.model
    : requestedProviderId
      ? undefined
      : readSettings().model || "claude-opus-4-6";
  const model = rawModel ? (SHORT_MODEL_MAP[rawModel] ?? rawModel) : undefined;

  if (adapter?.isAvailable()) {
    const effectiveModel = model ?? adapter.defaultModel;
    aiLog.info("using API path", {
      provider: requestedProviderId || providerId,
      adapter: providerId,
      model: effectiveModel,
      timeoutMs,
    });
    const start = Date.now();
    const response = await adapter.complete({
      prompt,
      system: opts?.system,
      model: model,
      maxTokens,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.topP !== undefined ? { topP: opts.topP } : {}),
      ...(opts?.topK !== undefined ? { topK: opts.topK } : {}),
      ...(opts?.thinkingBudget !== undefined
        ? { thinkingBudget: opts.thinkingBudget }
        : {}),
      timeoutMs,
    });
    aiLog.info("API response received", {
      elapsed: Date.now() - start,
      chars: response.content.length,
      model: effectiveModel,
    });
    return response.content;
  }

  // Fallback: CLI subprocess (no API key)
  const cliModel = model ?? "claude-opus-4-6";
  const cliPrompt = opts?.system
    ? `${opts.system}\n\n---\n\n${prompt}`
    : prompt;
  aiLog.info("using CLI path (no API key)", { model: cliModel, timeoutMs });
  const start = Date.now();
  try {
    const result = await claudeOneShot(cliPrompt, opts?.cwd, timeoutMs, cliModel);
    aiLog.info("CLI response received", {
      elapsed: Date.now() - start,
      chars: result.length,
      model: cliModel,
    });
    return result;
  } catch (err) {
    aiLog.error("CLI failed", err, { elapsed: Date.now() - start, model: cliModel });
    throw err;
  }
}
