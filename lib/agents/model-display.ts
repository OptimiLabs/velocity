import type { ConfigProvider } from "@/types/provider";

const CLAUDE_VERSION_BY_ALIAS: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

const INHERIT_VALUES = new Set([
  "",
  "__auto__",
  "auto",
  "inherit",
  "default",
  "provider-default",
  "provider_default",
]);

export interface AgentModelDisplay {
  isInherited: boolean;
  label: string;
  version: string | null;
}

export function getAgentModelDisplay(
  model: string | undefined,
  provider?: ConfigProvider,
): AgentModelDisplay {
  const trimmed = (model ?? "").trim();
  const normalized = trimmed.toLowerCase();

  if (!trimmed || INHERIT_VALUES.has(normalized)) {
    return { isInherited: true, label: "inherit", version: null };
  }

  const isClaudeAlias =
    provider === "claude" || normalized in CLAUDE_VERSION_BY_ALIAS;
  if (isClaudeAlias) {
    return {
      isInherited: false,
      label: normalized,
      version: CLAUDE_VERSION_BY_ALIAS[normalized] ?? null,
    };
  }

  return {
    isInherited: false,
    label: trimmed,
    version: trimmed,
  };
}

export function getAgentModelOptionLabel(
  value: string,
  provider?: ConfigProvider,
): string {
  const info = getAgentModelDisplay(value, provider);
  if (info.isInherited) return "Inherit (provider default)";
  if (info.version && info.version !== info.label) {
    return `${info.label} (${info.version})`;
  }
  return info.label;
}

export const INHERIT_MODEL_HELP =
  "Inherit means the agent does not pin a model and uses the provider/model defaults from Settings.";
