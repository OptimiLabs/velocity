import { beforeEach, describe, expect, it, vi } from "vitest";

const aiGenerateMock = vi.fn();

vi.mock("@/lib/ai/generate", () => ({
  aiGenerate: aiGenerateMock,
}));

vi.mock("@/lib/skills", () => ({
  listAllSkills: () => [],
}));

function makeTasks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `step-${i + 1}`,
    label: `Task ${i + 1}`,
    taskDescription: `Implement task ${i + 1} in src/task-${i + 1}.ts with tests and acceptance checks`,
    agentName: `agent-${i + 1}`,
    dependsOn: i === 0 ? [] : ["step-1"],
    skills: [],
  }));
}

describe("POST /api/workflows/generate", () => {
  beforeEach(() => {
    aiGenerateMock.mockReset();
  });

  it("retries once when generated task count is below complex guidance", async () => {
    aiGenerateMock
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "Complex Build",
          plan: "First draft",
          tasks: makeTasks(2),
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "Complex Build",
          plan: "Refined draft",
          tasks: makeTasks(7),
        }),
      );

    const { POST } = await import("@/app/api/workflows/generate/route");
    const req = new Request("http://localhost/api/workflows/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt:
          "Build a production-ready end-to-end migration with CI/CD, deployment, observability, and rollback safety",
        complexity: "complex",
      }),
    });

    const res = await POST(req as never);
    const data = (await res.json()) as {
      nodes: Array<{ id: string }>;
      plan: string;
    };

    expect(res.status).toBe(200);
    expect(aiGenerateMock).toHaveBeenCalledTimes(2);
    expect(data.nodes.length).toBe(7);
    expect(data.plan).toBe("Refined draft");
  });

  it("respects explicit step count from user prompt without retry", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "Exact Plan",
        plan: "Exactly five",
        tasks: [
          {
            id: "step-1",
            label: "Implement endpoint",
            taskDescription:
              "Create src/api/feature.ts and wire route exports with acceptance criteria for happy/error paths.",
            agentName: "feature-impl",
            dependsOn: [],
            skills: [],
            effort: "medium",
          },
          {
            id: "step-2",
            label: "Build UI",
            taskDescription:
              "Update src/components/FeaturePanel.tsx and integrate with endpoint including loading and error states.",
            agentName: "feature-ui",
            dependsOn: [],
            skills: [],
            effort: "medium",
          },
          {
            id: "step-3",
            label: "Add tests",
            taskDescription:
              "Create tests/feature.test.ts to verify endpoint behavior, UI state transitions, failure recovery, and response payload invariants.",
            agentName: "feature-tests",
            dependsOn: ["step-1", "step-2"],
            skills: [],
            effort: "low",
          },
          {
            id: "step-4",
            label: "Update docs",
            taskDescription:
              "Update docs/feature.md and README.md with setup, request examples, operational limits, and clear rollback guidance for operators.",
            agentName: "feature-docs",
            dependsOn: ["step-3"],
            skills: [],
            effort: "low",
          },
          {
            id: "step-5",
            label: "Rollout verification",
            taskDescription:
              "Prepare release checklist in docs/release/feature.md, add post-deploy smoke verification steps, and define monitoring assertions for launch.",
            agentName: "feature-rollout",
            dependsOn: ["step-4"],
            skills: [],
            effort: "medium",
          },
        ],
      }),
    );

    const { POST } = await import("@/app/api/workflows/generate/route");
    const req = new Request("http://localhost/api/workflows/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Create exactly 5 steps to ship this feature safely",
        complexity: "auto",
      }),
    });

    const res = await POST(req as never);
    const data = (await res.json()) as { nodes: Array<{ id: string }> };

    expect(res.status).toBe(200);
    expect(aiGenerateMock).toHaveBeenCalledTimes(1);
    expect(data.nodes.length).toBe(5);
  });

  it("adds effort levels to tasks when missing from AI output", async () => {
    aiGenerateMock.mockResolvedValueOnce(
      JSON.stringify({
        name: "Effort Plan",
        plan: "Assign lean effort where possible",
        tasks: [
          {
            id: "step-1",
            label: "Draft docs",
            taskDescription:
              "Update docs/README.md with API examples and acceptance notes.",
            agentName: "docs-writer",
            dependsOn: [],
            skills: [],
          },
          {
            id: "step-2",
            label: "Design architecture",
            taskDescription:
              "Design architecture trade-offs for auth boundary and failure handling in src/architecture/auth.md.",
            agentName: "auth-architect",
            dependsOn: ["step-1"],
            skills: [],
          },
          {
            id: "step-3",
            label: "Implement endpoint",
            taskDescription:
              "Implement src/api/auth.ts with acceptance criteria and tests for success/error paths.",
            agentName: "api-impl",
            dependsOn: ["step-2"],
            skills: [],
          },
        ],
      }),
    );

    const { POST } = await import("@/app/api/workflows/generate/route");
    const req = new Request("http://localhost/api/workflows/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Build a lightweight auth feature quickly",
        complexity: "auto",
      }),
    });

    const res = await POST(req as never);
    const data = (await res.json()) as {
      nodes: Array<{ label: string; effort?: "low" | "medium" | "high" }>;
    };

    expect(res.status).toBe(200);
    expect(aiGenerateMock).toHaveBeenCalledTimes(1);
    const docsNode = data.nodes.find((n) => n.label === "Draft docs");
    const archNode = data.nodes.find((n) => n.label === "Design architecture");
    const implNode = data.nodes.find((n) => n.label === "Implement endpoint");
    expect(docsNode?.effort).toBe("low");
    expect(archNode?.effort).toBe("high");
    expect(implNode?.effort).toBe("low");
  });

  it("retries when bugfix workflow misses explicit validation gate", async () => {
    aiGenerateMock
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "Fix Login",
          plan: "Patch login crash",
          tasks: [
            {
              id: "step-1",
              label: "Investigate crash",
              taskDescription:
                "Inspect src/auth/login.ts stack traces and isolate null-session handling failure.",
              agentName: "login-investigator",
              dependsOn: [],
              skills: [],
              effort: "high",
            },
            {
              id: "step-2",
              label: "Patch null handling",
              taskDescription:
                "Update src/auth/login.ts to guard null-session paths and return typed error result.",
              agentName: "login-fixer",
              dependsOn: ["step-1"],
              skills: [],
              effort: "medium",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          name: "Fix Login",
          plan: "Patch and verify",
          tasks: [
            {
              id: "step-1",
              label: "Investigate crash",
              taskDescription:
                "Inspect src/auth/login.ts stack traces and isolate null-session handling failure.",
              agentName: "login-investigator",
              dependsOn: [],
              skills: [],
              effort: "high",
            },
            {
              id: "step-2",
              label: "Patch null handling",
              taskDescription:
                "Update src/auth/login.ts to guard null-session paths and return typed error result.",
              agentName: "login-fixer",
              dependsOn: ["step-1"],
              skills: [],
              effort: "medium",
            },
            {
              id: "step-3",
              label: "Add regression tests",
              taskDescription:
                "Create tests/login-regression.test.ts to validate null-session and malformed-token scenarios.",
              agentName: "login-tester",
              dependsOn: ["step-2"],
              skills: [],
              effort: "low",
            },
          ],
        }),
      );

    const { POST } = await import("@/app/api/workflows/generate/route");
    const req = new Request("http://localhost/api/workflows/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Fix login crash bug in production auth flow",
        complexity: "balanced",
      }),
    });

    const res = await POST(req as never);
    const data = (await res.json()) as {
      nodes: Array<{ label: string }>;
    };

    expect(res.status).toBe(200);
    expect(aiGenerateMock).toHaveBeenCalledTimes(2);
    expect(data.nodes.some((n) => /regression tests/i.test(n.label))).toBe(true);
  });
});
