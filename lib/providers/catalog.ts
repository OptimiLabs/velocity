// Static provider catalog — metadata, setup guides, and model lists
// Live connection status comes from the DB; this file provides the "known universe"

import { LANDSCAPE_MODELS, formatContextWindow } from "@/lib/compare/landscape";
import type { LandscapeModel, ModelStrength } from "@/lib/compare/landscape";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProviderSlug =
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local";

export interface ProviderModel {
  id: string;
  label: string;
  inputPrice: number | null;
  outputPrice: number | null;
  contextWindow: number;
  contextFormatted: string;
  strengths: ModelStrength[];
}

export interface ProviderCatalogEntry {
  slug: ProviderSlug;
  name: string;
  description: string;
  iconName: string; // lucide icon name
  dbProviderType: "anthropic" | "openai" | "google" | "custom";
  setupSteps: string[];
  dashboardUrl: string;
  defaultEndpointUrl?: string;
  models: ProviderModel[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function landscapeToProviderModels(models: LandscapeModel[]): ProviderModel[] {
  return models.map((m) => ({
    id: m.id,
    label: m.label,
    inputPrice: m.inputPrice,
    outputPrice: m.outputPrice,
    contextWindow: m.contextWindow,
    contextFormatted: formatContextWindow(m.contextWindow),
    strengths: m.strengths,
  }));
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    slug: "anthropic",
    name: "Anthropic",
    description:
      "Claude models — best-in-class for coding, reasoning, and analysis",
    iconName: "Sparkles",
    dbProviderType: "anthropic",
    setupSteps: [
      "Go to console.anthropic.com and sign in",
      "Navigate to API Keys in your account settings",
      "Click 'Create Key' and copy your new API key",
      "Paste it below to connect",
    ],
    dashboardUrl: "https://console.anthropic.com/settings/keys",
    models: landscapeToProviderModels(
      LANDSCAPE_MODELS.filter((m) => m.provider === "anthropic"),
    ),
  },
  {
    slug: "openai",
    name: "OpenAI",
    description: "GPT models — strong math, science, and terminal coding",
    iconName: "Bot",
    dbProviderType: "openai",
    setupSteps: [
      "Go to platform.openai.com and sign in",
      "Navigate to API Keys in your account settings",
      "Click 'Create new secret key' and copy it",
      "Paste it below to connect",
    ],
    dashboardUrl: "https://platform.openai.com/api-keys",
    models: landscapeToProviderModels(
      LANDSCAPE_MODELS.filter((m) => m.provider === "openai"),
    ),
  },
  {
    slug: "google",
    name: "Google AI",
    description:
      "Gemini models — massive context, multimodal, and deep reasoning",
    iconName: "Globe",
    dbProviderType: "google",
    setupSteps: [
      "Go to aistudio.google.com and sign in",
      "Click 'Get API Key' in the top navigation",
      "Create a new key or copy an existing one",
      "Paste it below to connect",
    ],
    dashboardUrl: "https://aistudio.google.com/apikey",
    models: landscapeToProviderModels(
      LANDSCAPE_MODELS.filter((m) => m.provider === "google"),
    ),
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    description: "Unified API gateway — access 200+ models from one key",
    iconName: "Network",
    dbProviderType: "custom",
    defaultEndpointUrl: "https://openrouter.ai/api/v1",
    setupSteps: [
      "Go to openrouter.ai and create an account",
      "Navigate to Keys in your dashboard",
      "Click 'Create Key' and copy it",
      "Paste it below — the endpoint is pre-filled",
    ],
    dashboardUrl: "https://openrouter.ai/keys",
    models: [
      {
        id: "openrouter/auto",
        label: "Auto (best available)",
        inputPrice: null,
        outputPrice: null,
        contextWindow: 200_000,
        contextFormatted: "200K",
        strengths: ["reasoning", "coding"],
      },
      {
        id: "openrouter/optimus",
        label: "Optimus (cost-optimized)",
        inputPrice: null,
        outputPrice: null,
        contextWindow: 128_000,
        contextFormatted: "128K",
        strengths: ["cost-efficiency"],
      },
    ],
  },
  {
    slug: "local",
    name: "Local",
    description: "Ollama / LM Studio — run models on your own hardware",
    iconName: "HardDrive",
    dbProviderType: "custom",
    defaultEndpointUrl: "http://localhost:11434/v1",
    setupSteps: [
      "Install Ollama (ollama.com) or LM Studio (lmstudio.ai)",
      "Pull a model: ollama pull llama3.2 or download in LM Studio",
      "Start the server (Ollama runs automatically; LM Studio: start server)",
      "The default endpoint is pre-filled — adjust if needed",
    ],
    dashboardUrl: "https://ollama.com/library",
    models: [
      {
        id: "llama3.2",
        label: "Llama 3.2 (8B)",
        inputPrice: null,
        outputPrice: null,
        contextWindow: 128_000,
        contextFormatted: "128K",
        strengths: ["cost-efficiency", "speed"],
      },
      {
        id: "codellama",
        label: "Code Llama (34B)",
        inputPrice: null,
        outputPrice: null,
        contextWindow: 16_000,
        contextFormatted: "16K",
        strengths: ["coding"],
      },
      {
        id: "mistral",
        label: "Mistral (7B)",
        inputPrice: null,
        outputPrice: null,
        contextWindow: 32_000,
        contextFormatted: "32K",
        strengths: ["speed", "cost-efficiency"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getProviderBySlug(
  slug: ProviderSlug,
): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.slug === slug);
}

export function getTotalCatalogModels(): number {
  return PROVIDER_CATALOG.reduce((sum, p) => sum + p.models.length, 0);
}
