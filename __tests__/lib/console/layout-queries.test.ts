import { afterEach, describe, expect, it } from "vitest";
import type { PaneNode } from "@/types/console";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import {
  findGroupIdForTerminal,
  findTerminalForSession,
} from "@/lib/console/layout-queries";
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
    groups: {},
    activeGroupId: null,
    groupOrder: [],
    collapsedGroupIds: [],
    paneTree: defaultLayout(),
    activePaneId: null,
    focusedPaneId: null,
    terminals: {},
  });
}

afterEach(() => {
  resetLayoutStore();
});

describe("layout-queries", () => {
  it("prefers tab-ordered terminals that still exist as pane leaves", () => {
    const paneTree = split(
      termLeaf("leaf-b", "term-b"),
      termLeaf("leaf-a", "term-a"),
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
            "term-stale": { cwd: "~", sessionId: "session-1" },
          },
          tabOrder: ["term-stale", "term-a", "term-b"],
        },
      },
      activeGroupId: "group-1",
      groupOrder: ["group-1"],
      paneTree,
      terminals: {
        "term-a": { cwd: "~", sessionId: "session-1" },
        "term-b": { cwd: "~", sessionId: "session-1" },
        "term-stale": { cwd: "~", sessionId: "session-1" },
      },
    });

    const match = findTerminalForSession("session-1");
    expect(match.groupId).toBe("group-1");
    expect(match.terminalId).toBe("term-a");
  });

  it("does not resolve sessions from terminal metadata that is not in the pane tree", () => {
    const paneTree = termLeaf("leaf-1", "term-1");
    useConsoleLayoutStore.setState({
      groups: {
        "group-1": {
          paneTree,
          activePaneId: "leaf-1",
          focusedPaneId: "leaf-1",
          terminals: {
            "term-1": { cwd: "~", sessionId: "session-1" },
            "term-stale": { cwd: "~", sessionId: "session-stale" },
          },
          tabOrder: ["term-1", "term-stale"],
        },
      },
      activeGroupId: "group-1",
      groupOrder: ["group-1"],
      paneTree,
      terminals: {
        "term-1": { cwd: "~", sessionId: "session-1" },
        "term-stale": { cwd: "~", sessionId: "session-stale" },
      },
    });

    expect(findTerminalForSession("session-stale").terminalId).toBeUndefined();
    expect(findGroupIdForTerminal("term-stale")).toBeUndefined();
    expect(findGroupIdForTerminal("term-1")).toBe("group-1");
  });
});
