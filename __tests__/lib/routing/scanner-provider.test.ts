import { describe, expect, it } from "vitest";
import {
  classifyNodeType,
  inferRoutingProvider,
} from "@/lib/routing/scanner";

describe("routing scanner provider parity helpers", () => {
  it("infers provider from provider entrypoint filenames", () => {
    expect(inferRoutingProvider("/Users/test/repo/AGENTS.md")).toBe("codex");
    expect(inferRoutingProvider("/Users/test/repo/AGENTS.override.md")).toBe("codex");
    expect(inferRoutingProvider("/Users/test/repo/GEMINI.md")).toBe("gemini");
    expect(inferRoutingProvider("/Users/test/repo/CLAUDE.md")).toBe("claude");
  });

  it("infers gemini provider from configured context filename", () => {
    expect(
      inferRoutingProvider("/Users/test/repo/PROJECT_CONTEXT.md", undefined, {
        projectPath: "/Users/test/repo",
        geminiContextFileName: "PROJECT_CONTEXT.md",
      }),
    ).toBe("gemini");
  });

  it("infers provider from provider directories", () => {
    expect(
      inferRoutingProvider("/Users/test/.codex/instructions/review.md"),
    ).toBe("codex");
    expect(inferRoutingProvider("/Users/test/.agents/skills/review.md")).toBe(
      "codex",
    );
    expect(inferRoutingProvider("/Users/test/repo/.agents/skills/review.md")).toBe(
      "codex",
    );
    expect(inferRoutingProvider("/Users/test/repo/.codex/prompts/setup.md")).toBe(
      "codex",
    );

    expect(inferRoutingProvider("/Users/test/.gemini/rules/guide.md")).toBe(
      "gemini",
    );
    expect(inferRoutingProvider("/Users/test/repo/.gemini/notes.md")).toBe(
      "gemini",
    );

    expect(inferRoutingProvider("/Users/test/.claude/skills/x/SKILL.md")).toBe(
      "claude",
    );
    expect(inferRoutingProvider("/Users/test/repo/.claude.local/notes.md")).toBe(
      "claude",
    );
  });

  it("returns null for generic non-provider files", () => {
    expect(inferRoutingProvider("/Users/test/repo/docs/context.md")).toBeNull();
  });

  it("classifies codex AGENTS entrypoints as routing entrypoint files", () => {
    expect(classifyNodeType("/Users/test/repo/AGENTS.md", "agents.md")).toBe(
      "claude-md",
    );
    expect(
      classifyNodeType("/Users/test/repo/AGENTS.override.md", "agents.md"),
    ).toBe("claude-md");
  });

  it("keeps lowercase claude agents.md files classified as agents", () => {
    expect(
      classifyNodeType("/Users/test/.claude/agents/reviewer/agents.md", "agents.md"),
    ).toBe("agent");
  });

  it("classifies gemini entrypoints as routing entrypoint files", () => {
    expect(classifyNodeType("/Users/test/repo/GEMINI.md", "CLAUDE.md")).toBe(
      "claude-md",
    );
    expect(classifyNodeType("/Users/test/repo/GEMINI.md")).toBe("claude-md");
  });

  it("classifies configured gemini context filename as routing entrypoint", () => {
    expect(
      classifyNodeType("/Users/test/repo/PROJECT_CONTEXT.md", undefined, {
        projectPath: "/Users/test/repo",
        geminiContextFileName: "PROJECT_CONTEXT.md",
      }),
    ).toBe("claude-md");
  });
});
