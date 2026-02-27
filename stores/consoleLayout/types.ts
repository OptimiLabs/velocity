import type {
  PaneNode,
  PaneId,
  PaneContent,
  TerminalMeta,
  GroupLayoutState,
} from "@/types/console";
import type { LayoutPreset } from "@/lib/console/layout-presets";
import { defaultLayout } from "@/lib/console/pane-tree";

export type LayoutMode = "tabbed" | "tiling";

export function defaultGroupLayout(): GroupLayoutState {
  return {
    paneTree: defaultLayout(),
    focusedPaneId: null,
    activePaneId: null,
    terminals: {},
    tabOrder: [],
  };
}

export interface ConsoleLayoutState {
  /** Whether the persisted state has been rehydrated. Gates first render. */
  _hydrated: boolean;

  layoutMode: LayoutMode;

  // --- Multi-group state ---
  groups: Record<string, GroupLayoutState>;
  /** Which group has keyboard focus (derived fields sync from this group) */
  activeGroupId: string | null;
  /** Which groups are collapsed in the accordion */
  collapsedGroupIds: string[];
  /** Explicit ordering for the accordion */
  groupOrder: string[];

  pinnedSessionIds: string[];
  activeSessionId: string | null;
  tabbedSidePanel?: "context" | "settings";

  // Whether the context panel is open (global, drives injection on group switch)
  contextPanelOpen: boolean;

  // Whether the paste history panel is open
  pasteHistoryOpen: boolean;
  setPasteHistoryOpen: (open: boolean) => void;

  // Monotonic tick used to request re-focus of the active terminal.
  focusRequestSeq: number;
  requestActiveTerminalFocus: () => void;

  // Layout presets
  savedPresets: LayoutPreset[];
  savePreset: (name: string) => void;
  deletePreset: (name: string) => void;
  applyPreset: (paneTree: PaneNode) => void;

  // Drag state (transient, not persisted)
  isDraggingPane: boolean;

  // Maximize pane state (persisted)
  maximizedPaneId: string | null;
  toggleMaximizedPane: () => void;

  // --- Derived from focused group (synced by updateActiveGroup / group actions) ---
  paneTree: PaneNode;
  focusedPaneId: PaneId | null;
  activePaneId: PaneId | null;
  terminals: Record<string, TerminalMeta>;

  // --- Unified actions ---
  addTerminal: (
    meta: TerminalMeta,
    orientation?: "h" | "v",
    groupId?: string,
  ) => string;
  removeTerminal: (terminalId: string) => void;
  updateTerminalMeta: (
    terminalId: string,
    updates: Partial<TerminalMeta>,
  ) => void;
  consumePendingPrompt: (terminalId: string) => string | undefined;
  setActivePaneId: (paneId: PaneId | null) => void;
  setTabbedSidePanel: (panel?: "context" | "settings") => void;
  setLayoutMode: (mode: LayoutMode) => void;
  setActiveSessionId: (id: string | null) => void;

  // Tiling actions
  splitPaneAction: (
    paneId: PaneId,
    orientation: "horizontal" | "vertical",
    content: PaneContent,
  ) => void;
  closePaneAction: (paneId: PaneId) => void;
  setFocusedPane: (paneId: PaneId | null) => void;
  updatePaneSizes: (splitId: PaneId, sizes: [number, number]) => void;
  swapPanesAction: (idA: PaneId, idB: PaneId) => void;
  movePaneAction: (
    sourceId: PaneId,
    targetId: PaneId,
    position: "left" | "right" | "top" | "bottom",
  ) => void;

  setIsDraggingPane: (v: boolean) => void;

  // Multi-session tiling
  pinSession: (id: string) => void;
  unpinSession: (id: string) => void;
  setTiledLayout: (root: PaneNode) => void;

  // --- Group actions ---
  createGroup: (id: string) => void;
  /** Create a group layout if it doesn't exist, without switching to it. */
  ensureGroup: (id: string) => void;
  switchGroup: (groupId: string) => void;
  setActiveGroup: (groupId: string) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  removeGroup: (groupId: string) => void;

  /** Get a specific group's layout state */
  getGroupState: (groupId: string) => GroupLayoutState | undefined;

  // Legacy action names (thin wrappers)
  addTerminalTab: (tab: {
    id: string;
    label: string;
    cwd: string;
    envOverrides?: Record<string, string>;
  }) => void;
  removeTerminalTab: (id: string) => void;
  setActiveTab: (tab: "terminal" | "env" | "settings" | "context") => void;
  setActiveTerminalTab: (id: string | null) => void;
  updateTerminalEnv: (id: string, env: Record<string, string>) => void;
  reorderTerminalTabs: (fromId: string, toId: string, groupId?: string) => void;
  detachPaneToTab: (paneId: PaneId) => void;
  mergePanes: () => void;
}
