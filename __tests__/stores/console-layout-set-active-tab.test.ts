import { afterEach, describe, expect, it } from "vitest";
import type { PaneNode } from "@/types/console";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { defaultLayout } from "@/lib/console/pane-tree";

function termLeaf(id: string, terminalId: string): PaneNode {
  return {
    id,
    kind: "leaf",
    content: { type: "terminal", terminalId },
  };
}

function split(left: PaneNode, right: PaneNode): PaneNode {
  return {
    id: `split-${left.id}-${right.id}`,
    kind: "split",
    orientation: "horizontal",
    children: [left, right],
  };
}

function resetLayoutStore() {
  useConsoleLayoutStore.setState({
    layoutMode: "tabbed",
    groups: {},
    activeGroupId: null,
    groupOrder: [],
    collapsedGroupIds: [],
    paneTree: defaultLayout(),
    activePaneId: null,
    focusedPaneId: null,
    tabbedSidePanel: undefined,
    terminals: {},
  });
}

afterEach(() => {
  resetLayoutStore();
});

describe("consoleLayoutStore setActiveTab", () => {
  it("ignores context side panel toggle in tabbed mode", () => {
    const paneTree = split(
      termLeaf("leaf-a", "term-a"),
      termLeaf("leaf-b", "term-b"),
    );
    useConsoleLayoutStore.setState({
      groups: {
        "group-1": {
          paneTree,
          activePaneId: "leaf-a",
          focusedPaneId: "leaf-a",
          terminals: {
            "term-a": { cwd: "~", sessionId: "session-1" },
            "term-b": { cwd: "~", sessionId: "session-1" },
          },
          tabOrder: ["term-a", "term-b"],
        },
      },
      activeGroupId: "group-1",
      groupOrder: ["group-1"],
      paneTree,
      activePaneId: "leaf-a",
      focusedPaneId: "leaf-a",
      terminals: {
        "term-a": { cwd: "~", sessionId: "session-1" },
        "term-b": { cwd: "~", sessionId: "session-1" },
      },
      layoutMode: "tabbed",
    });

    useConsoleLayoutStore.getState().setActiveTab("context");

    const state = useConsoleLayoutStore.getState();
    const group = state.groups["group-1"];
    expect(state.tabbedSidePanel).toBeUndefined();
    expect(group.terminals["term-a"]?.sidePanel).toBeUndefined();
    expect(group.activePaneId).toBe("leaf-a");
  });

  it("toggles settings side panel in tabbed mode", () => {
    const paneTree = split(
      termLeaf("leaf-a", "term-a"),
      termLeaf("leaf-b", "term-b"),
    );
    useConsoleLayoutStore.setState({
      groups: {
        "group-1": {
          paneTree,
          activePaneId: "leaf-b",
          focusedPaneId: "leaf-b",
          terminals: {
            "term-a": { cwd: "~", sessionId: "session-1" },
            "term-b": { cwd: "~", sessionId: "session-1" },
          },
          tabOrder: ["term-a", "term-b"],
        },
      },
      activeGroupId: "group-1",
      groupOrder: ["group-1"],
      paneTree,
      activePaneId: "leaf-b",
      focusedPaneId: "leaf-b",
      terminals: {
        "term-a": { cwd: "~", sessionId: "session-1" },
        "term-b": { cwd: "~", sessionId: "session-1" },
      },
      layoutMode: "tabbed",
    });

    useConsoleLayoutStore.getState().setActiveTab("settings");

    let state = useConsoleLayoutStore.getState();
    const group = state.groups["group-1"];
    expect(state.tabbedSidePanel).toBe("settings");
    expect(group.terminals["term-b"]?.sidePanel).toBeUndefined();
    expect(group.activePaneId).toBe("leaf-b");

    useConsoleLayoutStore.getState().setActiveTab("settings");
    state = useConsoleLayoutStore.getState();
    expect(state.tabbedSidePanel).toBeUndefined();
  });

  it("ignores context side panel toggle in tiling mode", () => {
    const paneTree = split(
      termLeaf("leaf-a", "term-a"),
      termLeaf("leaf-b", "term-b"),
    );
    useConsoleLayoutStore.setState({
      groups: {
        "group-1": {
          paneTree,
          activePaneId: "leaf-b",
          focusedPaneId: "leaf-b",
          terminals: {
            "term-a": { cwd: "~", sessionId: "session-1" },
            "term-b": { cwd: "~", sessionId: "session-1" },
          },
          tabOrder: ["term-a", "term-b"],
        },
      },
      activeGroupId: "group-1",
      groupOrder: ["group-1"],
      paneTree,
      activePaneId: "leaf-b",
      focusedPaneId: "leaf-b",
      terminals: {
        "term-a": { cwd: "~", sessionId: "session-1" },
        "term-b": { cwd: "~", sessionId: "session-1" },
      },
      layoutMode: "tiling",
    });

    useConsoleLayoutStore.getState().setActiveTab("context");

    const state = useConsoleLayoutStore.getState();
    const group = state.groups["group-1"];
    expect(group.terminals["term-b"]?.sidePanel).toBeUndefined();
  });
});
