import { beforeEach, describe, expect, it, vi } from "vitest";

const getWorkflowMock = vi.fn();
const updateWorkflowMock = vi.fn();
const syncWorkflowCommandArtifactMock = vi.fn();
const cleanupWorkflowCommandArtifactMock = vi.fn();

vi.mock("@/lib/db/workflows", () => ({
  getWorkflow: getWorkflowMock,
  updateWorkflow: updateWorkflowMock,
  deleteWorkflow: vi.fn(),
  duplicateWorkflow: vi.fn(),
}));

vi.mock("@/lib/workflows/command-artifact-sync", () => ({
  syncWorkflowCommandArtifact: syncWorkflowCommandArtifactMock,
  cleanupWorkflowCommandArtifact: cleanupWorkflowCommandArtifactMock,
}));

vi.mock("@/lib/workflows/cleanup", () => ({
  cleanupWorkflowSkill: vi.fn(),
}));

describe("PUT /api/workflows/[id] gemini auto skill sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("syncs updated gemini command artifact and cleans previous command", async () => {
    getWorkflowMock.mockImplementation((id: string) => {
      if (id === "wf-1") {
        return {
          id: "wf-1",
          provider: "gemini",
          name: "Landing Flow",
          description: "desc",
          generatedPlan: "",
          nodes: [
            {
              id: "n1",
              label: "Plan",
              taskDescription: "do plan",
              agentName: "planner",
              dependsOn: [],
              skills: [],
            },
          ],
          edges: [],
          cwd: "/tmp/demo",
          commandName: "old-flow",
          commandDescription: "old desc",
          projectPath: "/tmp/demo",
          autoSkillEnabled: true,
        };
      }
      return null;
    });
    updateWorkflowMock.mockReturnValue({
      id: "wf-1",
      provider: "gemini",
      name: "Landing Flow",
      description: "desc",
      generatedPlan: "",
      nodes: [
        {
          id: "n1",
          label: "Plan",
          taskDescription: "do plan",
          agentName: "planner",
          dependsOn: [],
          skills: [],
        },
      ],
      edges: [],
      cwd: "/tmp/demo",
      commandName: "new-flow",
      commandDescription: "new desc",
      projectPath: "/tmp/demo",
      autoSkillEnabled: true,
    });

    const { PUT } = await import("@/app/api/workflows/[id]/route");
    const req = new Request("http://localhost/api/workflows/wf-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commandName: "new-flow",
        commandDescription: "new desc",
      }),
    });
    const res = await PUT(req as never, {
      params: Promise.resolve({ id: "wf-1" }),
    });

    expect(res.status).toBe(200);
    expect(syncWorkflowCommandArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gemini",
        commandName: "new-flow",
        projectPath: "/tmp/demo",
      }),
    );
    expect(cleanupWorkflowCommandArtifactMock).toHaveBeenCalledWith({
      provider: "gemini",
      commandName: "old-flow",
      projectPath: "/tmp/demo",
    });
  });
});
