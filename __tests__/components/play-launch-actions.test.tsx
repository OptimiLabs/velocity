import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { MouseEvent, ReactNode } from "react";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentListRow } from "@/components/agents/AgentListRow";
import { AgentTableRow } from "@/components/agents/AgentTableRow";
import { WorkflowList } from "@/components/workflows/WorkflowList";
import type { Agent } from "@/types/agent";
import type { Workflow } from "@/types/workflow";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: ReactNode;
    onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

const baseAgent: Agent = {
  name: "builder",
  provider: "codex",
  description: "Build things",
  prompt: "Do the thing",
  filePath: "/tmp/builder.md",
};

const baseWorkflow: Workflow = {
  id: "wf-123",
  provider: "codex",
  name: "Build Workflow",
  description: "Workflow description",
  generatedPlan: "",
  nodes: [],
  edges: [],
  cwd: "/tmp",
  swarmId: null,
  commandName: null,
  commandDescription: null,
  activationContext: null,
  autoSkillEnabled: false,
  createdAt: "2026-02-27T00:00:00.000Z",
  updatedAt: "2026-02-27T00:00:00.000Z",
};

describe("play launch actions", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("agent table row play launches without opening editor", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <table>
        <tbody>
          <AgentTableRow agent={baseAgent} onEdit={onEdit} onDelete={onDelete} />
        </tbody>
      </table>,
    );

    const playButton = container.querySelector("button.text-success");
    expect(playButton).toBeTruthy();
    fireEvent.click(playButton!);

    expect(pushMock).toHaveBeenCalledWith("/?agent=builder&provider=codex");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("agent list row play launches without opening editor", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <AgentListRow agent={baseAgent} onEdit={onEdit} onDelete={onDelete} />,
    );

    const playButton = container.querySelector("button.text-success");
    expect(playButton).toBeTruthy();
    fireEvent.click(playButton!);

    expect(pushMock).toHaveBeenCalledWith("/?agent=builder&provider=codex");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("agent card play launches without opening editor", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <AgentCard agent={baseAgent} onEdit={onEdit} onDelete={onDelete} />,
    );

    const playButton = container.querySelector("button.text-success");
    expect(playButton).toBeTruthy();
    fireEvent.click(playButton!);

    expect(pushMock).toHaveBeenCalledWith("/?agent=builder&provider=codex");
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("workflow list play launches the selected workflow", () => {
    const onSelect = vi.fn();
    const onCreate = vi.fn();
    const onDelete = vi.fn();
    const { getByTitle } = render(
      <WorkflowList
        workflows={[baseWorkflow]}
        onSelect={onSelect}
        onCreate={onCreate}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(getByTitle("Run workflow"));

    expect(pushMock).toHaveBeenCalledWith("/?workflow=wf-123");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
