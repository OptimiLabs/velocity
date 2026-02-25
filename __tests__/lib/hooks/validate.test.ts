import { describe, test, expect } from "vitest";
import { validateHookConfig } from "@/lib/hooks/validate";

describe("validateHookConfig", () => {
  test("rejects agent type on high-frequency events", () => {
    const result = validateHookConfig("PreToolUse", {
      type: "agent",
      prompt: "check stuff",
      matcher: "Bash",
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/too slow/i);
  });

  test("warns when tool event has no matcher for prompt type", () => {
    const result = validateHookConfig("PostToolUse", {
      type: "prompt",
      prompt: "check",
    });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/every tool call/i);
  });

  test("errors when $FILE used without file-tool matcher", () => {
    const result = validateHookConfig("PostToolUse", {
      type: "command",
      command: 'eslint "$FILE"',
      matcher: "Bash",
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/\$FILE/i);
  });

  test("errors when $COMMAND used without Bash matcher", () => {
    const result = validateHookConfig("PreToolUse", {
      type: "command",
      command: 'echo "$COMMAND"',
      matcher: "Edit",
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/\$COMMAND/i);
  });

  test("errors on invalid regex matcher", () => {
    const result = validateHookConfig("PreToolUse", {
      type: "command",
      command: "echo hi",
      matcher: "[invalid(",
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/regex/i);
  });

  test("warns on high timeout for high-frequency event", () => {
    const result = validateHookConfig("PostToolUse", {
      type: "command",
      command: "sleep 60",
      matcher: "Edit",
      timeout: 60,
    });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/timeout/i);
  });

  test("passes valid command hook", () => {
    const result = validateHookConfig("PostToolUse", {
      type: "command",
      command: 'npx eslint --fix "$FILE"',
      matcher: "Edit|Write",
      timeout: 10,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("passes valid prompt hook on Stop", () => {
    const result = validateHookConfig("Stop", {
      type: "prompt",
      prompt: "Check for failures",
      timeout: 15,
    });
    expect(result.valid).toBe(true);
  });

  test("passes valid agent hook on SessionStart", () => {
    const result = validateHookConfig("SessionStart", {
      type: "agent",
      prompt: "Verify project setup",
    });
    expect(result.valid).toBe(true);
  });
});
