import { describe, test, expect } from "vitest";
import { validateHookConfig } from "@/lib/hooks/validate";

describe("generation output validation", () => {
  test("catches agent type generated for PostToolUse", () => {
    const result = validateHookConfig("PostToolUse", {
      type: "agent",
      prompt: "review code",
      matcher: "Edit",
    });
    expect(result.valid).toBe(false);
  });

  test("catches missing matcher on tool event", () => {
    const result = validateHookConfig("PreToolUse", {
      type: "prompt",
      prompt: "check stuff",
    });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
