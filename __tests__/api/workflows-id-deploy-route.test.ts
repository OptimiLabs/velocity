import { beforeEach, describe, expect, it, vi } from "vitest";

const getWorkflowMock = vi.fn();
const updateWorkflowMock = vi.fn();
const syncWorkflowCommandArtifactMock = vi.fn();

vi.mock("@/lib/db/workflows", () => ({
  getWorkflow: getWorkflowMock,
  updateWorkflow: updateWorkflowMock,
}));

vi.mock("@/lib/workflows/command-artifact-sync", () => ({
  syncWorkflowCommandArtifact: syncWorkflowCommandArtifactMock,
}));

describe("POST /api/workflows/[id]/deploy (gemini)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deploys gemini workflow and syncs gemini command artifact", async () => {
    getWorkflowMock.mockReturnValue({
      id: "wf-1",
      provider: "gemini",
      name: "Landing Page Workflow",
      description: "Build and verify landing page changes",
      generatedPlan: "",
      nodes: [
        {
          id: "n1",
          label: "Plan",
          taskDescription: "Plan implementation",
          agentName: "planner",
          dependsOn: [],
          skills: [],
        },
      ],
      edges: [],
      cwd: "/tmp/demo",
      commandName: null,
      commandDescription: null,
      projectPath: "/tmp/demo",
      autoSkillEnabled: true,
    });
    updateWorkflowMock.mockReturnValue({
      provider: "gemini",
      commandName: "landing-page-workflow",
      commandDescription: "Build and verify landing page changes",
      projectPath: "/tmp/demo",
    });

    const { POST } = await import("@/app/api/workflows/[id]/deploy/route");
    const req = new Request("http://localhost/api/workflows/wf-1/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "wf-1" }),
    });

    expect(res.status).toBe(200);
    expect(updateWorkflowMock).toHaveBeenCalledWith("wf-1", {
      commandName: "landing-page-workflow",
      commandDescription: 'Run the "Landing Page Workflow" workflow',
      autoSkillEnabled: true,
    });
    expect(syncWorkflowCommandArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        commandName: "landing-page-workflow",
        projectPath: "/tmp/demo",
      }),
    );

    const body = await res.json();
    expect(body).toEqual({
      success: true,
      commandName: "landing-page-workflow",
      message: 'Deployed as Gemini skill "landing-page-workflow"',
    });
  });

  it("returns 400 when workflow has no nodes", async () => {
    getWorkflowMock.mockReturnValue({
      id: "wf-empty",
      provider: "gemini",
      name: "Empty Workflow",
      description: "",
      generatedPlan: "",
      nodes: [],
      edges: [],
    });

    const { POST } = await import("@/app/api/workflows/[id]/deploy/route");
    const req = new Request("http://localhost/api/workflows/wf-empty/deploy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ id: "wf-empty" }),
    });

    expect(res.status).toBe(400);
    expect(syncWorkflowCommandArtifactMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      error: "Workflow has no steps to deploy",
    });
  });
});
