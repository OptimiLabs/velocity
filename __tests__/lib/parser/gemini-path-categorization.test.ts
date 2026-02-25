import { describe, it, expect } from "vitest";
import { categorizeFilePath } from "@/lib/parser/session-utils";

describe("categorizeFilePath for Gemini paths", () => {
  it("categorizes GEMINI.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/GEMINI.md")).toBe(
      "instruction",
    );
  });
  it("categorizes ~/.gemini/GEMINI.md as instruction (not config)", () => {
    expect(categorizeFilePath("/Users/x/.gemini/GEMINI.md")).toBe(
      "instruction",
    );
  });
  it("categorizes .gemini/settings.json as config", () => {
    expect(categorizeFilePath("/Users/x/.gemini/settings.json")).toBe("config");
  });
  it("categorizes .gemini/ directory files as config", () => {
    expect(categorizeFilePath("/Users/x/project/.gemini/something.json")).toBe(
      "config",
    );
  });
  // Regression tests
  it("still categorizes CLAUDE.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/CLAUDE.md")).toBe(
      "instruction",
    );
  });
  it("still categorizes AGENTS.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/AGENTS.md")).toBe(
      "instruction",
    );
  });
  it("still categorizes .codex/ as config", () => {
    expect(categorizeFilePath("/Users/x/.codex/config.toml")).toBe("config");
  });
});
