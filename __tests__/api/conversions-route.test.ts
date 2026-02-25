import { describe, expect, it, vi } from "vitest";

describe("POST /api/conversions", () => {
  it("converts inline instruction content to all provider entrypoint files", async () => {
    const { POST } = await import("@/app/api/conversions/route");
    const req = new Request("http://localhost/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType: "instruction",
        targetProvider: "all",
        source: {
          kind: "inline",
          data: {
            fileName: "CLAUDE.md",
            content: "# Rules\n\nBe concise.\n",
            projectPath: "/tmp/demo-project",
          },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.artifactType).toBe("instruction");
    expect(data.results).toHaveLength(3);
    expect(data.results.map((r: { target: string }) => r.target)).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
    expect(data.results.map((r: { fileName?: string }) => r.fileName)).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      "GEMINI.md",
    ]);
  });

  it("returns provider-specific agent previews and Claude config for inline agent conversion", async () => {
    const { POST } = await import("@/app/api/conversions/route");
    const req = new Request("http://localhost/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType: "agent",
        targetProvider: "all",
        source: {
          kind: "inline",
          data: {
            name: "reviewer",
            description: "Reviews code changes",
            prompt: "Review for security issues first.",
            tools: ["Read", "Grep"],
            model: "sonnet",
            effort: "medium",
          },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    const claude = data.results.find((r: { target: string }) => r.target === "claude");
    const codex = data.results.find((r: { target: string }) => r.target === "codex");
    const gemini = data.results.find((r: { target: string }) => r.target === "gemini");

    expect(claude.output.config).toMatchObject({
      name: "reviewer",
      description: "Reviews code changes",
      prompt: "Review for security issues first.",
      model: "sonnet",
      effort: "medium",
      tools: ["Read", "Grep"],
    });
    expect(typeof codex.previewText).toBe("string");
    expect(codex.saveSupported).toBe(true);
    expect(codex.previewText).toContain("name: reviewer");
    expect(typeof gemini.previewText).toBe("string");
    expect(gemini.saveSupported).toBe(true);
    expect(gemini.previewText).toContain("name: reviewer");
  });

  it("converts skills and preserves capability parity in results", async () => {
    const { POST } = await import("@/app/api/conversions/route");
    const req = new Request("http://localhost/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType: "skill",
        targetProvider: "all",
        source: {
          kind: "inline",
          data: {
            name: "security-review",
            description: "Use when reviewing changes for auth issues",
            content: "## Checklist\n- Verify authz checks",
            visibility: "global",
          },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    const byTarget = Object.fromEntries(
      data.results.map((r: { target: string }) => [r.target, r]),
    ) as Record<string, { saveSupported: boolean; previewText?: string }>;

    expect(byTarget.claude.saveSupported).toBe(true);
    expect(byTarget.codex.saveSupported).toBe(true);
    expect(byTarget.gemini.saveSupported).toBe(true);
    expect(byTarget.codex.previewText).toContain("name: security-review");
    expect(byTarget.gemini.previewText).toContain("name: security-review");
  });

  it("marks non-Claude hook conversions as preview-only", async () => {
    const { POST } = await import("@/app/api/conversions/route");
    const req = new Request("http://localhost/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType: "hook",
        targetProvider: "codex",
        source: {
          kind: "inline",
          data: {
            event: "PostToolUse",
            matcher: "Edit|Write",
            hook: {
              type: "command",
              command: "npm test",
              timeout: 10,
            },
          },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.results).toHaveLength(1);
    expect(data.results[0].target).toBe("codex");
    expect(data.results[0].saveSupported).toBe(false);
    expect(data.results[0].issues[0].message).toContain(
      "hooks are not supported in this app",
    );
    expect(data.results[0].previewText).toContain("hook conversion preview");
    expect(data.results[0].fileName).toBe("posttooluse-command.json");
  });

  it("loads codex skill sources via explicit projectPath lookup", async () => {
    vi.resetModules();
    const getCodexInstructionMock = vi.fn(() => ({
      name: "security-review",
      content: "## checklist",
      visibility: "project",
      projectPath: "/tmp/demo-project",
    }));

    vi.doMock("@/lib/codex/skills", async () => {
      const actual = await vi.importActual<typeof import("@/lib/codex/skills")>(
        "@/lib/codex/skills",
      );
      return {
        ...actual,
        getCodexInstruction: getCodexInstructionMock,
      };
    });

    const { POST } = await import("@/app/api/conversions/route");
    const req = new Request("http://localhost/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType: "skill",
        targetProvider: "codex",
        source: {
          kind: "skill",
          name: "security-review",
          provider: "codex",
          projectPath: "/tmp/demo-project",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(getCodexInstructionMock).toHaveBeenCalledWith(
      "security-review",
      "/tmp/demo-project",
    );

    vi.unmock("@/lib/codex/skills");
    vi.resetModules();
  });

  it("converts workflow models and effort for each target provider", async () => {
    const { POST } = await import("@/app/api/conversions/route");
    const req = new Request("http://localhost/api/conversions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactType: "workflow",
        targetProvider: "all",
        source: {
          kind: "inline",
          data: {
            provider: "codex",
            name: "landing-page-flow",
            description: "Generate and polish a landing page",
            generatedPlan: "Plan steps",
            cwd: "/tmp/demo",
            nodes: [
              {
                id: "n1",
                label: "Architecture",
                taskDescription: "Decide structure",
                agentName: "planner",
                model: "gpt-5.3-codex",
                effort: "high",
                dependsOn: [],
                position: { x: 0, y: 0 },
                status: "ready",
              },
              {
                id: "n2",
                label: "Build UI",
                taskDescription: "Implement layout",
                agentName: "builder",
                model: "gpt-5.1-codex-mini",
                effort: "low",
                dependsOn: ["n1"],
                position: { x: 200, y: 0 },
                status: "ready",
              },
            ],
            edges: [{ id: "e1", source: "n1", target: "n2" }],
            scopedAgents: [
              {
                id: "wa1",
                workflowId: "wf-demo",
                name: "builder",
                description: "Scoped builder",
                model: "gpt-5.1-codex",
                effort: "medium",
                tools: [],
                disallowedTools: [],
                prompt: "Build UI",
                skills: [],
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.results).toHaveLength(3);

    const claude = data.results.find((r: { target: string }) => r.target === "claude");
    const gemini = data.results.find((r: { target: string }) => r.target === "gemini");

    expect(claude.output.config.provider).toBe("claude");
    expect(claude.output.config.nodes[0].model).toBe("opus");
    expect(claude.output.config.nodes[1].model).toBe("haiku");
    expect(claude.output.config.nodes[0].effort).toBe("high");

    expect(gemini.output.config.provider).toBe("gemini");
    expect(gemini.output.config.nodes[0].model).toBe("gemini-3-deep-think");
    expect(gemini.output.config.nodes[1].model).toBe("gemini-3-flash");
    expect(gemini.output.config.scopedAgents[0].model).toBe("gemini-3-pro");
  });
});
