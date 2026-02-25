import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderAgentMock = vi.fn();
const saveProviderAgentMock = vi.fn();
const deleteProviderAgentMock = vi.fn();
const validateAgentNameMock = vi.fn();
const deleteAgentMetaMock = vi.fn();
const dbRunMock = vi.fn();

vi.mock("@/lib/providers/agent-files", () => ({
  getProviderAgent: getProviderAgentMock,
  saveProviderAgent: saveProviderAgentMock,
  deleteProviderAgent: deleteProviderAgentMock,
}));

vi.mock("@/lib/agents/parser", () => ({
  validateAgentName: validateAgentNameMock,
}));

vi.mock("@/lib/db/agent-catalog", () => ({
  deleteAgentMeta: deleteAgentMetaMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    prepare: () => ({
      run: dbRunMock,
    }),
  }),
}));

describe("api/agents/[name] provider parity", () => {
  beforeEach(() => {
    getProviderAgentMock.mockReset();
    saveProviderAgentMock.mockReset();
    deleteProviderAgentMock.mockReset();
    validateAgentNameMock.mockReset();
    validateAgentNameMock.mockReturnValue(null);
    deleteAgentMetaMock.mockReset();
    dbRunMock.mockReset();
  });

  it("GET returns provider-specific agent data", async () => {
    const { GET } = await import("@/app/api/agents/[name]/route");
    getProviderAgentMock.mockReturnValueOnce({
      name: "reviewer",
      provider: "codex",
      description: "code review",
      prompt: "review code",
      filePath: "/tmp/reviewer.md",
    });

    const req = {
      nextUrl: new URL("http://localhost/api/agents/reviewer?provider=codex"),
    };
    const res = await GET(req as never, {
      params: Promise.resolve({ name: "reviewer" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "reviewer",
      provider: "codex",
    });
    expect(getProviderAgentMock).toHaveBeenCalledWith("codex", "reviewer", undefined);
  });

  it("PUT saves updates through provider file APIs", async () => {
    const { PUT } = await import("@/app/api/agents/[name]/route");
    getProviderAgentMock.mockReturnValueOnce({
      name: "gem-agent",
      provider: "gemini",
      description: "",
      prompt: "old prompt",
      filePath: "/tmp/gem-agent.md",
    });

    const req = {
      nextUrl: new URL("http://localhost/api/agents/gem-agent?provider=gemini"),
      json: async () => ({
        description: "updated",
        prompt: "new prompt",
      }),
    };
    const res = await PUT(req as never, {
      params: Promise.resolve({ name: "gem-agent" }),
    });

    expect(res.status).toBe(200);
    expect(saveProviderAgentMock).toHaveBeenCalledWith(
      "gemini",
      expect.objectContaining({
        name: "gem-agent",
        provider: "gemini",
        description: "updated",
        prompt: "new prompt",
      }),
      undefined,
    );
  });

  it("DELETE removes only provider-targeted agent artifacts", async () => {
    const { DELETE } = await import("@/app/api/agents/[name]/route");
    getProviderAgentMock.mockReturnValueOnce({
      name: "codex-agent",
      provider: "codex",
      description: "",
      prompt: "prompt",
      filePath: "/tmp/codex-agent.md",
    });
    deleteProviderAgentMock.mockReturnValueOnce(true);

    const req = {
      nextUrl: new URL(
        "http://localhost/api/agents/codex-agent?provider=codex&projectPath=/tmp/demo",
      ),
    };
    const res = await DELETE(req as never, {
      params: Promise.resolve({ name: "codex-agent" }),
    });

    expect(res.status).toBe(200);
    expect(deleteProviderAgentMock).toHaveBeenCalledWith(
      "codex",
      "codex-agent",
      "/tmp/demo",
    );
    expect(deleteAgentMetaMock).toHaveBeenCalledWith("codex-agent", {
      provider: "codex",
      projectPath: "/tmp/demo",
    });
    expect(dbRunMock).not.toHaveBeenCalled();
  });
});
