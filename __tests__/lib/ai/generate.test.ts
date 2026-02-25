import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("@/lib/db/instruction-files", () => ({
  getAIProviderKey: vi.fn(),
}));
vi.mock("@/lib/ai/claude", () => ({
  claudeOneShot: vi.fn(),
}));
vi.mock("@/lib/claude-settings", () => ({
  readSettings: () => ({ model: "claude-opus-4-6" }),
}));
vi.mock("@/lib/logger", () => ({
  aiLog: { info: vi.fn(), error: vi.fn() },
}));

// Use dynamic import so our vi.mock declarations take priority over
// any vi.mock("@/lib/ai/generate") from other test files (bun's runner
// shares module mocks across files in the same process).
const { aiGenerate } = await import("@/lib/ai/generate");
const { getAIProviderKey } = await import("@/lib/db/instruction-files");

const mockGetKey = getAIProviderKey as ReturnType<typeof vi.fn>;

describe("aiGenerate with OpenAI provider", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  const origOpenAI = process.env.OPENAI_API_KEY;
  const origAnthropic = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    mockGetKey.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = origOpenAI;
    process.env.ANTHROPIC_API_KEY = origAnthropic;
    fetchSpy?.mockRestore();
  });

  it("calls OpenAI endpoint when provider is openai", async () => {
    mockGetKey.mockImplementation((provider: string) =>
      provider === "openai" ? "sk-test-openai-key" : null,
    );

    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello from OpenAI" } }],
        }),
        { status: 200 },
      ),
    );

    const result = await aiGenerate("test prompt", { provider: "openai" });

    expect(result).toBe("Hello from OpenAI");

    // Find the OpenAI call (other tests or setup may trigger fetch)
    const openaiCall = fetchSpy.mock.calls.find(
      ([url]) => url === "https://api.openai.com/v1/chat/completions",
    );
    expect(openaiCall).toBeDefined();
    const [url, options] = openaiCall!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((options?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer sk-test-openai-key",
    );
  });

  it("uses default model gpt-4o for OpenAI when no model specified", async () => {
    mockGetKey.mockImplementation((provider: string) =>
      provider === "openai" ? "sk-test" : null,
    );

    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
        }),
        { status: 200 },
      ),
    );

    await aiGenerate("test", { provider: "openai" });

    const body = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(body.model).toBe("gpt-4o");
  });

  it("still calls Anthropic when provider is not specified", async () => {
    mockGetKey.mockImplementation((provider: string) =>
      provider === "anthropic" ? "sk-ant-test" : null,
    );

    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ text: "Hello from Anthropic" }],
        }),
        { status: 200 },
      ),
    );

    const result = await aiGenerate("test prompt");

    expect(result).toBe("Hello from Anthropic");
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
  });
});
