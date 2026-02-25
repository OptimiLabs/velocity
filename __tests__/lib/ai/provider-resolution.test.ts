import { describe, expect, it } from "vitest";
import {
  inferApiProviderFromModel,
  providerRuntimeId,
  resolveApiProviderCandidate,
} from "@/lib/ai/provider-resolution";

describe("provider-resolution", () => {
  it("infers provider from model prefixes", () => {
    expect(inferApiProviderFromModel("gpt-5")).toBe("openai");
    expect(inferApiProviderFromModel("gemini-2.5-pro")).toBe("google");
    expect(inferApiProviderFromModel("claude-sonnet-4-6")).toBe("anthropic");
    expect(inferApiProviderFromModel("openrouter/auto")).toBe("openrouter");
    expect(inferApiProviderFromModel("local/llama3.2")).toBe("local");
  });

  it("prefers provider match inferred from model over recency", () => {
    const candidates = [
      { provider: "anthropic", providerSlug: "anthropic", modelId: "claude-sonnet-4-6" },
      { provider: "openai", providerSlug: "openai", modelId: "gpt-5" },
    ] as const;

    const resolved = resolveApiProviderCandidate(candidates, "gpt-5");

    expect(resolved.providerId).toBe("openai");
    expect(resolved.reason).toBe("model-provider");
  });

  it("returns custom provider slug for runtime routing", () => {
    const id = providerRuntimeId({
      provider: "custom",
      providerSlug: "openrouter",
      modelId: "openrouter/auto",
    });
    expect(id).toBe("openrouter");
  });

  it("returns none when inferred provider has no active key", () => {
    const candidates = [
      { provider: "anthropic", providerSlug: "anthropic", modelId: "claude-sonnet-4-6" },
    ] as const;

    const resolved = resolveApiProviderCandidate(candidates, "gpt-5");

    expect(resolved.providerId).toBeUndefined();
    expect(resolved.reason).toBe("none");
  });

  it("falls back to first active when model does not imply provider", () => {
    const candidates = [
      { provider: "anthropic", providerSlug: "anthropic", modelId: "claude-sonnet-4-6" },
      { provider: "openai", providerSlug: "openai", modelId: "gpt-5" },
    ] as const;

    const resolved = resolveApiProviderCandidate(candidates, "unknown-model");

    expect(resolved.providerId).toBe("anthropic");
    expect(resolved.reason).toBe("first-active");
  });
});
