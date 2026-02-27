import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Workflow } from "@/types/workflow";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import { WorkflowList } from "@/components/workflows/WorkflowList";
import { WorkflowInventoryItem } from "@/components/agents/workspace/WorkflowInventoryItem";

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: "wf_1",
    provider: "claude",
    name: "Test Workflow",
    description: "A workflow for testing",
    generatedPlan: "",
    nodes: [
      {
        id: "n1",
        label: "Step 1",
        taskDescription: "Do thing",
        agentName: "planner",
        status: "ready",
        position: { x: 0, y: 0 },
        dependsOn: [],
      },
      {
        id: "n2",
        label: "Step 2",
        taskDescription: "Do next thing",
        agentName: "builder",
        status: "completed",
        position: { x: 100, y: 0 },
        dependsOn: ["n1"],
      },
    ],
    edges: [{ id: "e1", source: "n1", target: "n2" }],
    cwd: "/tmp/project",
    swarmId: null,
    commandName: null,
    commandDescription: null,
    activationContext: null,
    autoSkillEnabled: false,
    createdAt: new Date("2026-02-24T00:00:00Z").toISOString(),
    updatedAt: new Date("2026-02-24T00:00:00Z").toISOString(),
    ...overrides,
  };
}

describe("Workflow UI interactions", () => {
  it("does not trigger card selection when duplicate/delete actions are clicked", () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    const onDuplicate = vi.fn();

    render(
      <WorkflowList
        workflows={[makeWorkflow()]}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />,
    );

    fireEvent.click(screen.getByTitle("Duplicate workflow"));
    expect(onDuplicate).toHaveBeenCalledWith("wf_1");
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Delete workflow"));
    expect(onDelete).toHaveBeenCalledWith("wf_1");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("supports keyboard selection on workflow cards", () => {
    const onSelect = vi.fn();

    render(
      <WorkflowList
        workflows={[makeWorkflow()]}
        onSelect={onSelect}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const card = screen.getByRole("button", { name: /test workflow/i });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("wf_1");
  });

  it("prevents row selection hotkeys from firing while inline workflow rename is active", () => {
    const onSelect = vi.fn();
    const onRename = vi.fn();
    const workflow = makeWorkflow();

    render(
      <WorkflowInventoryItem
        workflow={workflow}
        selected={false}
        onSelect={onSelect}
        onRename={onRename}
      />,
    );

    const name = screen.getByText("Test Workflow");
    fireEvent.doubleClick(name);
    onSelect.mockClear();

    fireEvent.keyDown(name, { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
