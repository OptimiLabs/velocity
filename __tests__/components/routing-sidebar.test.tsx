import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RoutingSidebar } from "@/components/routing/RoutingSidebar";
import type { RoutingGraphNode } from "@/types/routing-graph";

type RoutingStoreShape = {
  searchQuery: string;
  setSearchQuery: ReturnType<typeof vi.fn>;
  selectedNodeId: string | null;
  setSelectedNodeId: ReturnType<typeof vi.fn>;
  setSelectedFilePath: ReturnType<typeof vi.fn>;
  setDetailMode: ReturnType<typeof vi.fn>;
  focusTrigger: number;
};

let routingStoreState: RoutingStoreShape;

vi.mock("@/stores/routingStore", () => ({
  useRoutingStore: () => routingStoreState,
}));

function makeNode(overrides: Partial<RoutingGraphNode>): RoutingGraphNode {
  return {
    id: "/Users/test/project/CLAUDE.md",
    absolutePath: "/Users/test/project/CLAUDE.md",
    label: "CLAUDE.md",
    nodeType: "claude-md",
    projectRoot: "/Users/test/project",
    exists: true,
    position: null,
    fileSize: 100,
    lastModified: null,
    provider: "claude",
    ...overrides,
  };
}

describe("RoutingSidebar", () => {
  beforeEach(() => {
    routingStoreState = {
      searchQuery: "target",
      setSearchQuery: vi.fn(),
      selectedNodeId: null,
      setSelectedNodeId: vi.fn(),
      setSelectedFilePath: vi.fn(),
      setDetailMode: vi.fn(),
      focusTrigger: 0,
    };
  });

  it("auto-expands filtered folders so deep matches are visible", async () => {
    render(
      <RoutingSidebar
        nodes={[
          makeNode({
            id: "/Users/test/project/docs/nested/target.md",
            absolutePath: "/Users/test/project/docs/nested/target.md",
            label: "target.md",
            nodeType: "knowledge",
          }),
          makeNode({
            id: "/Users/test/project/README.md",
            absolutePath: "/Users/test/project/README.md",
            label: "README.md",
            nodeType: "knowledge",
          }),
        ]}
        width={280}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onResizeStart={vi.fn()}
      />,
    );

    expect(await screen.findByText("target.md")).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });

  it("clears the search query via the clear button", () => {
    render(
      <RoutingSidebar
        nodes={[
          makeNode({
            id: "/Users/test/project/docs/nested/target.md",
            absolutePath: "/Users/test/project/docs/nested/target.md",
            label: "target.md",
            nodeType: "knowledge",
          }),
        ]}
        width={280}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onResizeStart={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Clear file filter"));
    expect(routingStoreState.setSearchQuery).toHaveBeenCalledWith("");
  });

  it("allows collapsing an already-expanded folder while search is active", async () => {
    render(
      <RoutingSidebar
        nodes={[
          makeNode({
            id: "/Users/test/project/docs/nested/target.md",
            absolutePath: "/Users/test/project/docs/nested/target.md",
            label: "target.md",
            nodeType: "knowledge",
          }),
        ]}
        width={280}
        collapsed={false}
        onToggleCollapse={vi.fn()}
        onResizeStart={vi.fn()}
      />,
    );

    expect(await screen.findByText("target.md")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "~" }));
    expect(screen.queryByText("target.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "~" }));
    expect(screen.getByText("target.md")).toBeInTheDocument();
  });
});
