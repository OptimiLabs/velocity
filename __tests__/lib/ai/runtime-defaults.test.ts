import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadAppSettings = vi.fn();
const mockReadClaudeSettings = vi.fn();
const mockReadCodexSettings = vi.fn();
const mockListActiveAIProviderConfigs = vi.fn();

vi.mock("@/lib/app-settings", () => ({
  readAppSettings: mockReadAppSettings,
}));

vi.mock("@/lib/claude-settings", () => ({
  readSettings: mockReadClaudeSettings,
}));

vi.mock("@/lib/codex/settings", () => ({
  readCodexSettings: mockReadCodexSettings,
}));

vi.mock("@/lib/db/instruction-files", () => ({
  listActiveAIProviderConfigs: mockListActiveAIProviderConfigs,
}));

const { resolveGenerationRuntimeDefaults } = await import(
  "@/lib/ai/runtime-defaults"
);

describe("resolveGenerationRuntimeDefaults", () => {
  beforeEach(() => {
    mockReadClaudeSettings.mockReturnValue({
      model: "claude-sonnet-4-6",
      effortLevel: "medium",
      claudeCliEnabled: true,
    });
    mockReadCodexSettings.mockReturnValue({
      model: "o3",
      model_reasoning_effort: "low",
    });
    mockListActiveAIProviderConfigs.mockReturnValue([]);
  });

  it("uses runtime-specific model and thinking defaults over legacy shared values", () => {
    mockReadAppSettings.mockReturnValue({
      generationRuntime: "codex-cli",
      generationModel: "legacy-shared-model",
      generationThinkingLevel: "low",
      generationDefaults: {
        "codex-cli": {
          model: "codex-mini-latest",
          thinkingLevel: "high",
        },
      },
      codexCliEnabled: true,
    });

    const resolved = resolveGenerationRuntimeDefaults();

    expect(resolved.mode).toBe("codex-cli");
    expect(resolved.model).toBe("codex-mini-latest");
    expect(resolved.thinkingLevel).toBe("high");
  });

  it("falls back to legacy shared defaults when runtime-specific defaults are absent", () => {
    mockReadAppSettings.mockReturnValue({
      generationRuntime: "claude-cli",
      generationModel: "legacy-shared-model",
      generationThinkingLevel: "low",
      generationDefaults: {},
      codexCliEnabled: true,
    });

    const resolved = resolveGenerationRuntimeDefaults();

    expect(resolved.mode).toBe("claude-cli");
    expect(resolved.model).toBe("legacy-shared-model");
    expect(resolved.thinkingLevel).toBe("low");
  });

  it("resolves API provider from selected model instead of recency", () => {
    mockReadAppSettings.mockReturnValue({
      generationRuntime: "api",
      generationDefaults: {
        api: {
          model: "gpt-5",
          thinkingLevel: "medium",
        },
      },
      codexCliEnabled: true,
    });
    mockListActiveAIProviderConfigs.mockReturnValue([
      {
        provider: "anthropic",
        providerSlug: "anthropic",
        displayName: "Anthropic",
        modelId: "claude-sonnet-4-6",
      },
      {
        provider: "openai",
        providerSlug: "openai",
        displayName: "OpenAI",
        modelId: "gpt-5",
      },
    ]);

    const resolved = resolveGenerationRuntimeDefaults();

    expect(resolved.mode).toBe("api");
    expect(resolved.model).toBe("gpt-5");
    expect(resolved.apiProvider).toBe("openai");
  });

  it("resolves custom API provider slugs from model prefixes (openrouter/local)", () => {
    mockReadAppSettings.mockReturnValue({
      generationRuntime: "api",
      generationDefaults: {
        api: {
          model: "openrouter/auto",
          thinkingLevel: "medium",
        },
      },
      codexCliEnabled: true,
    });
    mockListActiveAIProviderConfigs.mockReturnValue([
      {
        provider: "custom",
        providerSlug: "openrouter",
        displayName: "OpenRouter",
        modelId: "openrouter/auto",
      },
    ]);

    const resolved = resolveGenerationRuntimeDefaults();

    expect(resolved.apiProvider).toBe("openrouter");
    expect(resolved.model).toBe("openrouter/auto");
  });

  it("does not fall back to a mismatched provider when model implies another provider", () => {
    mockReadAppSettings.mockReturnValue({
      generationRuntime: "api",
      generationDefaults: {
        api: {
          model: "gpt-5",
          thinkingLevel: "high",
        },
      },
      codexCliEnabled: true,
    });
    mockListActiveAIProviderConfigs.mockReturnValue([
      {
        provider: "anthropic",
        providerSlug: "anthropic",
        displayName: "Anthropic",
        modelId: "claude-sonnet-4-6",
      },
    ]);

    const resolved = resolveGenerationRuntimeDefaults();

    expect(resolved.model).toBe("gpt-5");
    expect(resolved.apiProvider).toBeUndefined();
  });

  it("falls back to first active provider only when model cannot infer provider", () => {
    mockReadAppSettings.mockReturnValue({
      generationRuntime: "api",
      generationDefaults: {
        api: {
          model: "my-unknown-model",
          thinkingLevel: "medium",
        },
      },
      codexCliEnabled: true,
    });
    mockListActiveAIProviderConfigs.mockReturnValue([
      {
        provider: "anthropic",
        providerSlug: "anthropic",
        displayName: "Anthropic",
        modelId: "claude-sonnet-4-6",
      },
      {
        provider: "openai",
        providerSlug: "openai",
        displayName: "OpenAI",
        modelId: "gpt-5",
      },
    ]);

    const resolved = resolveGenerationRuntimeDefaults();

    expect(resolved.model).toBe("my-unknown-model");
    expect(resolved.apiProvider).toBe("anthropic");
  });
});
