import { resolveApiProviderCandidate } from "@/lib/ai/provider-resolution";
import { readAppSettings } from "@/lib/app-settings";
import { readSettings as readClaudeSettings } from "@/lib/claude-settings";
import { readCodexSettings } from "@/lib/codex/settings";
import {
  listActiveAIProviderConfigs,
} from "@/lib/db/instruction-files";

export type GenerationRuntimeMode = "claude-cli" | "codex-cli" | "api";
export type ThinkingLevel = "low" | "medium" | "high";

export interface ResolvedGenerationRuntime {
  mode: GenerationRuntimeMode;
  model?: string;
  thinkingLevel: ThinkingLevel;
  claudeCliEnabled: boolean;
  codexCliEnabled: boolean;
  apiProvider?: string;
  apiDefaults?: {
    modelId?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    thinkingBudget?: number;
    maxTokens?: number;
  };
}

function normalizeRuntimeMode(value: unknown): GenerationRuntimeMode {
  if (value === "codex-cli") return "codex-cli";
  if (value === "api") return "api";
  return "claude-cli";
}

function normalizeThinkingLevel(value: unknown): ThinkingLevel {
  if (value === "xhigh") return "high";
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "medium";
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function defaultApiThinkingBudget(level: ThinkingLevel): number {
  if (level === "low") return 1024;
  if (level === "high") return 8192;
  return 4096;
}

export function resolveGenerationRuntimeDefaults(): ResolvedGenerationRuntime {
  const app = readAppSettings();
  const claude = readClaudeSettings();
  const codex = readCodexSettings();

  const mode = normalizeRuntimeMode(app.generationRuntime);
  const runtimeDefaults = app.generationDefaults?.[mode];
  const thinkingLevel = normalizeThinkingLevel(
    runtimeDefaults?.thinkingLevel ??
      app.generationThinkingLevel ??
      claude.effortLevel ??
      codex.model_reasoning_effort,
  );
  const claudeCliEnabled = claude.claudeCliEnabled !== false;
  const codexCliEnabled = app.codexCliEnabled !== false;
  const configuredModel = normalizeModel(
    runtimeDefaults?.model ?? app.generationModel,
  );

  if (mode === "claude-cli") {
    return {
      mode,
      model: configuredModel ?? normalizeModel(claude.model),
      thinkingLevel,
      claudeCliEnabled,
      codexCliEnabled,
    };
  }

  if (mode === "codex-cli") {
    return {
      mode,
      model: configuredModel ?? normalizeModel(codex.model),
      thinkingLevel,
      claudeCliEnabled,
      codexCliEnabled,
    };
  }

  const activeProviders = listActiveAIProviderConfigs();
  const resolved = resolveApiProviderCandidate(activeProviders, configuredModel);
  const activeProvider = resolved.candidate;

  return {
    mode,
    model: configuredModel ?? normalizeModel(activeProvider?.modelId),
    thinkingLevel,
    claudeCliEnabled,
    codexCliEnabled,
    apiProvider: resolved.providerId,
    apiDefaults: {
      modelId: normalizeModel(activeProvider?.modelId),
      temperature: activeProvider?.temperature ?? undefined,
      topP: activeProvider?.topP ?? undefined,
      topK: activeProvider?.topK ?? undefined,
      thinkingBudget:
        activeProvider?.thinkingBudget ?? defaultApiThinkingBudget(thinkingLevel),
      maxTokens: activeProvider?.maxTokens ?? undefined,
    },
  };
}
