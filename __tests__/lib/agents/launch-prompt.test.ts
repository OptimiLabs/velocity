import { describe, expect, test } from "vitest";
import { composeAgentLaunchPrompt } from "@/lib/agents/launch-prompt";

describe("composeAgentLaunchPrompt", () => {
  test("returns base prompt unchanged when no launch constraints exist", () => {
    const prompt = composeAgentLaunchPrompt({
      name: "plain-agent",
      prompt: "Follow repository conventions.",
    });

    expect(prompt).toBe("Follow repository conventions.");
  });

  test("appends launch profile with model/tools/skills constraints", () => {
    const prompt = composeAgentLaunchPrompt({
      name: "qa-agent",
      provider: "claude",
      prompt: "Run focused QA checks.",
      model: "claude-sonnet-4-6",
      effort: "high",
      skills: ["qa", "config-validate"],
      tools: ["Read", "Bash", "mcp__filesystem__read_file"],
      disallowedTools: ["DeleteFile", "WriteFile"],
    });

    expect(prompt).toContain("Run focused QA checks.");
    expect(prompt).toContain("Launch Profile (apply while executing this agent):");
    expect(prompt).toContain("- Preferred model: claude-sonnet-4-6");
    expect(prompt).toContain("- Thinking effort: high");
    expect(prompt).toContain("- Skills to leverage: qa, config-validate");
    expect(prompt).toContain("- Preferred tools: Read, Bash, mcp__filesystem__read_file");
    expect(prompt).toContain("- Disallowed tools: DeleteFile, WriteFile");
    expect(prompt).toContain(
      "- Use listed MCP/plugin-backed tools by exact name when relevant.",
    );
  });
});
