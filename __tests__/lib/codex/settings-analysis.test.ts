import { describe, expect, it } from "vitest";
import {
  deepMergeCodexSettings,
  findUnsupportedCodexKeyPaths,
  fromCodexUiPatch,
  toCodexUiModel,
} from "@/lib/codex/settings-analysis";

describe("findUnsupportedCodexKeyPaths", () => {
  it("lists unsupported nested keys and skips supported ones", () => {
    const unsupported = findUnsupportedCodexKeyPaths({
      model: "o3",
      sandbox: {
        enable: true,
        extraMode: "strict",
      },
      history: {
        persistence: "save-all",
        max_entries: 500,
      },
      providers: {
        openai: {
          base_url: "https://example.com",
          api_key: "secret",
        },
      },
    });

    expect(unsupported).toEqual([
      "providers.openai.api_key",
      "providers.openai.base_url",
      "sandbox.extraMode",
    ]);
  });
});

describe("deepMergeCodexSettings", () => {
  it("deep merges nested objects and preserves unsupported keys", () => {
    const merged = deepMergeCodexSettings(
      {
        model: "o3",
        sandbox_mode: "workspace-write",
        sandbox: {
          enable: false,
          extraMode: "strict",
        } as { enable?: boolean; extraMode?: string },
        history: {
          persistence: "save-all",
          max_entries: 1000,
        },
        providers: {
          openai: {
            base_url: "https://example.com",
          },
        },
      },
      {
        sandbox: { enable: true },
        history: { persistence: "none" },
      },
    );

    expect(merged.sandbox).toEqual({
      enable: true,
      extraMode: "strict",
    });
    expect(merged.history).toEqual({
      persistence: "none",
      max_entries: 1000,
    });
    expect(merged.providers).toEqual({
      openai: { base_url: "https://example.com" },
    });
  });
});

describe("Codex UI mapping", () => {
  it("maps legacy approval_mode and boolean-style toggles", () => {
    const ui = toCodexUiModel({
      approval_mode: "full-auto",
      web_search: "cached",
      sandbox: { enable: true },
      sandbox_mode: "danger-full-access",
      history: { persistence: "none" },
      model_reasoning_effort: "high",
    });

    expect(ui.approvalPolicy).toBe("never");
    expect(ui.webSearchEnabled).toBe(true);
    expect(ui.sandboxEnabled).toBe(true);
    expect(ui.sandboxMode).toBe("danger-full-access");
    expect(ui.historyEnabled).toBe(false);
    expect(ui.reasoningEffort).toBe("high");
  });

  it("converts UI patch fields into codex config keys", () => {
    const patch = fromCodexUiPatch({
      model: "o4-mini",
      approvalPolicy: "on-request",
      sandboxEnabled: true,
      sandboxMode: "workspace-write",
      webSearchEnabled: false,
      reasoningEffort: "medium",
      historyEnabled: true,
    });

    expect(patch).toEqual({
      model: "o4-mini",
      approval_policy: "on-request",
      sandbox: { enable: true },
      sandbox_mode: "workspace-write",
      web_search: "disabled",
      model_reasoning_effort: "medium",
      history: { persistence: "save-all" },
    });
  });
});

