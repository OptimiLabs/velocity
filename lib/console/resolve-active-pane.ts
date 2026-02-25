import type { PaneNode, PaneId } from "@/types/console";
import { findNode } from "./pane-tree";

export type ActivePaneKind =
  | "terminal"
  | "settings"
  | "context"
  | "empty-terminal";

export interface ResolvedVisibility {
  kind: ActivePaneKind;
  activePaneId: PaneId | null;
  activeTerminalPaneId: PaneId | null;
  activeClaudeSessionId: string | null;
}

export function resolveActivePane(opts: {
  activePaneId: PaneId | null;
  paneTree: PaneNode;
  terminalLeaves: Array<PaneNode & { kind: "leaf" }>;
  settingsLeafExists: boolean;
  contextLeafExists: boolean;
  activeSessionId: string | null;
}): ResolvedVisibility {
  const { activePaneId, paneTree, terminalLeaves } = opts;

  // 1. If activePaneId is set, resolve by looking up the node
  if (activePaneId) {
    const node = findNode(paneTree, activePaneId);

    if (node?.kind === "leaf") {
      switch (node.content.type) {
        case "settings":
          return {
            kind: "settings",
            activePaneId,
            activeTerminalPaneId: null,
            activeClaudeSessionId: null,
          };

        case "context":
          return {
            kind: "context",
            activePaneId,
            activeTerminalPaneId: null,
            activeClaudeSessionId: null,
          };

        case "terminal": {
          // Check if this terminal leaf has a matching entry in terminalLeaves
          const hasLeaf = terminalLeaves.some((l) => l.id === activePaneId);
          if (hasLeaf) {
            return {
              kind: "terminal",
              activePaneId,
              activeTerminalPaneId: activePaneId,
              activeClaudeSessionId: null,
            };
          }
          // Terminal belongs to a different session — redirect to first
          // session terminal if available, otherwise show empty prompt.
          if (terminalLeaves.length > 0) {
            return {
              kind: "terminal",
              activePaneId: terminalLeaves[0].id,
              activeTerminalPaneId: terminalLeaves[0].id,
              activeClaudeSessionId: null,
            };
          }
          return {
            kind: "empty-terminal",
            activePaneId,
            activeTerminalPaneId: null,
            activeClaudeSessionId: null,
          };
        }

        case "empty":
          return {
            kind: "empty-terminal",
            activePaneId,
            activeTerminalPaneId: null,
            activeClaudeSessionId: null,
          };
      }
    }

    // activePaneId points to a non-existent node — fall through to defaults
  }

  // 2. No activePaneId (or it was invalid): if terminals exist, first terminal is active
  if (terminalLeaves.length > 0) {
    return {
      kind: "terminal",
      activePaneId: terminalLeaves[0].id,
      activeTerminalPaneId: terminalLeaves[0].id,
      activeClaudeSessionId: null,
    };
  }

  // 3. Nothing at all — show empty terminal prompt
  return {
    kind: "empty-terminal",
    activePaneId: null,
    activeTerminalPaneId: null,
    activeClaudeSessionId: null,
  };
}
