import { describe, it, expect } from "vitest";
import { detectProvider } from "@/lib/parser/session-aggregator";
import {
  getSessionProvider,
  getAllSessionProviders,
} from "@/lib/providers/session-registry";

describe("detectProvider — Gemini models", () => {
  it("returns 'gemini' for gemini-2.5-pro", () => {
    expect(
      detectProvider({ "gemini-2.5-pro": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' for gemini-2.5-flash", () => {
    expect(
      detectProvider({ "gemini-2.5-flash": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' for gemini-3-pro-preview", () => {
    expect(
      detectProvider({ "gemini-3-pro-preview": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' for gemini-2.0-flash", () => {
    expect(
      detectProvider({ "gemini-2.0-flash": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'gemini' for gemini-2.0-flash-lite", () => {
    expect(
      detectProvider({ "gemini-2.0-flash-lite": { input: 100, output: 50 } }),
    ).toBe("gemini");
  });

  it("returns 'claude' for empty model_usage", () => {
    expect(detectProvider({})).toBe("claude");
  });

  it("returns 'gemini' when mixed models include gemini", () => {
    expect(
      detectProvider({
        "claude-sonnet-4-5-20250929": { input: 100, output: 50 },
        "gemini-2.5-pro": { input: 200, output: 100 },
      }),
    ).toBe("gemini");
  });

  it("still returns 'codex' for OpenAI models", () => {
    expect(detectProvider({ "gpt-4o": { input: 100, output: 50 } })).toBe(
      "codex",
    );
    expect(detectProvider({ o3: { input: 100, output: 50 } })).toBe("codex");
  });
});

describe("getSessionProvider — gemini", () => {
  it("returns a valid definition with all required fields", () => {
    const def = getSessionProvider("gemini");
    expect(def).toBeDefined();
    expect(def!.id).toBe("gemini");
    expect(def!.label).toBe("Gemini");
    expect(def!.chartColor).toBeTruthy();
    expect(def!.badgeClasses).toEqual(
      expect.objectContaining({
        bg: expect.any(String),
        text: expect.any(String),
        border: expect.any(String),
      }),
    );
    expect(def!.modelPrefixes).toContain("gemini-");
  });
});

describe("getAllSessionProviders — includes gemini", () => {
  it("includes gemini in the list", () => {
    const providers = getAllSessionProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("gemini");
  });
});
