import { describe, it, expect } from "vitest";
import { deriveSkillName } from "@/lib/skills";

describe("deriveSkillName", () => {
  it("extracts directory name for modern SKILL.md files", () => {
    expect(
      deriveSkillName(
        "SKILL.md",
        "/home/user/.claude/skills/code-review/SKILL.md",
      ),
    ).toBe("code-review");
  });

  it("extracts directory name for project SKILL.md files", () => {
    expect(
      deriveSkillName(
        "SKILL.md",
        "/Users/jaelee/projects/app/.claude/skills/agent-browser/SKILL.md",
      ),
    ).toBe("agent-browser");
  });

  it("strips .md for legacy command files", () => {
    expect(
      deriveSkillName(
        "refactor-clean.md",
        "/home/user/.claude/commands/refactor-clean.md",
      ),
    ).toBe("refactor-clean");
  });

  it("strips .md for other non-SKILL.md files", () => {
    expect(
      deriveSkillName("my-skill.md", "/home/user/.claude/skills/my-skill.md"),
    ).toBe("my-skill");
  });
});
