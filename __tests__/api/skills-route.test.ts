import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveSkillMock = vi.fn();
const saveProjectSkillMock = vi.fn();
const setSkillDisabledMock = vi.fn();
const setProjectSkillDisabledMock = vi.fn();
const deleteSkillMock = vi.fn();
const deleteProjectSkillMock = vi.fn();

vi.mock("@/lib/skills", () => ({
  listAllSkills: vi.fn(() => []),
  saveSkill: saveSkillMock,
  saveProjectSkill: saveProjectSkillMock,
  getSkill: vi.fn(() => null),
  deleteSkill: deleteSkillMock,
  getProjectSkill: vi.fn(() => null),
  deleteProjectSkill: deleteProjectSkillMock,
  setSkillDisabled: setSkillDisabledMock,
  setProjectSkillDisabled: setProjectSkillDisabledMock,
}));

vi.mock("@/lib/db/workflows", () => ({
  listWorkflows: vi.fn(() => []),
}));

vi.mock("@/lib/codex/skills", () => ({
  listCodexInstructions: vi.fn(() => []),
  saveCodexInstruction: vi.fn(),
  getCodexInstruction: vi.fn(() => null),
  deleteCodexInstruction: vi.fn(() => true),
  setCodexInstructionDisabled: vi.fn(() => true),
}));

vi.mock("@/lib/gemini/skills", () => ({
  listGeminiSkills: vi.fn(() => []),
  saveGeminiSkill: vi.fn(),
  getGeminiSkill: vi.fn(() => null),
  deleteGeminiSkill: vi.fn(() => true),
  setGeminiSkillDisabled: vi.fn(() => true),
}));

vi.mock("@/lib/logger", () => ({
  apiLog: { error: vi.fn() },
}));

describe("skills routes validation", () => {
  beforeEach(() => {
    saveSkillMock.mockReset();
    saveProjectSkillMock.mockReset();
    setSkillDisabledMock.mockReset();
    setProjectSkillDisabledMock.mockReset();
    deleteSkillMock.mockReset();
    deleteProjectSkillMock.mockReset();
    setSkillDisabledMock.mockReturnValue(true);
    setProjectSkillDisabledMock.mockReturnValue(true);
    deleteSkillMock.mockReturnValue(true);
    deleteProjectSkillMock.mockReturnValue(true);
  });

  it("POST /api/skills rejects invalid names", async () => {
    const { POST } = await import("@/app/api/skills/route");
    const req = new Request("http://localhost/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "../escape",
        content: "# test",
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "INVALID_SKILL_NAME",
    });
    expect(saveSkillMock).not.toHaveBeenCalled();
  });

  it("POST /api/skills normalizes skill names before save", async () => {
    const { POST } = await import("@/app/api/skills/route");
    const req = new Request("http://localhost/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  My Review Skill  ",
        description: "  reviews code  ",
        content: "# Body",
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, name: "my-review-skill" });
    expect(saveSkillMock).toHaveBeenCalledWith(
      "my-review-skill",
      "reviews code",
      "# Body",
      undefined,
    );
  });

  it("POST /api/skills resolves project paths before save", async () => {
    const { POST } = await import("@/app/api/skills/route");
    const req = new Request("http://localhost/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "project-skill",
        content: "## content",
        projectPath: "~/demo-project",
      }),
    });

    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(saveProjectSkillMock).toHaveBeenCalledTimes(1);
    expect(saveProjectSkillMock.mock.calls[0][0]).toBe(
      path.resolve(path.join(os.homedir(), "demo-project")),
    );
  });

  it("PUT /api/skills/[name] rejects unsafe route params", async () => {
    const { PUT } = await import("@/app/api/skills/[name]/route");
    const req = new Request("http://localhost/api/skills/%2E%2E%2Fbad", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "ok" }),
    });

    const res = await PUT(req as never, {
      params: Promise.resolve({ name: "../bad" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "INVALID_SKILL_NAME",
    });
    expect(saveSkillMock).not.toHaveBeenCalled();
  });

  it("PUT /api/skills/[name] rejects empty content", async () => {
    const { PUT } = await import("@/app/api/skills/[name]/route");
    const req = new Request("http://localhost/api/skills/reviewer", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "   " }),
    });

    const res = await PUT(req as never, {
      params: Promise.resolve({ name: "reviewer" }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "EMPTY_CONTENT" });
  });

  it("PATCH /api/skills/[name] validates project path and delegates toggle", async () => {
    const { PATCH } = await import("@/app/api/skills/[name]/route");
    const req = new Request("http://localhost/api/skills/reviewer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        disabled: true,
        projectPath: "~/demo-project",
      }),
    });

    const res = await PATCH(req as never, {
      params: Promise.resolve({ name: "reviewer" }),
    });

    expect(res.status).toBe(200);
    expect(setProjectSkillDisabledMock).toHaveBeenCalledWith(
      path.resolve(path.join(os.homedir(), "demo-project")),
      "reviewer",
      true,
    );
  });
});
