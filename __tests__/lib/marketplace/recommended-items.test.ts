import { describe, expect, it } from "vitest";
import {
  SKILL_CREATOR_GUIDE,
  getSkillCreatorGuide,
} from "@/lib/marketplace/recommended-items";

describe("marketplace/recommended-items", () => {
  it("exports Claude guide as the default compatibility constant", () => {
    expect(SKILL_CREATOR_GUIDE).toContain("Claude Code skill");
    expect(SKILL_CREATOR_GUIDE).toContain("~/.claude/skills/<name>/SKILL.md");
  });

  it("returns provider-native skill creation guides", () => {
    const codex = getSkillCreatorGuide("codex");
    const gemini = getSkillCreatorGuide("gemini");
    const all = getSkillCreatorGuide("all");

    expect(codex).toContain("Codex CLI skill");
    expect(codex).toContain("~/.codex/skills/<name>/SKILL.md");

    expect(gemini).toContain("Gemini CLI skill");
    expect(gemini).toContain("~/.gemini/skills/<name>/SKILL.md");

    expect(all).toContain("cross-provider skill");
    expect(all).toContain("Claude:");
    expect(all).toContain("Codex:");
    expect(all).toContain("Gemini:");
  });
});
