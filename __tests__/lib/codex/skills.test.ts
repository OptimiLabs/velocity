import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCodexInstructionDirs,
  listCodexInstructions,
  saveCodexInstruction,
  setCodexInstructionDisabled,
  deleteCodexInstruction,
} from "@/lib/codex/skills";
import {
  CODEX_SKILLS_DIR,
  projectCodexLegacySkillsDir,
  projectCodexInstructionsDir,
  projectCodexSkillsDir,
} from "@/lib/codex/paths";

const tempDirs: string[] = [];

function makeTempProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-skills-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

describe("codex skill canonical path cutover", () => {
  it("exposes only canonical .codex/skills directories", () => {
    expect(getCodexInstructionDirs()).toEqual([CODEX_SKILLS_DIR]);
    const projectPath = makeTempProjectDir();
    expect(getCodexInstructionDirs(projectPath)).toEqual([
      projectCodexSkillsDir(projectPath),
    ]);
  });

  it("saves project skills under .codex/skills without touching legacy directories", () => {
    const projectPath = makeTempProjectDir();
    const legacyAgentsFile = path.join(
      projectCodexLegacySkillsDir(projectPath),
      "review.md",
    );
    const legacyInstructionsFile = path.join(
      projectCodexInstructionsDir(projectPath),
      "review.md",
    );
    fs.mkdirSync(path.dirname(legacyAgentsFile), { recursive: true });
    fs.mkdirSync(path.dirname(legacyInstructionsFile), { recursive: true });
    fs.writeFileSync(legacyAgentsFile, "legacy", "utf-8");
    fs.writeFileSync(legacyInstructionsFile, "legacy", "utf-8");

    const savedPath = saveCodexInstruction("review", "new content", projectPath);
    const canonicalPath = path.join(
      projectCodexSkillsDir(projectPath),
      "review",
      "SKILL.md",
    );

    expect(savedPath).toBe(canonicalPath);
    expect(fs.existsSync(canonicalPath)).toBe(true);
    const savedContent = fs.readFileSync(canonicalPath, "utf-8");
    expect(savedContent).toContain("name: review");
    expect(savedContent).toContain("new content");
    expect(fs.existsSync(legacyAgentsFile)).toBe(true);
    expect(fs.existsSync(legacyInstructionsFile)).toBe(true);
  });

  it("ignores legacy directories when listing codex skills", () => {
    const projectPath = makeTempProjectDir();
    const canonicalSkillPath = path.join(
      projectCodexSkillsDir(projectPath),
      "canonical",
      "SKILL.md",
    );
    const legacySkillPath = path.join(
      projectCodexLegacySkillsDir(projectPath),
      "legacy.md",
    );
    const legacyInstructionPath = path.join(
      projectCodexInstructionsDir(projectPath),
      "legacy-instruction.md",
    );

    fs.mkdirSync(path.dirname(canonicalSkillPath), { recursive: true });
    fs.mkdirSync(path.dirname(legacySkillPath), { recursive: true });
    fs.mkdirSync(path.dirname(legacyInstructionPath), { recursive: true });
    fs.writeFileSync(
      canonicalSkillPath,
      "---\nname: canonical\ndescription: canonical skill\n---\n\nbody\n",
      "utf-8",
    );
    fs.writeFileSync(legacySkillPath, "legacy skill", "utf-8");
    fs.writeFileSync(legacyInstructionPath, "legacy instruction", "utf-8");

    const listed = listCodexInstructions([{ path: projectPath, name: "demo" }]);
    const names = listed.map((item) => item.name);

    expect(names).toContain("canonical");
    expect(names).not.toContain("legacy");
    expect(names).not.toContain("legacy-instruction");
  });

  it("toggles disabled state and deletes from canonical directory", () => {
    const projectPath = makeTempProjectDir();
    const canonicalPath = saveCodexInstruction("lint-check", "echo ok", projectPath);
    const disabledPath = `${canonicalPath}.disabled`;

    expect(setCodexInstructionDisabled("lint-check", true, projectPath)).toBe(
      true,
    );
    expect(fs.existsSync(canonicalPath)).toBe(false);
    expect(fs.existsSync(disabledPath)).toBe(true);

    expect(setCodexInstructionDisabled("lint-check", false, projectPath)).toBe(
      true,
    );
    expect(fs.existsSync(canonicalPath)).toBe(true);
    expect(fs.existsSync(disabledPath)).toBe(false);

    expect(deleteCodexInstruction("lint-check", projectPath)).toBe(true);
    expect(fs.existsSync(canonicalPath)).toBe(false);
    expect(fs.existsSync(disabledPath)).toBe(false);
  });
});
