import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SaveWorkflowDialog } from "@/components/agents/workspace/SaveWorkflowDialog";

vi.mock("@/components/console/DirectoryPicker", () => ({
  DirectoryPicker: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      data-testid="directory-picker"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("SaveWorkflowDialog", () => {
  it("syncs form values from latest workflow props when reopened/changed", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    const { rerender } = render(
      <SaveWorkflowDialog
        open
        onClose={onClose}
        canvasNodes={[]}
        canvasEdges={[]}
        agents={[]}
        onSave={onSave}
        existingName="alpha-flow"
        existingDescription="first description"
        existingCwd="/tmp/alpha"
      />,
    );

    expect(screen.getByPlaceholderText("my-workflow")).toHaveValue("alpha-flow");
    expect(screen.getByPlaceholderText("Optional description")).toHaveValue(
      "first description",
    );
    expect(screen.getByTestId("directory-picker")).toHaveValue("/tmp/alpha");

    rerender(
      <SaveWorkflowDialog
        open
        onClose={onClose}
        canvasNodes={[]}
        canvasEdges={[]}
        agents={[]}
        onSave={onSave}
        existingName="beta-flow"
        existingDescription="second description"
        existingCwd="/tmp/beta"
      />,
    );

    expect(screen.getByPlaceholderText("my-workflow")).toHaveValue("beta-flow");
    expect(screen.getByPlaceholderText("Optional description")).toHaveValue(
      "second description",
    );
    expect(screen.getByTestId("directory-picker")).toHaveValue("/tmp/beta");
  });

  it("applies agent model/effort defaults when saving workflow nodes", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <SaveWorkflowDialog
        open
        onClose={onClose}
        canvasNodes={[
          { id: "planner", agentName: "planner", position: { x: 0, y: 0 } },
          { id: "reviewer", agentName: "reviewer", position: { x: 120, y: 0 } },
        ]}
        canvasEdges={[{ id: "e1", source: "planner", target: "reviewer" }]}
        agents={[
          { name: "planner", model: "gpt-5.3-codex", effort: "high" },
          { name: "reviewer", model: "sonnet", effort: "medium" },
        ]}
        onSave={onSave}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("my-workflow"), {
      target: { value: "workflow-with-defaults" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Workflow" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "workflow-with-defaults",
        nodes: expect.arrayContaining([
          expect.objectContaining({
            id: "planner",
            model: "gpt-5.3-codex",
            effort: "high",
          }),
          expect.objectContaining({
            id: "reviewer",
            model: "sonnet",
            effort: "medium",
            dependsOn: ["planner"],
          }),
        ]),
      }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
