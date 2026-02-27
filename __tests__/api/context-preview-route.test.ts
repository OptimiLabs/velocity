import { describe, expect, it } from "vitest";
import {
  getRuntimeBaseEstimate,
  resolveIngestionMode,
} from "@/app/api/context/preview/logic";

describe("context preview ingestion mode", () => {
  it("treats root context files as always-loaded", () => {
    expect(
      resolveIngestionMode({
        provider: "claude",
        fileType: "CLAUDE.md",
        fileName: "CLAUDE.md",
      }),
    ).toBe("always");
  });

  it("treats codex AGENTS.md files as always-loaded", () => {
    expect(
      resolveIngestionMode({
        provider: "codex",
        fileType: "agents.md",
        fileName: "AGENTS.md",
      }),
    ).toBe("always");
    expect(
      resolveIngestionMode({
        provider: "codex",
        fileType: "agents.md",
        fileName: "AGENTS.override.md",
      }),
    ).toBe("always");
  });

  it("treats skills and non-root agent files as on-demand", () => {
    expect(
      resolveIngestionMode({
        provider: "claude",
        fileType: "skill.md",
        fileName: "deps-audit.md",
      }),
    ).toBe("on-demand");
    expect(
      resolveIngestionMode({
        provider: "codex",
        fileType: "agents.md",
        fileName: "backend-architect.md",
      }),
    ).toBe("on-demand");
  });

  it("returns no base runtime estimate heuristics for any provider", () => {
    expect(getRuntimeBaseEstimate("claude")).toEqual({
      systemPromptTokens: 0,
      systemToolsTokens: 0,
      source: "none",
    });
    expect(getRuntimeBaseEstimate("codex")).toEqual({
      systemPromptTokens: 0,
      systemToolsTokens: 0,
      source: "none",
    });
    expect(getRuntimeBaseEstimate("gemini")).toEqual({
      systemPromptTokens: 0,
      systemToolsTokens: 0,
      source: "none",
    });
  });
});
