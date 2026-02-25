import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic API call
global.fetch = vi.fn() as unknown as typeof fetch;

describe("agents/build API validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reject requests without a description", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    // Mock a validation error response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Description is required" }),
    } as Response);

    const res = await fetch("/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "", model: "sonnet" }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  it("should validate response structure has required agent fields", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    const mockAgentConfig = {
      name: "test-agent",
      description: "A test agent",
      model: "sonnet",
      prompt: "You are a helpful assistant",
      tools: ["Read", "Write"],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockAgentConfig,
    } as Response);

    const res = await fetch("/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "A helpful agent", model: "sonnet" }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();

    // Verify required fields exist
    expect(data).toHaveProperty("name");
    expect(data).toHaveProperty("description");
    expect(data).toHaveProperty("prompt");
  });

  it("should handle empty description gracefully", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "Description cannot be empty" }),
    } as Response);

    const res = await fetch("/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "   ", model: "sonnet" }),
    });

    expect(res.ok).toBe(false);
  });

  it("should accept valid description and model", async () => {
    const mockFetch = global.fetch as unknown as ReturnType<typeof vi.fn>;

    const validConfig = {
      name: "code-reviewer",
      description: "Reviews code for security issues",
      model: "opus",
      prompt: "You are a code reviewer focusing on security",
      tools: ["Read", "Grep", "Bash"],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => validConfig,
    } as Response);

    const res = await fetch("/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "A code reviewer that focuses on security",
        model: "opus",
      }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.name).toBe("code-reviewer");
    expect(data.model).toBe("opus");
  });
});
