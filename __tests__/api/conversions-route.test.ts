import { describe, expect, it } from "vitest";

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
    expect(typeof gemini.previewText).toBe("string");
    expect(gemini.saveSupported).toBe(true);
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
    expect(byTarget.codex.previewText).toContain("Converted for codex");
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
});
