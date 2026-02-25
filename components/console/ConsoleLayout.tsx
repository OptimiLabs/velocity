"use client";

import {
  memo,
  useCallback,
  useState,
  useMemo,
  useRef,
  useEffect,
  type DragEvent,
} from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { LayoutToolbar } from "./LayoutToolbar";
import { TilingPane } from "./TilingPane";
import { TabDropOverlay, getEdgeZone, type DropZone } from "./TabDropOverlay";
import { TabbedModeContent } from "./TabbedModeContent";
import { resolveActivePane } from "@/lib/console/resolve-active-pane";
import {
  collectLeaves,
  defaultLayout,
  findNode,
  findLeafByContent,
  movePane,
} from "@/lib/console/pane-tree";
import { useShallow } from "zustand/react/shallow";
import type {
  ConsoleSession,
  PaneNode,
  PaneId,
  TerminalMeta,
} from "@/types/console";
import { toast } from "sonner";
import { clearTerminalBuffer } from "@/lib/console/terminal-registry";
import { clearSerializedBuffer, clearPromptTracker } from "@/lib/console/terminal-cache";
import { deleteScrollback } from "@/lib/console/terminal-db";

interface ConsoleLayoutProps {
  session: ConsoleSession | null;
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  /** Optional: group-specific data. Falls back to store reads. */
  groupId?: string;
  groupPaneTree?: PaneNode;
  groupTerminals?: Record<string, TerminalMeta>;
  groupActivePaneId?: PaneId | null;
  groupFocusedPaneId?: PaneId | null;
}

export const ConsoleLayout = memo(function ConsoleLayout({
  session,
  wsRef,
  wsVersion,
  groupId,
  groupPaneTree,
  groupTerminals,
  groupActivePaneId,
  groupFocusedPaneId,
}: ConsoleLayoutProps) {
  // Derive connection state
  const connected = useMemo(
    () => wsRef.current?.readyState === WebSocket.OPEN,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wsVersion],
  );

  const {
    hydrated,
    layoutMode,
    isDraggingPane,
    addTerminal,
    removeTerminal,
    updateTerminalMeta,
    activeSessionId,
    setActivePaneIdForSync,
    storeActiveGroupId,
    storePaneTree,
    storeActivePaneId,
    storeTerminals,
    groupTabOrder,
  } = useConsoleLayoutStore(
    useShallow((s) => {
      const gid = groupId ?? s.activeGroupId ?? Object.keys(s.groups)[0];
      return {
        hydrated: s._hydrated,
        layoutMode: s.layoutMode,
        isDraggingPane: s.isDraggingPane,
        addTerminal: s.addTerminal,
        removeTerminal: s.removeTerminal,
        updateTerminalMeta: s.updateTerminalMeta,
        activeSessionId: s.activeSessionId,
        setActivePaneIdForSync: s.setActivePaneId,
        storeActiveGroupId: s.activeGroupId,
        storePaneTree: groupPaneTree === undefined ? s.paneTree : null,
        storeActivePaneId:
          groupActivePaneId === undefined ? s.activePaneId : null,
        storeTerminals: groupTerminals === undefined ? s.terminals : null,
        groupTabOrder: gid ? s.groups[gid]?.tabOrder : undefined,
      };
    }),
  );

  const paneTree = groupPaneTree ?? storePaneTree ?? defaultLayout();
  const activePaneId =
    groupActivePaneId !== undefined ? groupActivePaneId : storeActivePaneId;
  const terminals = groupTerminals ?? storeTerminals ?? {};

  const [dropZone, setDropZone] = useState<DropZone>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCreateTerminal = useCallback(() => {
    if (!session?.id) {
      toast.error("Select or create a session first.");
      return;
    }
    const activeLeaf = activePaneId ? findNode(paneTree, activePaneId) : null;
    const activeTermId =
      activeLeaf?.kind === "leaf" && activeLeaf.content.type === "terminal"
        ? activeLeaf.content.terminalId
        : null;
    const activeCwd = activeTermId ? terminals[activeTermId]?.cwd : null;
    addTerminal(
      {
        cwd: activeCwd || session?.cwd || "~",
        sessionId: session.id,
      },
      undefined,
      groupId,
    );
  }, [
    addTerminal,
    paneTree,
    activePaneId,
    terminals,
    session?.cwd,
    session?.id,
    session,
    groupId,
  ]);

  const handleRemoveTerminal = useCallback(
    (terminalId: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "pty:close", terminalId }));
      }
      removeTerminal(terminalId);
      clearTerminalBuffer(terminalId);
      clearSerializedBuffer(terminalId);
      clearPromptTracker(terminalId);
      deleteScrollback(terminalId);
    },
    [wsRef, removeTerminal],
  );

  // --- Tab-to-content drop handlers ---
  const lastDragCalcRef = useRef(0);
  const handleContentDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes("text/tab-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const now = Date.now();
    if (now - lastDragCalcRef.current < 50) return;
    lastDragCalcRef.current = now;
    if (contentRef.current) {
      setDropZone(getEdgeZone(e, contentRef.current));
    }
  }, []);

  const handleContentDragLeave = useCallback(() => {
    setDropZone(null);
  }, []);

  const handleContentDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const sourcePaneId = e.dataTransfer.getData("text/pane-id");
    const zone = contentRef.current ? getEdgeZone(e, contentRef.current) : null;
    setDropZone(null);

    if (!sourcePaneId || !zone) return;

    // Use group-specific tree, not store.paneTree (which is the active group's derived state)
    const anchorLeaf = findLeafByContent(
      paneTree,
      (c) => c.type === "empty",
    );
    if (!anchorLeaf || sourcePaneId === anchorLeaf.id) return;

    const newTree = movePane(paneTree, sourcePaneId, anchorLeaf.id, zone);
    const store = useConsoleLayoutStore.getState();
    store.setTiledLayout(newTree);
    store.setLayoutMode("tiling");
    store.setFocusedPane(sourcePaneId);
  }, [paneTree]);

  // Derive leaves from tree
  const leaves = useMemo(() => collectLeaves(paneTree), [paneTree]);
  const allTerminalLeaves = useMemo(() => {
    const termLeaves = leaves.filter((l) => l.content.type === "terminal");
    const order = groupTabOrder ?? [];
    const orderMap = new Map(order.map((id, i) => [id, i]));
    return termLeaves.sort((a, b) => {
      const aId = a.content.type === "terminal" ? a.content.terminalId : "";
      const bId = b.content.type === "terminal" ? b.content.terminalId : "";
      return (orderMap.get(aId) ?? Infinity) - (orderMap.get(bId) ?? Infinity);
    });
  }, [leaves, groupTabOrder]);

  // Track which sessions have been visited — their terminals stay mounted permanently.
  const [mountedSessionIds, setMountedSessionIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const effectiveId = activeSessionId ?? session?.id;
    if (effectiveId) initial.add(effectiveId);
    return initial;
  });

  // Add new sessions to the mounted set as they become active
  useEffect(() => {
    const effectiveId = activeSessionId ?? session?.id;
    if (effectiveId) {
      setMountedSessionIds((prev) => {
        if (prev.has(effectiveId)) return prev;
        const next = new Set(prev);
        next.add(effectiveId);
        return next;
      });
    }
  }, [activeSessionId, session?.id]);

  // Session-filtered leaves for resolveActivePane (active session only)
  const activeSessionTerminalLeaves = useMemo(() => {
    const effectiveSessionId = activeSessionId ?? session?.id;
    if (!effectiveSessionId) return allTerminalLeaves;
    return allTerminalLeaves.filter((leaf) => {
      if (leaf.content.type !== "terminal") return false;
      const meta = terminals[leaf.content.terminalId];
      if (!meta?.sessionId) return true; // Keep terminals without a session (legacy)
      return meta.sessionId === effectiveSessionId;
    });
  }, [allTerminalLeaves, terminals, session?.id, activeSessionId]);

  // Leaves for rendering — includes all visited sessions (prevents unmount/remount)
  const mountedTerminalLeaves = useMemo(() => {
    if (mountedSessionIds.size === 0) return allTerminalLeaves;
    return allTerminalLeaves.filter((leaf) => {
      if (leaf.content.type !== "terminal") return false;
      const meta = terminals[leaf.content.terminalId];
      if (!meta?.sessionId) return true;
      return mountedSessionIds.has(meta.sessionId);
    });
  }, [allTerminalLeaves, terminals, mountedSessionIds]);
  const settingsLeafExists = useMemo(
    () => leaves.some((l) => l.content.type === "settings"),
    [leaves],
  );
  const contextLeafExists = useMemo(
    () => leaves.some((l) => l.content.type === "context"),
    [leaves],
  );

  // Single source of truth for which pane is visible
  const visibility = useMemo(
    () =>
      resolveActivePane({
        activePaneId,
        paneTree,
        terminalLeaves: activeSessionTerminalLeaves,
        settingsLeafExists,
        contextLeafExists,
        activeSessionId,
      }),
    [
      activePaneId,
      paneTree,
      activeSessionTerminalLeaves,
      settingsLeafExists,
      contextLeafExists,
      activeSessionId,
    ],
  );

  // Sync store's activePaneId when resolveActivePane redirects (tabbed mode only)
  // Bug fix: only sync for the active group — non-active group ConsoleLayout
  // instances must not write to the store's activePaneId.
  useEffect(() => {
    if (
      layoutMode !== "tiling" &&
      visibility.activePaneId &&
      visibility.activePaneId !== activePaneId &&
      (!groupId || groupId === storeActiveGroupId)
    ) {
      setActivePaneIdForSync(visibility.activePaneId);
    }
  }, [layoutMode, visibility.activePaneId, activePaneId, setActivePaneIdForSync, groupId, storeActiveGroupId]);

  // Gate rendering until persisted state has been rehydrated
  if (!hydrated) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const showDropOverlay = isDraggingPane && layoutMode !== "tiling";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {!connected && (
        <div className="shrink-0 px-3 py-1 bg-amber-500/15 border-b border-amber-500/30 text-center">
          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Reconnecting...
          </span>
        </div>
      )}
      <LayoutToolbar
        groupId={groupId}
        activeSessionId={activeSessionId ?? session?.id}
        onCreateTerminal={handleCreateTerminal}
        onRemoveTerminal={handleRemoveTerminal}
      />
      <div
        ref={contentRef}
        className="flex-1 overflow-hidden relative"
        onDragOver={showDropOverlay ? handleContentDragOver : undefined}
        onDragLeave={showDropOverlay ? handleContentDragLeave : undefined}
        onDrop={showDropOverlay ? handleContentDrop : undefined}
      >
        {layoutMode === "tiling" ? (
          <TilingPane
            node={paneTree}
            session={session}
            wsRef={wsRef}
            wsVersion={wsVersion}
            isOnly={paneTree.kind === "leaf"}
            groupTerminals={groupTerminals}
            groupActivePaneId={groupActivePaneId}
            groupFocusedPaneId={groupFocusedPaneId}
            groupActiveSessionId={activeSessionId ?? session?.id}
          />
        ) : (
          <TabbedModeContent
            visibility={visibility}
            session={session}
            terminalLeaves={mountedTerminalLeaves}
            terminals={terminals}
            settingsLeafExists={settingsLeafExists}
            contextLeafExists={contextLeafExists}
            wsRef={wsRef}
            wsVersion={wsVersion}
            onCreateTerminal={handleCreateTerminal}
            onUpdateTerminalMeta={updateTerminalMeta}
            groupId={groupId}
          />
        )}

        {showDropOverlay && <TabDropOverlay zone={dropZone} />}
      </div>
    </div>
  );
});
