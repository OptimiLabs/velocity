import { describe, expect, it } from "vitest";
import {
  buildCliLaunchConfig,
  inferProviderFromCommand,
  inferProviderFromModel,
  isCliProviderEnabled,
} from "@/lib/console/cli-launch";

describe("cli-launch helpers", () => {
  it("respects provider enable flags", () => {
    expect(isCliProviderEnabled(undefined, "claude")).toBe(true);
    expect(
      isCliProviderEnabled({ claudeCliEnabled: false }, "claude"),
    ).toBe(false);
    expect(isCliProviderEnabled({ codexCliEnabled: false }, "codex")).toBe(
      false,
    );
    expect(isCliProviderEnabled({ geminiCliEnabled: false }, "gemini")).toBe(
      false,
    );
  });

  it("builds claude launch config with model/effort and resume args", () => {
    const config = buildCliLaunchConfig({
      provider: "claude",
      model: "claude-sonnet-4-6",
      effort: "high",
      env: { FOO: "bar" },
      claudeSessionId: "resume-123",
      skipPermissions: true,
    });

    expect(config.command).toBe("claude");
    expect(config.args).toEqual([
      "--model",
      "claude-sonnet-4-6",
      "--resume",
      "resume-123",
      "--dangerously-skip-permissions",
    ]);
    expect(config.env).toMatchObject({
      CLAUDE_CODE_EFFORT_LEVEL: "high",
      FOO: "bar",
    });
    expect(config.isClaudeSession).toBe(true);
  });

  it("builds codex launch config with model/effort overrides", () => {
    const config = buildCliLaunchConfig({
      provider: "codex",
      model: "o3",
      effort: "medium",
      env: { OPENAI_API_KEY: "x" },
    });

    expect(config.command).toBe("codex");
    expect(config.args).toEqual([
      "--model",
      "o3",
      "-c",
      'model_reasoning_effort="medium"',
    ]);
    expect(config.env).toEqual({ OPENAI_API_KEY: "x" });
    expect(config.isClaudeSession).toBe(false);
  });

  it("builds gemini launch config without forcing flags", () => {
    const config = buildCliLaunchConfig({
      provider: "gemini",
      model: "gemini-2.5-pro",
      env: { GOOGLE_API_KEY: "x" },
    });

    expect(config.command).toBe("gemini");
    expect(config.args).toEqual([]);
    expect(config.env).toEqual({ GOOGLE_API_KEY: "x" });
    expect(config.isClaudeSession).toBe(false);
  });

  it("infers provider from command/model hints", () => {
    expect(inferProviderFromCommand("codex")).toBe("codex");
    expect(inferProviderFromCommand("gemini")).toBe("gemini");
    expect(inferProviderFromCommand("claude")).toBe("claude");
    expect(inferProviderFromModel("gpt-5")).toBe("codex");
    expect(inferProviderFromModel("gemini-2.5-pro")).toBe("gemini");
    expect(inferProviderFromModel("claude-sonnet-4-6")).toBe("claude");
  });
});
