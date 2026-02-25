import { describe, it, expect } from "vitest";
import { detectProvider } from "@/lib/parser/session-aggregator";

describe("detectProvider", () => {
  it("returns 'codex' when model_usage has OpenAI models", () => {
    expect(detectProvider({ o3: { input: 100, output: 50 } })).toBe("codex");
    expect(detectProvider({ "o4-mini": { input: 100, output: 50 } })).toBe(
      "codex",
    );
    expect(detectProvider({ "gpt-4o": { input: 100, output: 50 } })).toBe(
      "codex",
    );
    expect(
      detectProvider({ "codex-mini-latest": { input: 100, output: 50 } }),
    ).toBe("codex");
  });

  it("returns 'claude' for Claude models", () => {
    expect(
      detectProvider({
        "claude-sonnet-4-5-20250929": { input: 100, output: 50 },
      }),
    ).toBe("claude");
  });

  it("returns 'claude' for empty model_usage", () => {
    expect(detectProvider({})).toBe("claude");
  });

  it("returns 'codex' when mixed models include OpenAI", () => {
    expect(
      detectProvider({
        "claude-sonnet-4-5-20250929": { input: 100, output: 50 },
        "gpt-4o": { input: 200, output: 100 },
      }),
    ).toBe("codex");
  });

  describe("detectProvider edge cases", () => {
    it("should detect gpt-5.3-codex as codex provider", () => {
      const usage = { "gpt-5.3-codex": { messages: 10 } };
      const result = detectProvider(usage);
      expect(result).toBe("codex");
    });

    it("should detect codex-mini-latest as codex provider", () => {
      const usage = { "codex-mini-latest": { messages: 5 } };
      const result = detectProvider(usage);
      expect(result).toBe("codex");
    });

    it("should handle session with mostly Claude models and one OpenAI model", () => {
      const usage = {
        "claude-sonnet-4-5-20250929": { messages: 50, tokens: 100000 },
        "gpt-4o": { messages: 1, tokens: 500 },
      };
      const result = detectProvider(usage);
      // Current behavior: returns "codex" if ANY OpenAI model is present
      expect(result).toBe("codex");
    });
  });
});
