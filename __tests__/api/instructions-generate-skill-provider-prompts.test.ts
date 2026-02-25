import { beforeEach, describe, expect, it, vi } from "vitest";

const aiGenerateMock = vi.fn();
const editWithAIMock = vi.fn();

vi.mock("@/lib/db/instruction-files", () => ({
  listInstructionFiles: vi.fn(() => []),
  getInstructionFile: vi.fn(() => null),
}));

vi.mock("@/lib/instructions/indexer", () => ({
  fullScan: vi.fn(() => ({ indexed: 0 })),
  scanScope: vi.fn(() => ({ indexed: 0 })),
  addManualPath: vi.fn(() => ({ added: true })),
  indexKnowledgeFile: vi.fn(),
  indexFile: vi.fn(),
}));

vi.mock("@/lib/skills", () => ({
  saveSkill: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      run: vi.fn(),
      all: vi.fn(() => []),
      get: vi.fn(() => null),
    })),
  })),
}));

vi.mock("@/lib/instructions/router-writer", () => ({
  addRouterEntry: vi.fn((content: string) => content),
}));

vi.mock("@/lib/instructions/ai-editor", () => ({
  editWithAI: editWithAIMock,
}));

vi.mock("@/lib/ai/generate", () => ({
  aiGenerate: aiGenerateMock,
}));

describe("POST /api/instructions generate-skill provider-native prompts", () => {
  beforeEach(() => {
    aiGenerateMock.mockReset();
    editWithAIMock.mockReset();
    aiGenerateMock.mockResolvedValue(
      "---\nname: sample-skill\ndescription: Use when validating outputs\n---\n## Steps\n- Do thing",
    );
  });

  it("uses Codex-native guide and label for targetProvider=codex", async () => {
    const { POST } = await import("@/app/api/instructions/route");
    const req = new Request("http://localhost/api/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate-skill",
        name: "sample-skill",
        prompt: "Create a robust coding workflow",
        targetProvider: "codex",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const calledPrompt = aiGenerateMock.mock.calls[0]?.[0] as string;
    expect(calledPrompt).toContain('Generate a Codex CLI skill called "sample-skill".');
    expect(calledPrompt).toContain("~/.codex/skills/<name>/SKILL.md");
    expect(calledPrompt).toContain(
      'Use these section headings exactly once: "When to use", "When not to use", "Workflow", "Validation", "Failure handling", "Output contract"',
    );
    const body = await res.json();
    expect(body.targetProvider).toBe("codex");
    expect(body.results?.[0]?.target).toBe("codex");
  });

  it("uses Gemini-native guide and label for targetProvider=gemini", async () => {
    const { POST } = await import("@/app/api/instructions/route");
    const req = new Request("http://localhost/api/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate-skill",
        name: "sample-skill",
        prompt: "Create a robust coding workflow",
        targetProvider: "gemini",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const calledPrompt = aiGenerateMock.mock.calls[0]?.[0] as string;
    expect(calledPrompt).toContain('Generate a Gemini CLI skill called "sample-skill".');
    expect(calledPrompt).toContain("~/.gemini/skills/<name>/SKILL.md");
    const body = await res.json();
    expect(body.targetProvider).toBe("gemini");
    expect(body.results?.[0]?.target).toBe("gemini");
  });

  it("uses cross-provider guide and returns all conversion targets for targetProvider=all", async () => {
    const { POST } = await import("@/app/api/instructions/route");
    const req = new Request("http://localhost/api/instructions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate-skill",
        name: "sample-skill",
        prompt: "Create a robust coding workflow",
        targetProvider: "all",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const calledPrompt = aiGenerateMock.mock.calls[0]?.[0] as string;
    expect(calledPrompt).toContain('Generate a cross-provider skill called "sample-skill".');
    expect(calledPrompt).toContain("Claude: ~/.claude/skills/<name>/SKILL.md");
    expect(calledPrompt).toContain("Codex: ~/.codex/skills/<name>/SKILL.md");
    expect(calledPrompt).toContain("Gemini: ~/.gemini/skills/<name>/SKILL.md");

    const body = await res.json();
    const targets = body.results?.map((result: { target: string }) => result.target);
    expect(targets).toEqual(["claude", "codex", "gemini"]);
  });
});
