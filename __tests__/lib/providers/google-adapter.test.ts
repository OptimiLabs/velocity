import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the DB dependency to avoid better-sqlite3 in bun test
vi.mock("@/lib/db/instruction-files", () => ({
  getAIProviderKey: vi.fn(() => null),
}));

import { GoogleAdapter } from "@/lib/providers/adapters/google";
import {
  getAIProvider,
  getAllAIProviderIds,
} from "@/lib/providers/ai-registry";

describe("GoogleAdapter", () => {
  it("has correct id", () => {
    const adapter = new GoogleAdapter();
    expect(adapter.id).toBe("google");
  });
  it("has default model gemini-2.5-flash", () => {
    const adapter = new GoogleAdapter();
    expect(adapter.defaultModel).toBe("gemini-2.5-flash");
  });
  it("uses GOOGLE_API_KEY env var", () => {
    const adapter = new GoogleAdapter();
    expect(adapter.envVarKey).toBe("GOOGLE_API_KEY");
  });
  it("getApiKey returns null or string", () => {
    const adapter = new GoogleAdapter();
    const key = adapter.getApiKey();
    expect(key === null || typeof key === "string").toBe(true);
  });
  it("isAvailable returns boolean", () => {
    const adapter = new GoogleAdapter();
    expect(typeof adapter.isAvailable()).toBe("boolean");
  });
});

describe("GoogleAdapter registration", () => {
  it("is registered in the AI registry", () => {
    const adapter = getAIProvider("google");
    expect(adapter).toBeDefined();
    expect(adapter!.id).toBe("google");
  });
  it("appears in all AI provider IDs", () => {
    const ids = getAllAIProviderIds();
    expect(ids).toContain("google");
  });
});

describe("GoogleAdapter.complete — fetch mocking", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;
  let adapter: GoogleAdapter;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    // Inject API key via env
    process.env.GOOGLE_API_KEY = "test-api-key-123";
    adapter = new GoogleAdapter();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_API_KEY;
  });

  it("constructs correct API URL with model name", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Hello" }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    });

    await adapter.complete({ prompt: "Test" });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect(url).toContain("key=test-api-key-123");
  });

  it("uses custom model when specified", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Hi" }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    });

    await adapter.complete({ prompt: "Test", model: "gemini-2.5-pro" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("models/gemini-2.5-pro:generateContent");
  });

  it("parses response with usage metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "Generated " }, { text: "content" }],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      }),
    });

    const result = await adapter.complete({ prompt: "Test" });

    expect(result.content).toBe("Generated content");
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(50);
    expect(result.editorType).toBe("ai-google");
  });

  it("returns cost based on Gemini pricing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
        usageMetadata: {
          promptTokenCount: 1_000_000,
          candidatesTokenCount: 1_000_000,
        },
      }),
    });

    const result = await adapter.complete({ prompt: "Test" });
    // Default model gemini-2.5-flash: $0.30/1M input, $2.50/1M output
    // Cost = (1M * 0.3 + 1M * 2.5) / 1M = $2.80
    expect(result.cost).toBeCloseTo(2.8);
  });

  it("handles API error gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "Rate limited",
    });

    await expect(adapter.complete({ prompt: "Test" })).rejects.toThrow(
      /Google AI API error: 429/,
    );
  });

  it("throws when no API key configured", async () => {
    delete process.env.GOOGLE_API_KEY;
    const noKeyAdapter = new GoogleAdapter();

    await expect(noKeyAdapter.complete({ prompt: "Test" })).rejects.toThrow(
      /No Google API key/,
    );
  });

  it("includes system instruction when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "OK" }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      }),
    });

    await adapter.complete({ prompt: "Test", system: "You are helpful" });

    const [, options] = mockFetch.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "You are helpful" }],
    });
  });
});
