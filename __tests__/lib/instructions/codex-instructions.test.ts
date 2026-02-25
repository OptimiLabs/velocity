import { describe, it, expect } from "vitest";
import {
  PROJECT_PATTERNS,
  GLOBAL_PATTERNS,
  classifyFileType,
} from "@/lib/instructions/indexer";

describe("Codex instruction file discovery", () => {
  it("PROJECT_PATTERNS should include AGENTS.md", () => {
    const hasAgentsMd = PROJECT_PATTERNS.some((p: { pattern: RegExp }) =>
      p.pattern.test("AGENTS.md"),
    );
    expect(hasAgentsMd).toBe(true);
  });

  it("PROJECT_PATTERNS should include AGENTS.override.md", () => {
    const hasOverride = PROJECT_PATTERNS.some((p: { pattern: RegExp }) =>
      p.pattern.test("AGENTS.override.md"),
    );
    expect(hasOverride).toBe(true);
  });

  it("GLOBAL_PATTERNS should scan ~/.codex/ for AGENTS.md", () => {
    const hasCodexDir = GLOBAL_PATTERNS.some((p: { dir: string }) =>
      p.dir.includes(".codex"),
    );
    expect(hasCodexDir).toBe(true);
  });

  it("classifyFileType should handle AGENTS.md", () => {
    expect(classifyFileType("/project/AGENTS.md")).toBe("agents.md");
    expect(classifyFileType("/project/AGENTS.override.md")).toBe("agents.md");
  });
});
