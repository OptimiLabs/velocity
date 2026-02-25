import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getGeminiSkill,
  listGeminiSkills,
  saveGeminiSkill,
  setGeminiSkillDisabled,
} from "@/lib/gemini/skills";

function readJson(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
    string,
    unknown
  >;
}

function readDisabledNames(settingsPath: string): string[] {
  const parsed = readJson(settingsPath);
  const skills = parsed.skills as Record<string, unknown> | undefined;
  const disabled = skills?.disabled;
  if (!Array.isArray(disabled)) return [];
  return disabled.filter((entry): entry is string => typeof entry === "string");
}

describe("gemini/skills disable parity", () => {
  let projectPath = "";

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), "gemini-skills-"));
  });

  afterEach(() => {
    if (projectPath) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("disables a project skill via settings list without renaming SKILL.md", () => {
    const content = "---\nname: parity\ndescription: test\n---\n# Body\n";
    const filePath = saveGeminiSkill("parity", content, projectPath);
    const settingsPath = path.join(projectPath, ".gemini", "settings.json");

    expect(fs.existsSync(filePath)).toBe(true);
    expect(setGeminiSkillDisabled("parity", true, projectPath)).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(`${filePath}.disabled`)).toBe(false);
    expect(readDisabledNames(settingsPath)).toContain("parity");

    const listed = listGeminiSkills([{ path: projectPath, name: "proj" }]).find(
      (skill) => skill.name === "parity",
    );
    expect(listed).toBeDefined();
    expect(listed?.disabled).toBe(true);
    expect(listed?.filePath).toBe(filePath);

    const byName = getGeminiSkill("parity", projectPath);
    expect(byName?.disabled).toBe(true);
  });

  it("re-enables a skill by removing it from settings disabled list", () => {
    saveGeminiSkill("re-enable-me", "# test\n", projectPath);
    const settingsPath = path.join(projectPath, ".gemini", "settings.json");

    expect(setGeminiSkillDisabled("re-enable-me", true, projectPath)).toBe(true);
    expect(readDisabledNames(settingsPath)).toContain("re-enable-me");

    expect(setGeminiSkillDisabled("re-enable-me", false, projectPath)).toBe(true);
    expect(readDisabledNames(settingsPath)).not.toContain("re-enable-me");

    const listed = listGeminiSkills([{ path: projectPath, name: "proj" }]).find(
      (skill) => skill.name === "re-enable-me",
    );
    expect(listed?.disabled).toBe(false);
  });

  it("migrates legacy SKILL.md.disabled files back to SKILL.md", () => {
    const skillDir = path.join(projectPath, ".gemini", "skills", "legacy");
    const activePath = path.join(skillDir, "SKILL.md");
    const disabledPath = `${activePath}.disabled`;
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(disabledPath, "# legacy\n", "utf-8");

    expect(setGeminiSkillDisabled("legacy", true, projectPath)).toBe(true);
    expect(fs.existsSync(activePath)).toBe(true);
    expect(fs.existsSync(disabledPath)).toBe(false);

    const listed = listGeminiSkills([{ path: projectPath, name: "proj" }]).find(
      (skill) => skill.name === "legacy",
    );
    expect(listed?.disabled).toBe(true);
  });

  it("injects required frontmatter when saving raw Gemini skill content", () => {
    const filePath = saveGeminiSkill(
      "frontmatter-check",
      "# Workflow\n\nDo work.\n",
      projectPath,
      "Use when running workflow commands",
    );
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(raw).toContain("name: frontmatter-check");
    expect(raw).toContain('description: "Use when running workflow commands"');
    expect(raw).toContain("# Workflow");
  });
});
