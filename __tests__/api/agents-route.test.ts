import { beforeEach, describe, expect, it, vi } from "vitest";

const validateAgentNameMock = vi.fn();
const setAgentDisabledMock = vi.fn();
const toggleEnabledMock = vi.fn();
const listProviderAgentsMock = vi.fn();
const saveProviderAgentMock = vi.fn();
const ensureProjectRecordMock = vi.fn();
const dbGetMock = vi.fn();
const dbAllMock = vi.fn();
const ensureIndexedMock = vi.fn();

vi.mock("@/lib/agents/parser", () => ({
  listAgents: vi.fn(() => []),
  saveAgent: vi.fn(),
  listProjectAgents: vi.fn(() => []),
  saveProjectAgent: vi.fn(),
  setAgentDisabled: setAgentDisabledMock,
  validateAgentName: validateAgentNameMock,
}));

vi.mock("@/lib/claude-paths", () => ({
  AGENTS_DIR: "/tmp/.claude/agents",
}));

vi.mock("@/lib/agents/presets", () => ({
  AGENT_PRESETS: [],
}));

vi.mock("@/lib/db/agent-catalog", () => ({
  getAllAgentMeta: vi.fn(() => []),
  toggleEnabled: toggleEnabledMock,
  attachSkill: vi.fn(),
  detachSkill: vi.fn(),
  upsertAgentMeta: vi.fn(),
}));

vi.mock("@/lib/db/workflows", () => ({
  listWorkflows: vi.fn(() => []),
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    prepare: (sql: string) => ({
      get: (...args: unknown[]) => dbGetMock(sql, ...args),
      all: (...args: unknown[]) => dbAllMock(sql, ...args),
    }),
  }),
  ensureIndexed: ensureIndexedMock,
}));

vi.mock("@/lib/logger", () => ({
  apiLog: { error: vi.fn() },
}));

vi.mock("@/lib/providers/agent-files", () => ({
  listProviderAgents: listProviderAgentsMock,
  saveProviderAgent: saveProviderAgentMock,
}));

vi.mock("@/lib/projects/registry", () => ({
  ensureProjectRecord: ensureProjectRecordMock,
}));

describe("POST /api/agents", () => {
  beforeEach(() => {
    validateAgentNameMock.mockReset();
    validateAgentNameMock.mockReturnValue(null);
    setAgentDisabledMock.mockReset();
    setAgentDisabledMock.mockReturnValue(true);
    toggleEnabledMock.mockReset();
    listProviderAgentsMock.mockReset();
    listProviderAgentsMock.mockReturnValue([]);
    saveProviderAgentMock.mockReset();
    ensureProjectRecordMock.mockReset();
    ensureProjectRecordMock.mockImplementation((projectPath: string) => ({
      id: "p1",
      name: "Demo",
      path: projectPath,
    }));
    dbGetMock.mockReset();
    dbGetMock.mockReturnValue(undefined);
    dbAllMock.mockReset();
    dbAllMock.mockReturnValue([]);
    ensureIndexedMock.mockReset();
    ensureIndexedMock.mockResolvedValue(undefined);
  });

  it("toggles enabled state and moves agent file into disabled storage", async () => {
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-agent",
        enabled: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(toggleEnabledMock).toHaveBeenCalledWith("my-agent", false, {
      provider: "claude",
      projectPath: undefined,
    });
    expect(setAgentDisabledMock).toHaveBeenCalledWith("my-agent", true);
    expect(await res.json()).toEqual({
      success: true,
      moved: true,
      provider: "claude",
    });
  });

  it("requires projectPath when scope=project", async () => {
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "my-agent",
        scope: "project",
        prompt: "x",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "projectPath is required when scope=project",
      code: "project_path_required",
    });
  });

  it("returns structured invalid name errors", async () => {
    validateAgentNameMock.mockReturnValueOnce("bad name");
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "!bad",
        prompt: "x",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "bad name",
      code: "invalid_agent_name",
    });
  });

  it("saves non-Claude agents through provider file APIs", async () => {
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "codex",
        name: "codex-agent",
        prompt: "help with codex tasks",
        scope: "project",
        projectPath: "/tmp/demo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(ensureProjectRecordMock).toHaveBeenCalledWith("/tmp/demo", "demo");
    expect(saveProviderAgentMock).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({
        name: "codex-agent",
        provider: "codex",
        scope: "project",
        projectPath: "/tmp/demo",
        prompt: "help with codex tasks",
      }),
      "/tmp/demo",
    );
  });

  it("persists a trimmed project areaPath for project-scoped provider agents", async () => {
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "codex",
        name: "area-agent",
        prompt: "focus on analytics",
        scope: "project",
        projectPath: "/tmp/demo",
        areaPath: " src/analytics  ",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(saveProviderAgentMock).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({
        scope: "project",
        projectPath: "/tmp/demo",
        areaPath: "src/analytics",
      }),
      "/tmp/demo",
    );
  });

  it("drops areaPath when saving a global agent", async () => {
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "codex",
        name: "global-agent",
        prompt: "global helper",
        scope: "global",
        areaPath: "src/should-not-save",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(saveProviderAgentMock).toHaveBeenCalledWith(
      "codex",
      expect.objectContaining({
        scope: "global",
        projectPath: undefined,
        areaPath: undefined,
      }),
      undefined,
    );
  });

  it("rejects invalid areaPath for project-scoped agents", async () => {
    const { POST } = await import("@/app/api/agents/route");
    const req = new Request("http://localhost/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "codex",
        name: "bad-area-agent",
        prompt: "x",
        scope: "project",
        projectPath: "/tmp/demo",
        areaPath: "../secret",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "invalid_area_path",
    });
    expect(saveProviderAgentMock).not.toHaveBeenCalled();
  });

  it("populates usage metrics from indexed sessions without watcher data", async () => {
    listProviderAgentsMock.mockReturnValueOnce([
      {
        name: "explore",
        description: "Explore tasks",
        prompt: "Be curious",
        filePath: "/tmp/explore.md",
      },
    ]);
    dbAllMock.mockImplementation((sql: string) => {
      if (sql.includes("FROM sessions")) {
        return [
          {
            agent_name: "explore",
            provider: "codex",
            usage_count: 7,
            last_used: "2026-02-20T10:11:12.000Z",
            avg_cost: 0.42,
          },
        ];
      }
      return [];
    });

    const { GET } = await import("@/app/api/agents/route");
    const req = {
      nextUrl: new URL("http://localhost/api/agents?provider=codex"),
    } as unknown as import("next/server").NextRequest;
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<Record<string, unknown>>;
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      name: "explore",
      usageCount: 7,
      avgCost: 0.42,
    });
    expect(typeof body[0].lastUsed).toBe("number");
    expect(ensureIndexedMock).toHaveBeenCalledTimes(1);
  });
});
