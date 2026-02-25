import { beforeEach, describe, expect, it, vi } from "vitest";

const mkdirMock = vi.fn();
const writeFileMock = vi.fn();
const homedirMock = vi.fn(() => "/home/test");

const getSkillMock = vi.fn();
const getProjectSkillMock = vi.fn();
const getCodexInstructionMock = vi.fn();
const getGeminiSkillMock = vi.fn();

vi.mock("fs/promises", () => ({
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}));

vi.mock("os", () => ({
  homedir: homedirMock,
}));

vi.mock("@/lib/skills", () => ({
  getSkill: getSkillMock,
  getProjectSkill: getProjectSkillMock,
}));

vi.mock("@/lib/codex/skills", () => ({
  getCodexInstruction: getCodexInstructionMock,
}));

vi.mock("@/lib/gemini/skills", () => ({
  getGeminiSkill: getGeminiSkillMock,
}));

describe("POST /api/tools/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mkdirMock.mockResolvedValue(undefined);
    writeFileMock.mockResolvedValue(undefined);
    homedirMock.mockReturnValue("/home/test");
  });

  it("bundles provider-aware skills and resolves duplicate names", async () => {
    getSkillMock.mockReturnValue({
      name: "analysis-helper",
      description: "Claude helper",
      content: "Analyze logs and summarize root cause.",
      isCustom: true,
    });
    getCodexInstructionMock.mockReturnValue({
      name: "analysis-helper",
      description: "Codex helper",
      content: "---\nname: analysis-helper\ndescription: Codex helper\n---\nDo codex work",
    });
    getGeminiSkillMock.mockReturnValue({
      name: "gemini-helper",
      content: "Handle Gemini specific triage.",
    });

    const { POST } = await import("@/app/api/tools/export/route");
    const req = new Request("http://localhost/api/tools/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pluginName: "bundle-demo",
        description: "Bundled skills",
        skills: [
          { name: "analysis-helper", provider: "claude" },
          { name: "analysis-helper", provider: "codex" },
          { name: "gemini-helper", provider: "gemini" },
        ],
      }),
    });

    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.exported).toBe(3);
    expect(body.path).toBe("/home/test/.claude/plugins/bundle-demo");
    expect(body.structure).toContain("skills/analysis-helper/SKILL.md");
    expect(body.structure).toContain("skills/analysis-helper-2/SKILL.md");
    expect(body.structure).toContain("skills/gemini-helper/SKILL.md");

    const writeTargets = writeFileMock.mock.calls.map((call) => call[0]);
    expect(writeTargets).toContain(
      "/home/test/.claude/plugins/bundle-demo/skills/analysis-helper/SKILL.md",
    );
    expect(writeTargets).toContain(
      "/home/test/.claude/plugins/bundle-demo/skills/analysis-helper-2/SKILL.md",
    );
    expect(writeTargets).toContain(
      "/home/test/.claude/plugins/bundle-demo/skills/gemini-helper/SKILL.md",
    );

    const firstSkillWrite = writeFileMock.mock.calls.find((call) =>
      String(call[0]).includes("skills/analysis-helper/SKILL.md"),
    );
    expect(firstSkillWrite?.[1]).toContain("name: analysis-helper");
    expect(firstSkillWrite?.[1]).toContain("description: \"Claude helper\"");
  });

  it("returns 400 when selected skills cannot be resolved", async () => {
    getSkillMock.mockReturnValue(null);
    getProjectSkillMock.mockReturnValue(null);
    getCodexInstructionMock.mockReturnValue(null);
    getGeminiSkillMock.mockReturnValue(null);

    const { POST } = await import("@/app/api/tools/export/route");
    const req = new Request("http://localhost/api/tools/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pluginName: "empty-bundle",
        skills: [{ name: "missing-skill", provider: "claude" }],
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "None of the selected skills could be resolved. Refresh and try again.",
    });
  });
});
