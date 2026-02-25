import { describe, expect, it } from "vitest";
import {
  extractConfigFromText,
  normalizeGeneratedAgentConfig,
} from "@/lib/agents/config-normalizer";

describe("agents config normalizer", () => {
  it("extracts config from fenced agent-config block", () => {
    const text = [
      "Here is your draft",
      "```agent-config",
      '{"name":"reviewer","prompt":"Do review","description":"Reviews PRs"}',
      "```",
    ].join("\n");

    const parsed = extractConfigFromText(text);
    expect(parsed.source).toBe("fenced");
    expect(parsed.parsed).toMatchObject({
      name: "reviewer",
      prompt: "Do review",
    });
  });

  it("falls back to JSON object extraction when no fence exists", () => {
    const text = 'Assistant output {"name":"agent","prompt":"work","description":"desc"}';
    const parsed = extractConfigFromText(text);
    expect(parsed.source).toBe("json");
    expect(parsed.parsed).toMatchObject({
      name: "agent",
      prompt: "work",
    });
  });

  it("repairs sparse payloads with defaults", () => {
    const normalized = normalizeGeneratedAgentConfig(
      {
        name: "***",
        color: "bogus",
      },
      { fallbackDescription: "Security reviewer" },
    );

    expect(normalized.status).toBe("repaired");
    expect(normalized.validation.isValid).toBe(true);
    expect(normalized.config).toMatchObject({
      name: "security-reviewer",
      description: "Security reviewer",
      prompt: "Security reviewer",
      color: "#3b82f6",
      tools: ["Read", "Glob", "Grep"],
    });
  });

  it("preserves caller overrides for model/effort/tools", () => {
    const normalized = normalizeGeneratedAgentConfig(
      {
        name: "helper",
        prompt: "assist",
        description: "assist",
        model: "haiku",
        effort: "low",
        tools: ["Read"],
      },
      {
        preserveModel: "sonnet",
        preserveEffort: "high",
        preserveTools: ["Read", "Grep"],
      },
    );

    expect(normalized.config.model).toBe("sonnet");
    expect(normalized.config.effort).toBe("high");
    expect(normalized.config.tools).toEqual(["Read", "Grep"]);
  });
});
