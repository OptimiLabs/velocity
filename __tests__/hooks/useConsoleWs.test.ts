import { afterEach, describe, expect, it, vi } from "vitest";
import type React from "react";
import type { ConsoleSession } from "@/types/console";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { __testables } from "@/hooks/useConsoleWs";
import { defaultLayout } from "@/lib/console/pane-tree";

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

describe("useConsoleWs resumable handlers", () => {
  it("updates sessionsRef before orphan pruning for resumable additions", () => {
    const paneTree = {
      id: "leaf-1",
      kind: "leaf" as const,
      content: { type: "terminal" as const, terminalId: "term-1" },
    };

    useConsoleLayoutStore.setState({
      groups: {
        "group-1": {
          paneTree,
          activePaneId: "leaf-1",
          focusedPaneId: "leaf-1",
          terminals: {
            "term-1": { cwd: "~", sessionId: "session-1" },
          },
          tabOrder: ["term-1"],
        },
      },
      activeGroupId: "group-1",
      groupOrder: ["group-1"],
      paneTree,
      terminals: {
        "term-1": { cwd: "~", sessionId: "session-1" },
      },
    });

    let sessionsState = new Map<string, ConsoleSession>();
    const setSessions = ((action) => {
      sessionsState =
        typeof action === "function" ? action(sessionsState) : action;
    }) as React.Dispatch<React.SetStateAction<Map<string, ConsoleSession>>>;

    const sessionsRef = { current: new Map<string, ConsoleSession>() };
    const deletedSessionIdsRef = { current: new Set<string>() };
    const resumableSessionsLoadedRef = { current: false };
    const terminalOwnershipRef = {
      current: new Map<string, { groupId: string; sessionId?: string }>(),
    };
    const safeSend = vi.fn(() => true);

    let sawSessionInPrune = false;
    const pruneOrphanedTerminals = () => {
      sawSessionInPrune = sessionsRef.current.has("session-1");
    };

    __testables.handleResumableSessions(
      {
        sessions: [
          {
            id: "session-1",
            label: "Session 1",
            cwd: "~",
            createdAt: 1,
          },
        ],
      },
      safeSend,
      sessionsRef,
      deletedSessionIdsRef,
      resumableSessionsLoadedRef,
      setSessions,
      pruneOrphanedTerminals,
      terminalOwnershipRef,
    );

    expect(resumableSessionsLoadedRef.current).toBe(true);
    expect(sawSessionInPrune).toBe(true);
    expect(sessionsRef.current.get("session-1")?.terminalId).toBe("term-1");
    expect(sessionsState.get("session-1")?.terminalId).toBe("term-1");
    expect(safeSend).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "remove-session",
        consoleSessionId: "session-1",
      }),
    );
  });

  it("syncs layout groups using the merged group snapshot", async () => {
    useConsoleLayoutStore.setState({
      groups: {
        local: {
          paneTree: defaultLayout(),
          activePaneId: null,
          focusedPaneId: null,
          terminals: {},
          tabOrder: [],
        },
      },
      activeGroupId: "local",
      groupOrder: ["local"],
      paneTree: defaultLayout(),
      terminals: {},
    });

    const localGroup = {
      id: "local",
      label: "Local",
      createdAt: 1,
      lastActivityAt: 1,
    };
    const groupsRef = {
      current: new Map<string, typeof localGroup>([["local", localGroup]]),
    };

    let groupsState = new Map(groupsRef.current);
    const setGroups = ((action) => {
      groupsState = typeof action === "function" ? action(groupsState) : action;
    }) as React.Dispatch<
      React.SetStateAction<
        Map<string, import("@/types/console").SessionGroup>
      >
    >;

    const safeSend = vi.fn(() => true);

    __testables.handleResumableGroups(
      {
        groups: [
          {
            id: "server",
            label: "Server",
            createdAt: 2,
            lastActivityAt: 2,
          },
        ],
      },
      safeSend,
      setGroups,
      groupsRef as React.MutableRefObject<
        Map<string, import("@/types/console").SessionGroup>
      >,
    );

    await Promise.resolve();
    await Promise.resolve();

    const layoutGroups = useConsoleLayoutStore.getState().groups;
    expect(groupsRef.current.has("server")).toBe(true);
    expect(layoutGroups.local).toBeTruthy();
    expect(layoutGroups.server).toBeTruthy();
  });
});
