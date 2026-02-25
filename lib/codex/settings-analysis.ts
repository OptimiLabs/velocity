import type { CodexConfig } from "./config";

const APPROVAL_POLICIES = ["untrusted", "on-request", "never"] as const;
const SANDBOX_MODES = [
  "read-only",
  "workspace-write",
  "danger-full-access",
] as const;
const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

const SUPPORTED_LEAF_PATHS = new Set([
  "model",
  "model_provider",
  "local_provider",
  "approval_policy",
  "approval_mode",
  "sandbox_mode",
  "web_search",
  "model_reasoning_effort",
  "personality",
  "sandbox.enable",
  "history.persistence",
  "history.max_entries",
  "features.multi_agent",
  "features.remote_models",
  "features.prevent_idle_sleep",
]);

export interface CodexSettingsMetadata {
  unsupportedKeys: string[];
}

export interface CodexConfigUiModel {
  model?: string;
  modelProvider?: string;
  localProvider?: "ollama" | "lmstudio";
  approvalPolicy?: (typeof APPROVAL_POLICIES)[number];
  sandboxEnabled?: boolean;
  sandboxMode?: (typeof SANDBOX_MODES)[number];
  webSearchEnabled?: boolean;
  reasoningEffort?: (typeof REASONING_EFFORTS)[number];
  historyEnabled?: boolean;
  historyMaxEntries?: number;
  personality?: string;
  featureMultiAgent?: boolean;
  featureRemoteModels?: boolean;
  featurePreventIdleSleep?: boolean;
}

export interface CodexSettingsEnvelope {
  provider: "codex";
  settings: CodexConfig;
  metadata: CodexSettingsMetadata;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isApprovalPolicy(value: unknown): value is CodexConfigUiModel["approvalPolicy"] {
  return typeof value === "string" && APPROVAL_POLICIES.includes(value as (typeof APPROVAL_POLICIES)[number]);
}

function isSandboxMode(value: unknown): value is CodexConfigUiModel["sandboxMode"] {
  return typeof value === "string" && SANDBOX_MODES.includes(value as (typeof SANDBOX_MODES)[number]);
}

function isReasoningEffort(
  value: unknown,
): value is CodexConfigUiModel["reasoningEffort"] {
  return (
    typeof value === "string" &&
    REASONING_EFFORTS.includes(value as (typeof REASONING_EFFORTS)[number])
  );
}

function collectLeafPaths(
  value: unknown,
  currentPath: string,
  out: string[],
): void {
  if (Array.isArray(value)) {
    if (currentPath) out.push(currentPath);
    return;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      if (currentPath) out.push(currentPath);
      return;
    }
    for (const [key, nestedValue] of entries) {
      const nextPath = currentPath ? `${currentPath}.${key}` : key;
      collectLeafPaths(nestedValue, nextPath, out);
    }
    return;
  }
  if (currentPath) out.push(currentPath);
}

function mapLegacyApprovalMode(
  value: CodexConfig["approval_mode"],
): CodexConfigUiModel["approvalPolicy"] | undefined {
  if (!value) return undefined;
  if (value === "suggest") return "on-request";
  if (value === "auto-edit") return "on-request";
  if (value === "full-auto") return "never";
  return undefined;
}

function deepMergeRecord(
  current: Record<string, unknown>,
  partial: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, partialValue] of Object.entries(partial)) {
    if (partialValue === undefined) continue;
    const currentValue = merged[key];
    if (isPlainObject(currentValue) && isPlainObject(partialValue)) {
      merged[key] = deepMergeRecord(currentValue, partialValue);
      continue;
    }
    merged[key] = partialValue;
  }
  return merged;
}

export function findUnsupportedCodexKeyPaths(
  config: Record<string, unknown>,
): string[] {
  const leafPaths: string[] = [];
  collectLeafPaths(config, "", leafPaths);

  const isSupportedPath = (path: string): boolean => {
    if (SUPPORTED_LEAF_PATHS.has(path)) return true;
    if (path.startsWith("projects.") && path.endsWith(".trust_level")) return true;
    return false;
  };

  return [...new Set(leafPaths)]
    .filter((path) => !isSupportedPath(path))
    .sort();
}

export function getCodexSettingsMetadata(
  config: Record<string, unknown>,
): CodexSettingsMetadata {
  return {
    unsupportedKeys: findUnsupportedCodexKeyPaths(config),
  };
}

export function deepMergeCodexSettings(
  current: CodexConfig,
  partial: Partial<CodexConfig>,
): CodexConfig {
  return deepMergeRecord(
    current as Record<string, unknown>,
    partial as Record<string, unknown>,
  ) as CodexConfig;
}

export function toCodexUiModel(config: CodexConfig): CodexConfigUiModel {
  const approvalPolicy = isApprovalPolicy(config.approval_policy)
    ? config.approval_policy
    : mapLegacyApprovalMode(config.approval_mode);

  const sandboxMode = isSandboxMode(config.sandbox_mode)
    ? config.sandbox_mode
    : undefined;

  const reasoningEffort = isReasoningEffort(config.model_reasoning_effort)
    ? config.model_reasoning_effort
    : undefined;

  const sandboxEnabled =
    typeof config.sandbox?.enable === "boolean" ? config.sandbox.enable : undefined;

  const webSearchEnabled =
    config.web_search === "enabled" || config.web_search === "cached";

  const historyEnabled = config.history?.persistence
    ? config.history.persistence !== "none"
    : undefined;
  const historyMaxEntries =
    typeof config.history?.max_entries === "number" &&
    Number.isFinite(config.history.max_entries) &&
    config.history.max_entries > 0
      ? Math.floor(config.history.max_entries)
      : undefined;

  return {
    model: typeof config.model === "string" ? config.model : undefined,
    modelProvider:
      typeof config.model_provider === "string" ? config.model_provider : undefined,
    localProvider:
      config.local_provider === "ollama" || config.local_provider === "lmstudio"
        ? config.local_provider
        : undefined,
    approvalPolicy,
    sandboxEnabled,
    sandboxMode,
    webSearchEnabled:
      config.web_search === undefined ? undefined : webSearchEnabled,
    reasoningEffort,
    historyEnabled,
    historyMaxEntries,
    personality:
      typeof config.personality === "string" ? config.personality : undefined,
    featureMultiAgent:
      typeof config.features?.multi_agent === "boolean"
        ? config.features.multi_agent
        : undefined,
    featureRemoteModels:
      typeof config.features?.remote_models === "boolean"
        ? config.features.remote_models
        : undefined,
    featurePreventIdleSleep:
      typeof config.features?.prevent_idle_sleep === "boolean"
        ? config.features.prevent_idle_sleep
        : undefined,
  };
}

export function fromCodexUiPatch(
  patch: Partial<CodexConfigUiModel>,
): Partial<CodexConfig> {
  const next: Partial<CodexConfig> = {};

  if ("model" in patch && typeof patch.model === "string") {
    next.model = patch.model;
  }

  if ("modelProvider" in patch && typeof patch.modelProvider === "string") {
    const trimmed = patch.modelProvider.trim();
    next.model_provider = trimmed || undefined;
  }

  if ("localProvider" in patch) {
    if (patch.localProvider === "ollama" || patch.localProvider === "lmstudio") {
      next.local_provider = patch.localProvider;
    } else {
      next.local_provider = undefined;
    }
  }

  if ("approvalPolicy" in patch && isApprovalPolicy(patch.approvalPolicy)) {
    next.approval_policy = patch.approvalPolicy;
  }

  if ("sandboxEnabled" in patch && typeof patch.sandboxEnabled === "boolean") {
    next.sandbox = { enable: patch.sandboxEnabled };
  }

  if ("sandboxMode" in patch && isSandboxMode(patch.sandboxMode)) {
    next.sandbox_mode = patch.sandboxMode;
  }

  if ("webSearchEnabled" in patch && typeof patch.webSearchEnabled === "boolean") {
    next.web_search = patch.webSearchEnabled ? "enabled" : "disabled";
  }

  if (
    "reasoningEffort" in patch &&
    isReasoningEffort(patch.reasoningEffort)
  ) {
    next.model_reasoning_effort = patch.reasoningEffort;
  }

  if ("historyEnabled" in patch && typeof patch.historyEnabled === "boolean") {
    next.history = {
      persistence: patch.historyEnabled ? "save-all" : "none",
    };
  }

  if ("historyMaxEntries" in patch) {
    if (
      typeof patch.historyMaxEntries === "number" &&
      Number.isFinite(patch.historyMaxEntries) &&
      patch.historyMaxEntries > 0
    ) {
      next.history = {
        ...(next.history || {}),
        max_entries: Math.floor(patch.historyMaxEntries),
      };
    }
  }

  if ("personality" in patch && typeof patch.personality === "string") {
    const trimmed = patch.personality.trim();
    next.personality = trimmed || undefined;
  }

  if ("featureMultiAgent" in patch && typeof patch.featureMultiAgent === "boolean") {
    next.features = {
      ...(next.features || {}),
      multi_agent: patch.featureMultiAgent,
    };
  }

  if (
    "featureRemoteModels" in patch &&
    typeof patch.featureRemoteModels === "boolean"
  ) {
    next.features = {
      ...(next.features || {}),
      remote_models: patch.featureRemoteModels,
    };
  }

  if (
    "featurePreventIdleSleep" in patch &&
    typeof patch.featurePreventIdleSleep === "boolean"
  ) {
    next.features = {
      ...(next.features || {}),
      prevent_idle_sleep: patch.featurePreventIdleSleep,
    };
  }

  return next;
}
