import { describe, expect, it } from "vitest";
import { getModelConfig } from "@/lib/compare/models";

describe("compare model alias resolution", () => {
  it("maps provider aliases to default model configs", () => {
    expect(getModelConfig("claude-cli").provider).toBe("claude-cli");
    expect(getModelConfig("anthropic").provider).toBe("anthropic");
    expect(getModelConfig("openai").provider).toBe("openai");
    expect(getModelConfig("google").provider).toBe("google");
    expect(getModelConfig("openrouter").provider).toBe("openrouter");
    expect(getModelConfig("local").provider).toBe("local");
    expect(getModelConfig("custom").provider).toBe("custom");
  });

  it("preserves explicit model IDs", () => {
    const cfg = getModelConfig("claude-cli-haiku");
    expect(cfg.id).toBe("claude-cli-haiku");
    expect(cfg.modelId).toBe("claude-haiku-4-5-20251001");
  });
});
