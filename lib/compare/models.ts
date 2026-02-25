export type ModelGroup =
  | "cli"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local"
  | "custom";

export interface CompareModelConfig {
  id: string;
  label: string;
  description: string;
  provider:
    | "claude-cli"
    | "anthropic"
    | "openai"
    | "google"
    | "openrouter"
    | "local"
    | "custom";
  group: ModelGroup;
  modelId: string; // actual API model ID
  inputPrice: number; // per 1M tokens
  outputPrice: number; // per 1M tokens
  contextWindow: number;
}

const MODEL_GROUP_LABELS: Record<ModelGroup, string> = {
  cli: "Claude CLI",
  anthropic: "Anthropic API",
  openai: "OpenAI",
  google: "Google AI",
  openrouter: "OpenRouter",
  local: "Local",
  custom: "Custom",
};

export const COMPARE_MODELS: CompareModelConfig[] = [
  // --- CLI group (no API key needed) ---
  {
    id: "claude-cli-opus",
    label: "Opus 4.6",
    description: "CLI with Opus 4.6",
    provider: "claude-cli",
    group: "cli",
    modelId: "claude-opus-4-6",
    inputPrice: 5,
    outputPrice: 25,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-cli-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "CLI with Sonnet 4.6 (1M context)",
    provider: "claude-cli",
    group: "cli",
    modelId: "claude-sonnet-4-6",
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-cli-sonnet",
    label: "Sonnet 4.5",
    description: "CLI with Sonnet 4.5",
    provider: "claude-cli",
    group: "cli",
    modelId: "claude-sonnet-4-5-20250929",
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 200_000,
  },
  {
    id: "claude-cli-haiku",
    label: "Haiku 4.5",
    description: "CLI with Haiku 4.5",
    provider: "claude-cli",
    group: "cli",
    modelId: "claude-haiku-4-5-20251001",
    inputPrice: 1,
    outputPrice: 5,
    contextWindow: 200_000,
  },
  // --- Anthropic API group (requires key) ---
  {
    id: "claude-opus-4-6",
    label: "Opus 4.6",
    description: "Most capable, highest quality",
    provider: "anthropic",
    group: "anthropic",
    modelId: "claude-opus-4-6",
    inputPrice: 5,
    outputPrice: 25,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    description: "Fast, capable, 1M context",
    provider: "anthropic",
    group: "anthropic",
    modelId: "claude-sonnet-4-6",
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 1_000_000,
  },
  {
    id: "claude-sonnet-4-5",
    label: "Sonnet 4.5",
    description: "Fast and capable",
    provider: "anthropic",
    group: "anthropic",
    modelId: "claude-sonnet-4-5-20250929",
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 200_000,
  },
  {
    id: "claude-haiku-4-5",
    label: "Haiku 4.5",
    description: "Fastest and cheapest",
    provider: "anthropic",
    group: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    inputPrice: 1,
    outputPrice: 5,
    contextWindow: 200_000,
  },
  // --- OpenAI group (requires key) ---
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "OpenAI flagship model",
    provider: "openai",
    group: "openai",
    modelId: "gpt-4o",
    inputPrice: 2.5,
    outputPrice: 10,
    contextWindow: 128_000,
  },
  // --- Google group (requires key) ---
  {
    id: "gemini-3-flash",
    label: "Gemini 3 Flash",
    description: "Fast Google model with large context",
    provider: "google",
    group: "google",
    modelId: "gemini-3-flash",
    inputPrice: 0.5,
    outputPrice: 3,
    contextWindow: 1_000_000,
  },
  // --- OpenRouter group (custom/OpenAI-compatible endpoint) ---
  {
    id: "openrouter-auto",
    label: "OpenRouter Auto",
    description: "Routes to the best available model (pricing varies)",
    provider: "openrouter",
    group: "openrouter",
    modelId: "openrouter/auto",
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 200_000,
  },
  // --- Local group (OpenAI-compatible endpoint, no API cost) ---
  {
    id: "local-llama3.2",
    label: "Local (Llama 3.2)",
    description: "Local server via Ollama/LM Studio (cost estimate $0)",
    provider: "local",
    group: "local",
    modelId: "llama3.2",
    inputPrice: 0,
    outputPrice: 0,
    contextWindow: 128_000,
  },
  // --- Custom group (requires key) ---
  {
    id: "custom",
    label: "Custom Endpoint",
    description: "Your configured custom provider",
    provider: "custom",
    group: "custom",
    modelId: "",
    inputPrice: 3,
    outputPrice: 15,
    contextWindow: 200_000,
  },
];

const MODEL_MAP = new Map(COMPARE_MODELS.map((m) => [m.id, m]));

const PROVIDER_DEFAULT_MODEL_ID: Record<
  CompareModelConfig["provider"],
  CompareModelConfig["id"]
> = {
  "claude-cli": "claude-cli-sonnet",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-3-flash",
  openrouter: "openrouter-auto",
  local: "local-llama3.2",
  custom: "custom",
};

export function getModelConfig(id: string): CompareModelConfig {
  const alias = PROVIDER_DEFAULT_MODEL_ID[id as CompareModelConfig["provider"]];
  return MODEL_MAP.get(alias || id) ?? MODEL_MAP.get("claude-cli-sonnet") ?? COMPARE_MODELS[0];
}

export interface ModelGroupEntry {
  group: ModelGroup;
  label: string;
  /** true for CLI group which doesn't need an API key */
  noKeyRequired: boolean;
  models: CompareModelConfig[];
}

export function resolveSettingsModel(settingsModel?: string): string {
  if (!settingsModel) return "claude-cli-sonnet";
  // Try exact id match first
  if (MODEL_MAP.has(settingsModel)) return settingsModel;
  // Try matching by modelId, preferring CLI group
  const cliMatch = COMPARE_MODELS.find(
    (m) => m.group === "cli" && m.modelId === settingsModel,
  );
  if (cliMatch) return cliMatch.id;
  const anyMatch = COMPARE_MODELS.find((m) => m.modelId === settingsModel);
  if (anyMatch) return anyMatch.id;
  return "claude-cli-sonnet";
}

export function getModelGroups(): ModelGroupEntry[] {
  const groupOrder: ModelGroup[] = [
    "cli",
    "anthropic",
    "openai",
    "google",
    "openrouter",
    "local",
    "custom",
  ];
  return groupOrder
    .map((group) => ({
      group,
      label: MODEL_GROUP_LABELS[group],
      noKeyRequired: group === "cli",
      models: COMPARE_MODELS.filter((m) => m.group === group),
    }))
    .filter((g) => g.models.length > 0);
}
