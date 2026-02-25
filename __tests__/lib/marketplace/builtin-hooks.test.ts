import { describe, expect, it } from "vitest";
import { getBuiltinHookItems } from "@/lib/marketplace/builtin-hooks";

describe("marketplace builtin hooks", () => {
  it("adds token estimates for hook templates", () => {
    const hooks = getBuiltinHookItems("", "hook");
    expect(hooks.length).toBeGreaterThan(0);
    expect(
      hooks.every(
        (hook) =>
          typeof hook.estimatedTokens === "number" && hook.estimatedTokens > 0,
      ),
    ).toBe(true);
  });

  it("marks installed hooks based on settings hooks", () => {
    const hooks = getBuiltinHookItems("", "hook", {
      PostToolUse: [
        {
          matcher: "Edit|Write",
          hooks: [
            {
              type: "command",
              command: 'npx eslint --fix "$FILE"',
              timeout: 10,
            },
          ],
        },
      ],
    });

    const lintHook = hooks.find((h) => h.url === "builtin://hooks/lint-on-edit");
    expect(lintHook?.installed).toBe(true);
  });
});
