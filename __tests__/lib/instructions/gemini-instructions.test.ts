import { describe, it, expect } from "vitest";
import {
  PROJECT_PATTERNS,
  GLOBAL_PATTERNS,
  classifyFileType,
} from "@/lib/instructions/indexer";

describe("Gemini instruction file discovery", () => {
  it("PROJECT_PATTERNS should include GEMINI.md", () => {
    const hasGeminiMd = PROJECT_PATTERNS.some((p: { pattern: RegExp }) =>
      p.pattern.test("GEMINI.md"),
    );
    expect(hasGeminiMd).toBe(true);
  });

  it("GLOBAL_PATTERNS should scan ~/.gemini/ for GEMINI.md", () => {
    const hasGeminiDir = GLOBAL_PATTERNS.some((p: { dir: string }) =>
      p.dir.includes(".gemini"),
    );
    expect(hasGeminiDir).toBe(true);
  });

  it("classifyFileType should handle GEMINI.md as CLAUDE.md type", () => {
    expect(classifyFileType("/project/GEMINI.md")).toBe("CLAUDE.md");
  });

  it("PROJECT_PATTERNS should include .gemini directory scan", () => {
    const hasGeminiSubdir = PROJECT_PATTERNS.some(
      (p: { relativePath: string }) => p.relativePath === ".gemini",
    );
    expect(hasGeminiSubdir).toBe(true);
  });
});
