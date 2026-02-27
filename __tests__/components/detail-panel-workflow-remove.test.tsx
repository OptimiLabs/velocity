import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Agent } from "@/types/agent";
import type { Workflow } from "@/types/workflow";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { DetailPanel } from "@/components/agents/workspace/DetailPanel";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    name: "planner",
    description: "Plans tasks",
    prompt: "Plan the implementation",
    model: "claude-opus-4.1",
    enabled: true,
    source: "custom",
    filePath: ".claude/agents/planner.md",
    provider: "claude",
    scope: "global",
    ...overrides,
  };
}

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf_1",
    provider: "claude",
    name: "Workflow 1",
    description: "Test workflow",
    generatedPlan: "",
    nodes: [],
    edges: [],
    cwd: "/tmp/project",
    swarmId: null,
    commandName: null,
    commandDescription: null,
    activationContext: null,
    autoSkillEnabled: false,
    createdAt: "2026-02-24T00:00:00.000Z",
    updatedAt: "2026-02-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("DetailPanel remove target", () => {
  beforeEach(() => {
    useWorkspaceStore.setState({ detailMode: "view" });
  });

  it("uses selected workflow node instance id when removing in workflow mode", () => {
    const onRemoveFromWorkspace = vi.fn();
    const onClose = vi.fn();
    const selection = { type: "agent", id: "planner__iabc123" };

    render(
      <DetailPanel
        selection={selection}
        onClose={onClose}
        agents={[makeAgent()]}
        workflows={[makeWorkflow({ nodes: [{ id: selection.id, label: "Plan", taskDescription: "Plan", agentName: "planner", status: "ready", position: { x: 0, y: 0 }, dependsOn: [] }] })]}
        onSaveAgent={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDeleteWorkflow={vi.fn()}
        onLaunchWorkflow={vi.fn()}
        onRemoveFromWorkspace={onRemoveFromWorkspace}
        workspaceAgentNames={new Set(["planner"])}
        workflowMode
        activeWorkflow={makeWorkflow({
          nodes: [
            {
              id: selection.id,
              label: "Plan",
              taskDescription: "Plan",
              agentName: "planner",
              status: "ready",
              position: { x: 0, y: 0 },
              dependsOn: [],
            },
          ],
        })}
        compactWorkflowAgentActions={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemoveFromWorkspace).toHaveBeenCalledWith(selection.id);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses agent name when removing outside workflow mode", () => {
    const onRemoveFromWorkspace = vi.fn();
    const onClose = vi.fn();

    render(
      <DetailPanel
        selection={{ type: "agent", id: "planner" }}
        onClose={onClose}
        agents={[makeAgent()]}
        workflows={[]}
        onSaveAgent={vi.fn()}
        onDeleteAgent={vi.fn()}
        onDeleteWorkflow={vi.fn()}
        onLaunchWorkflow={vi.fn()}
        onRemoveFromWorkspace={onRemoveFromWorkspace}
        workspaceAgentNames={new Set(["planner"])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onRemoveFromWorkspace).toHaveBeenCalledWith("planner");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
