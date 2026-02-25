import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const saveSkillMock = vi.fn();
const saveProjectSkillMock = vi.fn();
const saveCodexInstructionMock = vi.fn();
const saveGeminiSkillMock = vi.fn();
const writeTomlMock = vi.fn();

vi.mock("@/lib/skills", () => ({
  saveSkill: saveSkillMock,
  saveProjectSkill: saveProjectSkillMock,
}));

vi.mock("@/lib/codex/skills", () => ({
  saveCodexInstruction: saveCodexInstructionMock,
}));

vi.mock("@/lib/gemini/skills", () => ({
  saveGeminiSkill: saveGeminiSkillMock,
}));

vi.mock("@/lib/codex/toml", () => ({
  writeToml: writeTomlMock,
}));

describe("conversion save parity", () => {
  beforeEach(() => {
    saveSkillMock.mockReset();
    saveProjectSkillMock.mockReset();
    saveCodexInstructionMock.mockReset();
    saveGeminiSkillMock.mockReset();
    writeTomlMock.mockReset();
    saveCodexInstructionMock.mockReturnValue("/tmp/codex-skill");
    saveGeminiSkillMock.mockReturnValue("/tmp/gemini-skill");
  });

  it("saves global converted skills for claude/codex/gemini and writes Gemini slash command", async () => {
    const { convertSkillTargets, saveConvertedResults } = await import(
      "@/lib/conversion/artifacts"
    );

    const baseSkill = {
      name: "security-review",
      description: "Review code for auth issues",
      content: "## Checklist\n- Verify authz",
      visibility: "global" as const,
    };

    const results = convertSkillTargets(baseSkill, "all");
    const saved = await saveConvertedResults({
      artifactType: "skill",
      baseSkill,
      results,
    });

    expect(saved).toHaveLength(3);
    expect(saved.every((item) => item.saved)).toBe(true);

    expect(saveSkillMock).toHaveBeenCalledWith(
      "security-review",
      "Review code for auth issues",
      "## Checklist\n- Verify authz",
      undefined,
    );
    expect(saveProjectSkillMock).not.toHaveBeenCalled();

    expect(saveCodexInstructionMock).toHaveBeenCalledTimes(1);
    expect(saveCodexInstructionMock.mock.calls[0][0]).toBe("security-review");
    expect(saveCodexInstructionMock.mock.calls[0][2]).toBeUndefined();

    expect(saveGeminiSkillMock).toHaveBeenCalledTimes(1);
    expect(saveGeminiSkillMock.mock.calls[0][0]).toBe("security-review");
    expect(saveGeminiSkillMock.mock.calls[0][2]).toBeUndefined();

    expect(writeTomlMock).toHaveBeenCalledWith(
      path.join(os.homedir(), ".gemini", "commands", "security-review.toml"),
      {
        prompt: "## Checklist\n- Verify authz\n",
        description: "Review code for auth issues",
      },
    );
  });

  it("saves project-scoped converted skills for claude/codex/gemini and writes project Gemini slash command", async () => {
    const { convertSkillTargets, saveConvertedResults } = await import(
      "@/lib/conversion/artifacts"
    );

    const projectPath = "/tmp/convert-project";
    const baseSkill = {
      name: "release-check",
      description: "Run pre-release checks",
      content: "Run tests and smoke checks",
      visibility: "project" as const,
      projectPath,
    };

    const results = convertSkillTargets(baseSkill, "all");
    const saved = await saveConvertedResults({
      artifactType: "skill",
      baseSkill,
      results,
    });

    expect(saved).toHaveLength(3);
    expect(saved.every((item) => item.saved)).toBe(true);

    expect(saveProjectSkillMock).toHaveBeenCalledWith(
      projectPath,
      "release-check",
      "Run pre-release checks",
      "Run tests and smoke checks",
      undefined,
    );
    expect(saveSkillMock).not.toHaveBeenCalled();

    expect(saveCodexInstructionMock).toHaveBeenCalledWith(
      "release-check",
      expect.any(String),
      projectPath,
    );
    expect(saveGeminiSkillMock).toHaveBeenCalledWith(
      "release-check",
      expect.any(String),
      projectPath,
    );

    expect(writeTomlMock).toHaveBeenCalledWith(
      path.join(projectPath, ".gemini", "commands", "release-check.toml"),
      {
        prompt: "Run tests and smoke checks\n",
        description: "Run pre-release checks",
      },
    );
  });
});
