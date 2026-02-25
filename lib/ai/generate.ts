import {
  resolveGenerationRuntimeDefaults,
  type ThinkingLevel,
} from "@/lib/ai/runtime-defaults";
import { aiLog } from "@/lib/logger";
import { getAIProvider } from "@/lib/providers/ai-registry";

async function runClaudeOneShot(
  prompt: string,
  cwd: string | undefined,
  timeoutMs: number,
  model: string | undefined,
  effort?: "low" | "medium" | "high",
): Promise<string> {
  const { claudeOneShot } = await import("@/lib/ai/claude");
  return claudeOneShot(prompt, cwd, timeoutMs, model, effort);
}

async function runCodexOneShot(
  prompt: string,
  cwd: string | undefined,
  timeoutMs: number,
  opts?: {
    model?: string;
    effort?: "low" | "medium" | "high";
  },
): Promise<string> {
  const { codexOneShot } = await import("@/lib/ai/codex");
  return codexOneShot(prompt, cwd, timeoutMs, opts);
}

function normalizeProviderId(provider?: string): string {
  if (provider === "openrouter" || provider === "local") return "custom";
  return provider || "anthropic";
}

function normalizeModelAlias(value?: string): string | undefined {
  if (!value) return undefined;
  const SHORT_MODEL_MAP: Record<string, string> = {
    opus: "claude-opus-4-6",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5-20251001",
  };
  return SHORT_MODEL_MAP[value] ?? value;
}

function defaultThinkingBudget(level: ThinkingLevel): number {
  if (level === "low") return 1024;
  if (level === "high") return 8192;
  return 4096;
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
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const maxTokens = opts?.maxTokens ?? 16_384;
  const requestedProvider = opts?.provider;
  const cliPrompt = opts?.system ? `${opts.system}\n\n---\n\n${prompt}` : prompt;
  const requestedModel = normalizeModelAlias(opts?.model);

  // Explicit provider path (legacy behavior)
  if (requestedProvider) {
    if (requestedProvider === "claude-cli") {
      const runtime = resolveGenerationRuntimeDefaults();
      const model = requestedModel ?? runtime.model ?? "claude-opus-4-6";
      return runClaudeOneShot(
        cliPrompt,
        opts?.cwd,
        timeoutMs,
        model,
        runtime.thinkingLevel,
      );
    }
    if (requestedProvider === "codex-cli") {
      const runtime = resolveGenerationRuntimeDefaults();
      const model = requestedModel ?? runtime.model;
      return runCodexOneShot(cliPrompt, opts?.cwd, timeoutMs, {
        model,
        effort: runtime.thinkingLevel,
      });
    }

    const providerId = normalizeProviderId(requestedProvider);
    const adapter = getAIProvider(providerId);

    if (!adapter) {
      throw new Error(`Unknown AI provider: ${requestedProvider}`);
    }

    if (adapter.isAvailable()) {
      const effectiveModel = requestedModel ?? adapter.defaultModel;
      aiLog.info("using API path", {
        provider: requestedProvider,
        adapter: providerId,
        model: effectiveModel,
        timeoutMs,
      });
      const start = Date.now();
      const response = await adapter.complete({
        prompt,
        system: opts?.system,
        model: requestedModel,
        maxTokens,
        ...(opts?.temperature !== undefined
          ? { temperature: opts.temperature }
          : {}),
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

    throw new Error(
      `Provider "${requestedProvider}" is not available. Configure an active API key or choose a CLI runtime.`,
    );
  }

  const runtime = resolveGenerationRuntimeDefaults();

  if (runtime.mode === "api") {
    if (!runtime.apiProvider) {
      throw new Error(
        runtime.model
          ? `API mode is enabled but no active API provider matches configured model "${runtime.model}". Configure a matching API key or choose a different default model in Settings.`
          : "API mode is enabled but no active API provider is configured.",
      );
    }
    const providerId = normalizeProviderId(runtime.apiProvider);
    const adapter = getAIProvider(providerId);
    if (!adapter) {
      throw new Error(`Unknown AI provider: ${runtime.apiProvider}`);
    }
    if (!adapter.isAvailable()) {
      throw new Error(
        `API provider "${runtime.apiProvider}" is not available. Configure an active API key.`,
      );
    }

    const model =
      requestedModel ??
      normalizeModelAlias(runtime.model) ??
      normalizeModelAlias(runtime.apiDefaults?.modelId) ??
      adapter.defaultModel;
    const thinkingBudget =
      opts?.thinkingBudget ??
      runtime.apiDefaults?.thinkingBudget ??
      defaultThinkingBudget(runtime.thinkingLevel);
    const temperature = opts?.temperature ?? runtime.apiDefaults?.temperature;
    const topP = opts?.topP ?? runtime.apiDefaults?.topP;
    const topK = opts?.topK ?? runtime.apiDefaults?.topK;

    aiLog.info("using Core API runtime path", {
      provider: runtime.apiProvider,
      adapter: providerId,
      model,
      timeoutMs,
    });
    const start = Date.now();
    const response = await adapter.complete({
      prompt,
      system: opts?.system,
      model,
      maxTokens: opts?.maxTokens ?? runtime.apiDefaults?.maxTokens ?? maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
      ...(topP !== undefined ? { topP } : {}),
      ...(topK !== undefined ? { topK } : {}),
      ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
      timeoutMs,
    });
    aiLog.info("API response received", {
      elapsed: Date.now() - start,
      chars: response.content.length,
      model,
    });
    return response.content;
  }

  if (runtime.mode === "codex-cli") {
    if (!runtime.codexCliEnabled) {
      throw new Error(
        "Codex CLI is disabled in Core Settings. Enable it to run generation with Codex CLI.",
      );
    }
    const model = requestedModel ?? runtime.model;
    aiLog.info("using Core Codex CLI runtime path", {
      model,
      thinking: runtime.thinkingLevel,
      timeoutMs,
    });
    const start = Date.now();
    try {
      const result = await runCodexOneShot(cliPrompt, opts?.cwd, timeoutMs, {
        model,
        effort: runtime.thinkingLevel,
      });
      const text = typeof result === "string" ? result : "";
      aiLog.info("Codex CLI response received", {
        elapsed: Date.now() - start,
        chars: text.length,
        model: model ?? "default",
      });
      return text;
    } catch (err) {
      aiLog.error("Codex CLI failed", err, {
        elapsed: Date.now() - start,
        model: model ?? "default",
      });
      throw err;
    }
  }

  if (!runtime.claudeCliEnabled) {
    throw new Error(
      "Claude CLI is disabled in Settings. Enable it or switch Core generation runtime.",
    );
  }
  const cliModel = requestedModel ?? runtime.model ?? "claude-opus-4-6";
  aiLog.info("using Core Claude CLI runtime path", {
    model: cliModel,
    thinking: runtime.thinkingLevel,
    timeoutMs,
  });
  const start = Date.now();
  try {
    const result = await runClaudeOneShot(
      cliPrompt,
      opts?.cwd,
      timeoutMs,
      cliModel,
      runtime.thinkingLevel,
    );
    const text = typeof result === "string" ? result : "";
    aiLog.info("Claude CLI response received", {
      elapsed: Date.now() - start,
      chars: text.length,
      model: cliModel,
    });
    return text;
  } catch (err) {
    aiLog.error("Claude CLI failed", err, {
      elapsed: Date.now() - start,
      model: cliModel,
    });
    throw err;
  }
}
