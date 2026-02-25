import type { AIProviderAdapter } from "./ai-adapter";
import { AnthropicAdapter } from "./adapters/anthropic";
import { OpenAIAdapter } from "./adapters/openai";
import { GoogleAdapter } from "./adapters/google";
import { CustomAdapter } from "./adapters/custom";

const registry = new Map<string, AIProviderAdapter>();

function register(adapter: AIProviderAdapter) {
  registry.set(adapter.id, adapter);
}

// Register built-in adapters
register(new AnthropicAdapter());
register(new OpenAIAdapter());
register(new GoogleAdapter());
register(new CustomAdapter());

export function getAIProvider(id: string): AIProviderAdapter | undefined {
  return registry.get(id);
}

export function requireAIProvider(id: string): AIProviderAdapter {
  const adapter = registry.get(id);
  if (!adapter) throw new Error(`Unknown AI provider: ${id}`);
  return adapter;
}

export function getAvailableAIProviders(): AIProviderAdapter[] {
  return [...registry.values()].filter((a) => a.isAvailable());
}

export function getAllAIProviderIds(): string[] {
  return [...registry.keys()];
}
