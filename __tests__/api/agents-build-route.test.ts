import { beforeEach, describe, expect, it, vi } from "vitest";

const aiGenerateMock = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock("@/lib/ai/generate", () => ({
  aiGenerate: aiGenerateMock,
}));

describe("POST /api/agents/build (route)", () => {
  beforeEach(() => {
    aiGenerateMock.mockReset();
  });

  it("rejects whitespace-only description", async () => {
    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "   " }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "description is required" });
    expect(aiGenerateMock).not.toHaveBeenCalled();
  });

  it("rejects invalid model/effort before calling AI", async () => {
    const { POST } = await import("@/app/api/agents/build/route");

    const badModelReq = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "agent", model: "bad model!" }),
    });
    const badModelRes = await POST(badModelReq);
    expect(badModelRes.status).toBe(400);
    expect(await badModelRes.json()).toEqual({ error: "invalid model" });

    const badEffortReq = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "agent", effort: "max" }),
    });
    const badEffortRes = await POST(badEffortReq);
    expect(badEffortRes.status).toBe(400);
    expect(await badEffortRes.json()).toEqual({ error: "invalid effort" });

    const badSettingsReq = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "agent", topP: 2 }),
    });
    const badSettingsRes = await POST(badSettingsReq);
    expect(badSettingsRes.status).toBe(400);
    expect(await badSettingsRes.json()).toEqual({
      error: "invalid generation settings",
    });

    expect(aiGenerateMock).not.toHaveBeenCalled();
  });

  it("allows non-Claude agent models and preserves them in generated configs", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      '{"name":"codex-helper","description":"Codex helper","prompt":"Do codex work","tools":["Read"]}',
    );

    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Build a codex helper",
        targetProvider: "codex",
        model: "gpt-5",
        effort: "medium",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      targetProvider: "codex",
      baseConfig: {
        model: "gpt-5",
        effort: "medium",
      },
    });
    expect(data.results?.[0]?.output?.config).toMatchObject({
      model: "gpt-5",
      effort: "medium",
    });
    expect(aiGenerateMock).toHaveBeenCalledTimes(1);
    expect(aiGenerateMock.mock.calls[0]?.[1]).toMatchObject({
      model: undefined,
    });
  });

  it("normalizes Claude runtime model ids to Claude aliases", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      '{"name":"review-helper","description":"Review helper","prompt":"Review code","tools":["Read"]}',
    );

    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Build a Claude review helper",
        targetProvider: "claude",
        agentModel: "claude-opus-4-6",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.model).toBe("opus");
  });

  it("normalizes AI output and preserves user-selected tools/model/effort", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      [
        "Some commentary with braces {not valid json}.",
        '{"name":"My Agent!!!","description":"Line one\\nLine two","prompt":"Do work","tools":["Read","", "Read", 123],"color":"blue"}',
      ].join("\n"),
    );

    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: " Build an agent for code review ",
        model: "sonnet",
        effort: "high",
        tools: ["Read", "Grep"],
        existingAgents: [{ name: "my-agent", description: "existing" }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toMatchObject({
      name: "my-agent-2",
      description: "Line one",
      model: "sonnet",
      effort: "high",
      tools: ["Read", "Grep"],
      prompt: "Do work",
      color: "#3b82f6",
    });

    expect(aiGenerateMock).toHaveBeenCalledTimes(1);
  });

  it("returns a 500 when no JSON object can be extracted", async () => {
    aiGenerateMock.mockResolvedValueOnce("No structured output here");

    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "build me an agent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      error: "Failed to parse AI response",
      validation: {
        isValid: false,
      },
      warnings: expect.any(Array),
    });
  });

  it("falls back to sanitized description-derived fields when AI payload is sparse", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      '{"name":"***","description":"","prompt":"","tools":[],"color":"bogus"}',
    );

    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Security review helper for PRs" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.name).toBe("security-review-helper-for-prs");
    expect(data.description).toBe("Security review helper for PRs");
    expect(data.prompt).toBe("Security review helper for PRs");
    expect(data.tools).toEqual(["Read", "Glob", "Grep"]);
    expect(data.color).toBe("#3b82f6");
    expect(data.validation).toMatchObject({ isValid: true });
    expect(data.status).toBe("repaired");
  });

  it("returns baseConfig and provider results for targetProvider=all", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      '{"name":"reviewer","description":"Reviews code changes","prompt":"Inspect diffs","tools":["Read","Grep"],"color":"#22c55e"}',
    );

    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "Build a review agent",
        targetProvider: "all",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.targetProvider).toBe("all");
    expect(data.baseConfig).toMatchObject({
      name: "reviewer",
      description: "Reviews code changes",
      prompt: "Inspect diffs",
      tools: ["Read", "Grep"],
      color: "#22c55e",
    });
    expect(data.results.map((r: { target: string }) => r.target)).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
    expect(data.validation).toMatchObject({ isValid: true });
    expect(data.status).toBe("valid");
  });

  it("rejects invalid provider before calling AI", async () => {
    const { POST } = await import("@/app/api/agents/build/route");
    const req = new Request("http://localhost/api/agents/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: "build me an agent",
        provider: "bad-provider",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid provider" });
    expect(aiGenerateMock).not.toHaveBeenCalled();
  });
});
