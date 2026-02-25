import { describe, it, expect, vi } from "vitest";

// Mock dependencies that skills.ts imports at module level
vi.mock("@/lib/db", () => ({
  getDb: () => ({ prepare: () => ({ all: () => [], run: () => {}, get: () => undefined }) }),
}));

vi.mock("@/lib/logger", () => ({
  skillLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
  indexerLog: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { deriveSkillName } from "@/lib/skills";

describe("deriveSkillName", () => {
  describe("modern SKILL.md paths", () => {
    it("extracts directory name from standard modern path", () => {
      expect(
        deriveSkillName(
          "SKILL.md",
          "/home/user/.claude/skills/my-skill/SKILL.md",
        ),
      ).toBe("my-skill");
    });

    it("extracts directory name from deeply nested skill path", () => {
      expect(
        deriveSkillName(
          "SKILL.md",
          "/home/user/.claude/skills/category/sub-category/deep-skill/SKILL.md",
        ),
      ).toBe("deep-skill");
    });

    it("extracts directory name from disabled modern path", () => {
      expect(
        deriveSkillName(
          "SKILL.md.disabled",
          "/home/user/.claude/skills/paused-skill/SKILL.md.disabled",
        ),
      ).toBe("paused-skill");
    });
  });

  describe("legacy command paths", () => {
    it("strips .md extension from legacy command file", () => {
      expect(
        deriveSkillName("review.md", "/home/user/.claude/commands/review.md"),
      ).toBe("review");
    });

    it("handles dots in the filename", () => {
      expect(
        deriveSkillName(
          "my.dotted.skill.md",
          "/home/user/.claude/commands/my.dotted.skill.md",
        ),
      ).toBe("my.dotted.skill");
    });

    it("strips .md.disabled for legacy disabled files", () => {
      expect(
        deriveSkillName(
          "old-command.md.disabled",
          "/home/user/.claude/commands/old-command.md.disabled",
        ),
      ).toBe("old-command");
    });
  });

  describe("edge cases", () => {
    it("handles filename with only .md extension", () => {
      expect(deriveSkillName(".md", "/some/path/.md")).toBe("");
    });

    it("handles project-scoped skill paths", () => {
      expect(
        deriveSkillName(
          "SKILL.md",
          "/Users/dev/my-project/.claude/skills/local-skill/SKILL.md",
        ),
      ).toBe("local-skill");
    });
  });
});
