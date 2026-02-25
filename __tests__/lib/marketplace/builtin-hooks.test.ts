import { describe, expect, it } from "vitest";
import {
  BUILTIN_HOOK_TEMPLATES,
  INLINE_TEMPLATES,
  getBuiltinHookItems,
} from "@/lib/marketplace/builtin-hooks";

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
    const lintTemplate = BUILTIN_HOOK_TEMPLATES.find(
      (template) => template.url === "builtin://hooks/lint-on-edit",
    );
    const lintCommand = lintTemplate?.hookConfig?.hook.command;
    expect(typeof lintCommand).toBe("string");

    const hooks = getBuiltinHookItems("", "hook", {
      PostToolUse: [
        {
          matcher: "Edit|Write",
          hooks: [
            {
              type: "command",
              command: lintCommand as string,
              timeout: 10,
            },
          ],
        },
      ],
    });

    const lintHook = hooks.find((h) => h.url === "builtin://hooks/lint-on-edit");
    expect(lintHook?.installed).toBe(true);
  });

  it("ships unique builtin template URLs", () => {
    const urls = BUILTIN_HOOK_TEMPLATES.map((template) => template.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("includes prompt-based templates in inline quick start", () => {
    expect(
      INLINE_TEMPLATES.some(
        (template) => template.hookConfig?.hook.type === "prompt",
      ),
    ).toBe(true);
  });
});
