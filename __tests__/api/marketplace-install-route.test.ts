import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const chmodSyncMock = vi.fn();
const saveCodexInstructionMock = vi.fn();
const saveGeminiSkillMock = vi.fn();
const fullScanMock = vi.fn();
const invalidateMarketplaceCacheMock = vi.fn();

vi.mock("fs", () => ({
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
  chmodSync: chmodSyncMock,
}));

vi.mock("@/lib/claude-paths", () => ({
  SKILLS_DIR: "/tmp/test/.claude/skills",
  CLAUDE_DIR: "/tmp/test/.claude",
  AGENTS_DIR: "/tmp/test/.claude/agents",
}));

vi.mock("@/lib/codex/paths", () => ({
  CODEX_VELOCITY_AGENTS_DIR: "/tmp/test/.codex/velocity/agents",
}));

vi.mock("@/lib/gemini/paths", () => ({
  GEMINI_AGENTS_DIR: "/tmp/test/.gemini/agents",
}));

vi.mock("@/lib/claude-settings", () => ({
  readSettings: vi.fn(() => ({})),
  writeSettings: vi.fn(),
}));

vi.mock("@/lib/codex/skills", () => ({
  saveCodexInstruction: saveCodexInstructionMock,
}));

vi.mock("@/lib/gemini/skills", () => ({
  saveGeminiSkill: saveGeminiSkillMock,
}));

vi.mock("@/lib/instructions/indexer", () => ({
  fullScan: fullScanMock,
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => null),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
    exec: vi.fn(),
  })),
}));

vi.mock("@/app/api/marketplace/search/route", () => ({
  invalidateMarketplaceCache: invalidateMarketplaceCacheMock,
}));

vi.mock("@/lib/providers/agent-files", () => ({
  syncProviderAgentRegistry: vi.fn(),
}));

vi.mock("@/lib/providers/mcp-settings", () => ({
  readProviderMcpState: vi.fn(() => ({ enabled: {}, disabled: {} })),
  writeProviderMcpState: vi.fn(),
}));

async function waitForInstallJob(
  GET: (request: NextRequest) => Promise<Response>,
  jobId: string,
) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const req = {
      nextUrl: new URL(`http://localhost/api/marketplace/install?jobId=${jobId}`),
    } as NextRequest;
    const res = await GET(req);
    const json = await res.json();
    if (json.status === "completed" || json.status === "failed") return json;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for install job ${jobId}`);
}

describe("POST /api/marketplace/install provider parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("defaults to Claude and writes inline skill content to Claude skills path", async () => {
    const { POST, GET } = await import("@/app/api/marketplace/install/route");

    const req = new Request("http://localhost/api/marketplace/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        url: "builtin://skills/reviewer",
        name: "Reviewer Skill",
        config: {
          skillContent: "---\nname: reviewer\ndescription: test\n---\nReview code",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targetProvider).toBe("claude");
    expect(body.status).toBe("pending");

    const job = await waitForInstallJob(GET, body.jobId);
    expect(job.status).toBe("completed");
    expect(job.result).toMatchObject({
      installed: "reviewer-skill",
      method: "skill",
      targetProvider: "claude",
    });

    expect(mkdirSyncMock).toHaveBeenCalledWith(
      "/tmp/test/.claude/skills/reviewer-skill",
      { recursive: true },
    );
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/tmp/test/.claude/skills/reviewer-skill/SKILL.md",
      "---\nname: reviewer\ndescription: test\n---\nReview code",
      "utf-8",
    );
    expect(fullScanMock).toHaveBeenCalled();
    expect(invalidateMarketplaceCacheMock).toHaveBeenCalled();
  });

  it("installs inline skill content for Codex using portable content", async () => {
    const { POST, GET } = await import("@/app/api/marketplace/install/route");

    const req = new Request("http://localhost/api/marketplace/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        url: "builtin://skills/codex-helper",
        name: "Codex Helper",
        targetProvider: "codex",
        config: {
          skillContent: "---\nname: codex-helper\n---\nDo codex work",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targetProvider).toBe("codex");

    const job = await waitForInstallJob(GET, body.jobId);
    expect(job.status).toBe("completed");
    expect(job.result).toMatchObject({
      installed: "codex-helper",
      method: "skill",
      targetProvider: "codex",
    });
    expect(saveCodexInstructionMock).toHaveBeenCalledWith(
      "codex-helper",
      "Do codex work\n",
    );
    expect(saveGeminiSkillMock).not.toHaveBeenCalled();
  });

  it("installs inline skill content for Gemini using portable content", async () => {
    const { POST, GET } = await import("@/app/api/marketplace/install/route");

    const req = new Request("http://localhost/api/marketplace/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "skill",
        url: "builtin://skills/gemini-helper",
        name: "Gemini Helper",
        targetProvider: "gemini",
        config: {
          skillContent: "---\nname: gemini-helper\n---\nDo gemini work",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.targetProvider).toBe("gemini");

    const job = await waitForInstallJob(GET, body.jobId);
    expect(job.status).toBe("completed");
    expect(job.result).toMatchObject({
      installed: "gemini-helper",
      method: "skill",
      targetProvider: "gemini",
    });
    expect(saveGeminiSkillMock).toHaveBeenCalledWith(
      "gemini-helper",
      "Do gemini work\n",
    );
    expect(saveCodexInstructionMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported provider/type combinations", async () => {
    const { POST } = await import("@/app/api/marketplace/install/route");

    const req = new Request("http://localhost/api/marketplace/install", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "hook",
        url: "builtin://hooks/lint-on-edit",
        name: "lint-on-edit",
        targetProvider: "codex",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Hook supports Claude only.",
    });
  });
});
