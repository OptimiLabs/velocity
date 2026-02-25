import { describe, it, expect } from "vitest";
import { categorizeFilePath } from "@/lib/parser/session-utils";

describe("categorizeFilePath for Codex paths", () => {
  it("should categorize ~/.codex/AGENTS.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/.codex/AGENTS.md")).toBe("instruction");
  });

  it("should categorize project AGENTS.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/AGENTS.md")).toBe(
      "instruction",
    );
  });

  it("should categorize AGENTS.override.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/AGENTS.override.md")).toBe(
      "instruction",
    );
  });

  it("should categorize .codex/config.toml as config", () => {
    expect(categorizeFilePath("/Users/x/.codex/config.toml")).toBe("config");
  });

  it("should categorize .codex/ directory files as config", () => {
    expect(categorizeFilePath("/Users/x/.codex/settings.json")).toBe("config");
  });

  // Existing Claude paths should still work
  it("should still categorize CLAUDE.md as instruction", () => {
    expect(categorizeFilePath("/Users/x/project/CLAUDE.md")).toBe(
      "instruction",
    );
  });

  it("should still categorize .claude/knowledge/ as knowledge", () => {
    expect(categorizeFilePath("/Users/x/.claude/knowledge/topic.md")).toBe(
      "knowledge",
    );
  });
});
