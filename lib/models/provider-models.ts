import type { ConfigProvider } from "@/types/provider";

export interface ProviderModelOption {
  id: string;
  label: string;
}

export const CLAUDE_AGENT_MODEL_OPTIONS: readonly ProviderModelOption[] = [
  { id: "opus", label: "opus" },
  { id: "sonnet", label: "sonnet" },
  { id: "haiku", label: "haiku" },
];

export const CLAUDE_CLI_MODEL_OPTIONS: readonly ProviderModelOption[] = [
  { id: "claude-opus-4-6", label: "claude-opus-4-6" },
  { id: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { id: "claude-haiku-4-5-20251001", label: "claude-haiku-4-5-20251001" },
];

// Curated Codex/OpenAI CLI models for Codex runtime and Codex provider agents.
export const CODEX_MODEL_OPTIONS: readonly ProviderModelOption[] = [
  { id: "gpt-5.3-codex", label: "gpt-5.3-codex" },
  { id: "gpt-5.2-codex", label: "gpt-5.2-codex" },
  { id: "gpt-5.1-codex", label: "gpt-5.1-codex" },
  { id: "gpt-5.1-codex-max", label: "gpt-5.1-codex-max" },
  { id: "gpt-5.1-codex-mini", label: "gpt-5.1-codex-mini" },
  { id: "gpt-5-codex", label: "gpt-5-codex" },
  { id: "codex-mini-latest", label: "codex-mini-latest" },
  { id: "o4-mini", label: "o4-mini" },
  { id: "o3", label: "o3" },
  { id: "o3-mini", label: "o3-mini" },
];

export const OPENAI_API_MODEL_OPTIONS: readonly ProviderModelOption[] = [
  ...CODEX_MODEL_OPTIONS,
  { id: "gpt-5.2-pro", label: "gpt-5.2-pro" },
  { id: "gpt-5.2-thinking", label: "gpt-5.2-thinking" },
  { id: "gpt-5", label: "gpt-5" },
  { id: "gpt-5-mini", label: "gpt-5-mini" },
];

export const GEMINI_MODEL_OPTIONS: readonly ProviderModelOption[] = [
  { id: "gemini-3-pro", label: "gemini-3-pro" },
  { id: "gemini-3-flash", label: "gemini-3-flash" },
  { id: "gemini-3-deep-think", label: "gemini-3-deep-think" },
  { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
  { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
];

export function uniqueModelOptions(
  options: readonly ProviderModelOption[],
): ProviderModelOption[] {
  const seen = new Set<string>();
  const deduped: ProviderModelOption[] = [];
  for (const option of options) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    deduped.push(option);
  }
  return deduped;
}

export function getAgentProviderModelOptions(
  provider: ConfigProvider,
): readonly ProviderModelOption[] {
  if (provider === "codex") return CODEX_MODEL_OPTIONS;
  if (provider === "gemini") return GEMINI_MODEL_OPTIONS;
  return CLAUDE_AGENT_MODEL_OPTIONS;
}
