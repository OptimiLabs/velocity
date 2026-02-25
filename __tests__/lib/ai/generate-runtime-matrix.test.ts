import { beforeEach, describe, expect, it, vi } from "vitest";

const mockResolveGenerationRuntimeDefaults = vi.fn();
const mockGetAIProvider = vi.fn();
const mockClaudeOneShot = vi.fn();
const mockCodexOneShot = vi.fn();
const mockAiLogInfo = vi.fn();
const mockAiLogError = vi.fn();

vi.mock("@/lib/ai/runtime-defaults", () => ({
  resolveGenerationRuntimeDefaults: mockResolveGenerationRuntimeDefaults,
}));
vi.mock("@/lib/providers/ai-registry", () => ({
  getAIProvider: mockGetAIProvider,
}));
vi.mock("@/lib/ai/claude", () => ({
  claudeOneShot: mockClaudeOneShot,
}));
vi.mock("@/lib/ai/codex", () => ({
  codexOneShot: mockCodexOneShot,
}));
vi.mock("@/lib/logger", () => ({
  aiLog: { info: mockAiLogInfo, error: mockAiLogError },
}));

const { aiGenerate } = await import("@/lib/ai/generate");

function makeAdapter() {
  return {
    defaultModel: "provider-default-model",
    isAvailable: vi.fn(() => true),
    complete: vi.fn(async () => ({
      content: "ok",
      inputTokens: 10,
      outputTokens: 5,
      cost: 0.001,
      editorType: "ai-openai",
    })),
  };
}

describe("aiGenerate runtime matrix", () => {
  beforeEach(() => {
    mockResolveGenerationRuntimeDefaults.mockReset();
    mockGetAIProvider.mockReset();
    mockClaudeOneShot.mockReset();
    mockCodexOneShot.mockReset();
    mockAiLogInfo.mockReset();
    mockAiLogError.mockReset();
  });

  it("uses API runtime with OpenAI mapping and selected model", async () => {
    const adapter = makeAdapter();
    mockResolveGenerationRuntimeDefaults.mockReturnValue({
      mode: "api",
      model: "gpt-5",
      thinkingLevel: "medium",
      claudeCliEnabled: true,
      codexCliEnabled: true,
      apiProvider: "openai",
      apiDefaults: {},
    });
    mockGetAIProvider.mockReturnValue(adapter);

    const result = await aiGenerate("hello");

    expect(result).toBe("ok");
    expect(mockGetAIProvider).toHaveBeenCalledWith("openai");
    expect(adapter.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5",
      }),
    );
  });

  it("uses API runtime with Google mapping for Gemini models", async () => {
    const adapter = makeAdapter();
    mockResolveGenerationRuntimeDefaults.mockReturnValue({
      mode: "api",
      model: "gemini-2.5-pro",
      thinkingLevel: "high",
      claudeCliEnabled: true,
      codexCliEnabled: true,
      apiProvider: "google",
      apiDefaults: { thinkingBudget: 2048 },
    });
    mockGetAIProvider.mockReturnValue(adapter);

    await aiGenerate("hello");

    expect(mockGetAIProvider).toHaveBeenCalledWith("google");
    expect(adapter.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.5-pro",
        thinkingBudget: 2048,
      }),
    );
  });

  it("throws a model-specific error when API model has no matching active provider", async () => {
    mockResolveGenerationRuntimeDefaults.mockReturnValue({
      mode: "api",
      model: "gpt-5",
      thinkingLevel: "medium",
      claudeCliEnabled: true,
      codexCliEnabled: true,
      apiProvider: undefined,
      apiDefaults: {},
    });

    await expect(aiGenerate("hello")).rejects.toThrow(
      'API mode is enabled but no active API provider matches configured model "gpt-5". Configure a matching API key or choose a different default model in Settings.',
    );
  });

  it("uses Codex CLI runtime when selected", async () => {
    mockResolveGenerationRuntimeDefaults.mockReturnValue({
      mode: "codex-cli",
      model: "codex-mini-latest",
      thinkingLevel: "high",
      claudeCliEnabled: true,
      codexCliEnabled: true,
    });
    mockCodexOneShot.mockResolvedValue("codex-result");

    const result = await aiGenerate("hello");

    expect(result).toBe("codex-result");
    expect(mockCodexOneShot).toHaveBeenCalledWith(
      "hello",
      undefined,
      120000,
      {
        model: "codex-mini-latest",
        effort: "high",
      },
    );
  });

  it("uses Claude CLI runtime when selected", async () => {
    mockResolveGenerationRuntimeDefaults.mockReturnValue({
      mode: "claude-cli",
      model: "claude-opus-4-6",
      thinkingLevel: "low",
      claudeCliEnabled: true,
      codexCliEnabled: true,
    });
    mockClaudeOneShot.mockResolvedValue("claude-result");

    const result = await aiGenerate("hello");

    expect(result).toBe("claude-result");
    expect(mockClaudeOneShot).toHaveBeenCalledWith(
      "hello",
      undefined,
      120000,
      "claude-opus-4-6",
      "low",
    );
  });
});
