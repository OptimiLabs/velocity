import type {
  PaneId,
  PaneNode,
  TerminalMeta,
  GroupLayoutState,
} from "@/types/console";
import {
  defaultLayout,
  collectLeaves,
  findLeafByContent,
  replaceNode,
  buildTilingTree,
} from "@/lib/console/pane-tree";
import type { ConsoleLayoutState } from "./types";

/**
 * Pure migration function: takes persisted state and its version number,
 * returns the migrated state object ready for version 17.
 */
export function migrateState(
  persisted: unknown,
  version: number,
): Record<string, unknown> {
  const state = persisted as Record<string, unknown>;

  if (version < 3 && state.terminalTabs) {
    state.terminalTabs = (
      state.terminalTabs as Array<Record<string, unknown>>
    ).map(({ sessionId: _, ...rest }) => rest);
  }

  // v3 → v4: Unify terminalTabs + tilingLayout into paneTree + terminals
  if (version < 4) {
    const oldTabs =
      (state.terminalTabs as Array<{
        id: string;
        label: string;
        cwd: string;
        envOverrides?: Record<string, string>;
      }>) || [];
    const oldTiling = state.tilingLayout as
      | { root: PaneNode; focusedPaneId: PaneId | null }
      | undefined;

    // Build terminals registry from old tabs
    const terminals: Record<string, TerminalMeta> = {};
    for (const tab of oldTabs) {
      terminals[tab.id] = {
        label: tab.label,
        cwd: tab.cwd,
        envOverrides: tab.envOverrides,
      };
    }
    state.terminals = terminals;

    // Build pane tree
    if (state.layoutMode === "tiling" && oldTiling?.root) {
      state.paneTree = oldTiling.root;
      state.focusedPaneId = oldTiling.focusedPaneId ?? null;
    } else if (oldTabs.length > 0) {
      const claudeLeaf: PaneNode = {
        id: "pane-root",
        kind: "leaf",
        content: { type: "empty" },
      };
      const termLeaves: PaneNode[] = oldTabs.map((t) => ({
        id: `pane-${t.id}`,
        kind: "leaf" as const,
        content: { type: "terminal" as const, terminalId: t.id },
      }));
      state.paneTree = buildTilingTree(claudeLeaf, termLeaves);
      state.focusedPaneId = null;
    } else {
      state.paneTree = defaultLayout();
      state.focusedPaneId = null;
    }

    // Map old activeTab + activeTerminalTabId → activePaneId
    const oldActiveTab = state.activeTab as string | undefined;
    const oldActiveTermId = state.activeTerminalTabId as string | undefined;
    if (oldActiveTab === "terminal" && oldActiveTermId) {
      const termLeaf = findLeafByContent(
        state.paneTree as PaneNode,
        (c) => c.type === "terminal" && c.terminalId === oldActiveTermId,
      );
      state.activePaneId = termLeaf?.id ?? null;
    } else if (oldActiveTab === "env" || oldActiveTab === "settings") {
      const settingsLeaf = findLeafByContent(
        state.paneTree as PaneNode,
        (c) => c.type === "settings",
      );
      state.activePaneId = settingsLeaf?.id ?? null;
    } else {
      state.activePaneId = null;
    }

    // Clean up old fields
    delete state.terminalTabs;
    delete state.activeTab;
    delete state.activeTerminalTabId;
    delete state.tilingLayout;
  }

  // v5 → v6: TerminalMeta gains isClaudeSession, claudeSessionId, model, effort fields
  // All new fields are optional, so no data transform needed

  // v6 → v7: Wrap flat paneTree/terminals/focusedPaneId/activePaneId into groups
  if (version < 7) {
    const paneTree = (state.paneTree as PaneNode) ?? defaultLayout();
    const terminals = (state.terminals as Record<string, TerminalMeta>) ?? {};
    const focusedPaneId = (state.focusedPaneId as PaneId | null) ?? null;
    const activePaneId = (state.activePaneId as PaneId | null) ?? null;

    state.groups = {
      "default-group": {
        paneTree,
        terminals,
        focusedPaneId,
        activePaneId,
      },
    };
    state.activeGroupId = "default-group";

    // Clean up old top-level fields
    delete state.paneTree;
    delete state.terminals;
    delete state.focusedPaneId;
    delete state.activePaneId;
  }

  // v7 → v8: Add contextPanelOpen flag
  if (version < 8) {
    if (state.contextPanelOpen === undefined) {
      state.contextPanelOpen = false;
    }
  }

  // v9 → v10: Clear hardcoded "claude" command from persisted terminals
  if (version < 10) {
    const groups = state.groups as Record<string, GroupLayoutState> | undefined;
    if (groups) {
      for (const group of Object.values(groups)) {
        for (const meta of Object.values(group.terminals || {})) {
          if (meta.command === "claude") {
            delete meta.command;
            delete meta.args;
          }
        }
      }
    }
  }

  // v8 → v9: Add nextTerminalNumber counter
  if (version < 9) {
    // Seed counter by counting existing terminals across all groups
    let totalTerminals = 0;
    const groups = state.groups as Record<string, GroupLayoutState> | undefined;
    if (groups) {
      for (const group of Object.values(groups)) {
        totalTerminals += Object.keys(group.terminals || {}).length;
      }
    }
    // +1 so the next terminal gets the right number
    state.nextTerminalNumber = totalTerminals + 1;
  }

  // v10 → v11: Add collapsedGroupIds + groupOrder
  if (version < 11) {
    const groups = state.groups as Record<string, GroupLayoutState> | undefined;
    const allGroupIds = groups ? Object.keys(groups) : [];
    if (!state.groupOrder) state.groupOrder = allGroupIds;
    if (!state.collapsedGroupIds) {
      state.collapsedGroupIds = allGroupIds.filter(
        (id) => id !== state.activeGroupId,
      );
    }
  }

  // v11 → v12: Rename focusedGroupId back to activeGroupId
  if (version < 12) {
    const stateWithLegacy = state as unknown as ConsoleLayoutState & {
      focusedGroupId?: string | null;
    };
    if (stateWithLegacy.focusedGroupId !== undefined) {
      state.activeGroupId = stateWithLegacy.focusedGroupId;
      delete stateWithLegacy.focusedGroupId;
    }
  }

  // v12 → v13: Remove nextTerminalNumber (replaced by gap-filling labels)
  if (version < 13) {
    const stateWithCounter = state as unknown as ConsoleLayoutState & {
      nextTerminalNumber?: number;
    };
    delete stateWithCounter.nextTerminalNumber;
  }

  // v14 → v15: Migrate "split" layout mode to "tiling"
  if (version < 15) {
    if (state.layoutMode === "split") state.layoutMode = "tiling";
  }

  // v15 → v16: Convert bare { type: "claude" } placeholder leaves to { type: "empty" }
  // Only converts claude leaves that aren't backed by actual Claude sessions.
  if (version < 16) {
    const groups = state.groups as Record<string, GroupLayoutState> | undefined;
    if (groups) {
      for (const [gid, group] of Object.entries(groups)) {
        const leaves = collectLeaves(group.paneTree);
        const hasClaudeSessions = Object.values(group.terminals || {}).some(
          (m: TerminalMeta) => m.isClaudeSession,
        );
        if (!hasClaudeSessions) {
          let tree = group.paneTree;
          for (const leaf of leaves) {
            if ((leaf.content as { type: string }).type === "claude") {
              tree = replaceNode(tree, leaf.id, {
                ...leaf,
                content: { type: "empty" },
              });
            }
          }
          groups[gid] = { ...group, paneTree: tree };
        }
      }
    }
  }

  // v16 → v17: Convert ALL remaining { type: "claude" } leaves to { type: "empty" }
  // The "claude" pane type has been removed — all sessions use { type: "terminal" } now.
  if (version < 17) {
    const groups = state.groups as Record<string, GroupLayoutState> | undefined;
    if (groups) {
      for (const [gid, group] of Object.entries(groups)) {
        const leaves = collectLeaves(group.paneTree);
        let tree = group.paneTree;
        for (const leaf of leaves) {
          if ((leaf.content as { type: string }).type === "claude") {
            tree = replaceNode(tree, leaf.id, {
              ...leaf,
              content: { type: "empty" },
            });
          }
        }
        if (tree !== group.paneTree) {
          groups[gid] = { ...group, paneTree: tree };
        }
      }
    }
  }

  // v13 → v14: Seed tabOrder from existing pane tree leaves for each group
  if (version < 14) {
    const groups = state.groups as Record<string, GroupLayoutState> | undefined;
    if (groups) {
      for (const [gid, group] of Object.entries(groups)) {
        if (!group.tabOrder) {
          const leaves = collectLeaves(group.paneTree);
          const termIds = leaves
            .filter((l) => l.content.type === "terminal")
            .map((l) => (l.content as { terminalId: string }).terminalId);
          (groups[gid] as GroupLayoutState).tabOrder = termIds;
        }
      }
    }
  }

  return state;
}
