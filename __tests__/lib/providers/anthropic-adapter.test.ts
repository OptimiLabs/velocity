import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAIProviderKey = vi.fn();

vi.mock("@/lib/db/instruction-files", () => ({
  getAIProviderKey: mockGetAIProviderKey,
}));

const { AnthropicAdapter } = await import("@/lib/providers/adapters/anthropic");

describe("AnthropicAdapter", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockGetAIProviderKey.mockReset();
    mockGetAIProviderKey.mockReturnValue("sk-ant-test");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("extracts text even when thinking/tool blocks appear first", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            { type: "thinking", text: "internal chain" },
            { type: "text", text: "SMOKE_OK" },
            { type: "text", text: "DONE" },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200 },
      ),
    ) as typeof fetch;

    const adapter = new AnthropicAdapter();
    const res = await adapter.complete({
      prompt: "test",
      maxTokens: 128,
      timeoutMs: 10_000,
    });

    expect(res.content).toBe("SMOKE_OK\nDONE");
    expect(res.inputTokens).toBe(10);
    expect(res.outputTokens).toBe(5);
    expect(res.cost).toBeGreaterThan(0);
  });
});
