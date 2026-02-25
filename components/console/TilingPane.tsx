"use client";

import { useCallback, useState, useRef, useEffect, useLayoutEffect, memo, type DragEvent } from "react";
import dynamic from "next/dynamic";
import { Group, Panel, Separator, type PanelImperativeHandle } from "react-resizable-panels";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { useShallow } from "zustand/react/shallow";
import { SettingsPanel } from "./SettingsPanel";
import { ContextPanel } from "./ContextPanel";
import { PaneHeader, getDraggedPaneId } from "./PaneHeader";
import { clearTerminalBuffer } from "@/lib/console/terminal-registry";
import { clearSerializedBuffer, clearPromptTracker, disposeTerminalDomCache } from "@/lib/console/terminal-cache";
import { EmptyTerminalPrompt } from "./EmptyTerminalPrompt";
import { deleteScrollback } from "@/lib/console/terminal-db";
import type { PaneNode, ConsoleSession, PaneId, TerminalMeta } from "@/types/console";

const TerminalPanel = dynamic(
  () => import("./TerminalPanel").then((m) => ({ default: m.TerminalPanel })),
  { ssr: false },
);

function containsPane(node: PaneNode, paneId: string): boolean {
  if (node.id === paneId) return true;
  if (node.kind === "split") {
    return containsPane(node.children[0], paneId) || containsPane(node.children[1], paneId);
  }
  return false;
}

/**
 * Pass-through filter to keep all panes mounted (prevents refresh/flicker).
 */
function filterPaneTree(node: PaneNode): PaneNode | null {
  return node;
}

function nodeHasVisibleContent(opts: {
  node: PaneNode;
  terminals: Record<string, { sessionId?: string; isClaudeSession?: boolean }>;
  activeSessionId: string | null;
  sessionId?: string;
  activePaneId: string | null;
}): boolean {
  const { node, terminals, activeSessionId, sessionId, activePaneId } = opts;
  const effectiveSessionId = activeSessionId ?? sessionId ?? null;
  if (node.kind === "split") {
    return (
      nodeHasVisibleContent({ ...opts, node: node.children[0] }) ||
      nodeHasVisibleContent({ ...opts, node: node.children[1] })
    );
  }

  if (!effectiveSessionId) return true;

  switch (node.content.type) {
    case "terminal": {
      const meta = terminals[node.content.terminalId];
      if (!meta?.sessionId) return true;
      if (activePaneId === node.id) return true; // Active pane always visible (covers timing gap)
      return meta.sessionId === effectiveSessionId;
    }
    case "settings":
    case "context":
      return activePaneId === node.id;
    case "empty":
      return true;
    default:
      return true;
  }
}

type DropZone = "left" | "right" | "top" | "bottom" | "center" | null;

function getDropZone(e: DragEvent, el: HTMLElement): DropZone {
  const rect = el.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const edgeThreshold = 0.25;

  if (x < edgeThreshold) return "left";
  if (x > 1 - edgeThreshold) return "right";
  if (y < edgeThreshold) return "top";
  if (y > 1 - edgeThreshold) return "bottom";
  return "center";
}

interface TilingPaneProps {
  node: PaneNode;
  session: ConsoleSession | null;
  wsRef: React.RefObject<WebSocket | null>;
  wsVersion?: number;
  isOnly?: boolean;
  /** Group-specific terminal metadata (avoids reading wrong group from store) */
  groupTerminals?: Record<string, TerminalMeta>;
  /** Group-specific active pane ID */
  groupActivePaneId?: PaneId | null;
  /** Group-specific focused pane ID */
  groupFocusedPaneId?: PaneId | null;
  /** Group-specific active session ID */
  groupActiveSessionId?: string | null;
}

export const TilingPane = memo(function TilingPaneInner({
  node,
  session,
  wsRef,
  wsVersion,
  isOnly,
  groupTerminals,
  groupActivePaneId,
  groupFocusedPaneId,
  groupActiveSessionId,
}: TilingPaneProps) {
  const {
    closePaneAction,
    updatePaneSizes,
    setFocusedPane,
    swapPanesAction,
    movePaneAction,
    isDraggingPane,
    storeFocusedPaneId,
    storeTerminals,
    maximizedPaneId,
    storeActiveSessionId,
    storeActivePaneId,
  } = useConsoleLayoutStore(
    useShallow((s) => ({
      closePaneAction: s.closePaneAction,
      updatePaneSizes: s.updatePaneSizes,
      setFocusedPane: s.setFocusedPane,
      swapPanesAction: s.swapPanesAction,
      movePaneAction: s.movePaneAction,
      isDraggingPane: s.isDraggingPane,
      maximizedPaneId: s.maximizedPaneId,
      storeFocusedPaneId:
        groupFocusedPaneId === undefined ? s.focusedPaneId : null,
      storeTerminals: groupTerminals === undefined ? s.terminals : null,
      storeActiveSessionId:
        groupActiveSessionId === undefined ? s.activeSessionId : null,
      storeActivePaneId:
        groupActivePaneId === undefined ? s.activePaneId : null,
    })),
  );

  // Use group-specific data when provided, fall back to store
  const terminals = groupTerminals ?? storeTerminals ?? {};
  const activePaneId =
    groupActivePaneId !== undefined ? groupActivePaneId : storeActivePaneId;
  const focusedPaneId =
    groupFocusedPaneId !== undefined ? groupFocusedPaneId : storeFocusedPaneId;
  const activeSessionId =
    groupActiveSessionId !== undefined
      ? groupActiveSessionId
      : storeActiveSessionId;

  const isFocused = node.kind === "leaf" && focusedPaneId === node.id;

  const [dropZone, setDropZone] = useState<DropZone>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<PanelImperativeHandle | null>(null);
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const layoutRafRef = useRef<number | null>(null);
  const pendingLayoutRef = useRef<[number, number] | null>(null);
  const lastSizesRef = useRef<[number, number]>([
    Math.max(node.kind === "split" ? (node.sizes?.[0] ?? 50) : 50, 10),
    Math.max(node.kind === "split" ? (node.sizes?.[1] ?? 50) : 50, 10),
  ]);
  // Reset saved sizes from store when node identity or stored sizes change (e.g. group switch)
  const nodeSizes = node.kind === "split" ? node.sizes : undefined;
  useEffect(() => {
    if (node.kind === "split" && nodeSizes) {
      lastSizesRef.current = [
        Math.max(nodeSizes[0] ?? 50, 10),
        Math.max(nodeSizes[1] ?? 50, 10),
      ];
    }
  }, [node.id, node.kind, nodeSizes]);
  // Guard: blocks onLayoutChanged store updates while effect is adjusting panels
  const isEffectResizingRef = useRef(false);

  const effectiveSessionId = session?.id ?? activeSessionId ?? null;

  const isLeafVisible = useCallback(
    (leaf: PaneNode & { kind: "leaf" }) =>
      nodeHasVisibleContent({
        node: leaf,
        terminals,
        activeSessionId: effectiveSessionId,
        sessionId: session?.id,
        activePaneId,
      }),
    [terminals, effectiveSessionId, session?.id, activePaneId],
  );

  const handleClose = useCallback(() => {
    if (node.kind === "leaf" && node.content.type === "terminal") {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "pty:close",
            terminalId: node.content.terminalId,
          }),
        );
      }
      disposeTerminalDomCache(node.content.terminalId);
      useConsoleLayoutStore.getState().removeTerminal(node.content.terminalId);
      clearTerminalBuffer(node.content.terminalId);
      clearSerializedBuffer(node.content.terminalId);
      clearPromptTracker(node.content.terminalId);
      deleteScrollback(node.content.terminalId);
    } else {
      closePaneAction(node.id);
    }
  }, [node, closePaneAction, wsRef]);

  // --- Drop zone handlers ---
  const handleDragOver = useCallback(
    (e: DragEvent) => {
      if (node.kind !== "leaf") return;
      const sourceId = getDraggedPaneId();
      const isTabDrag =
        !sourceId && e.dataTransfer.types.includes("text/tab-id");
      if (!sourceId && !isTabDrag) return;
      if (sourceId === node.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (containerRef.current) {
        setDropZone(getDropZone(e, containerRef.current));
      }
    },
    [node],
  );

  const handleDragLeave = useCallback(() => {
    setDropZone(null);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      if (node.kind !== "leaf") {
        setDropZone(null);
        return;
      }

      const sourceId = getDraggedPaneId();
      const tabId = e.dataTransfer.getData("text/tab-id");
      const zone = containerRef.current
        ? getDropZone(e, containerRef.current)
        : "center";

      if (sourceId && sourceId !== node.id) {
        if (zone === "center") {
          swapPanesAction(sourceId, node.id);
        } else if (zone) {
          movePaneAction(sourceId, node.id, zone);
        }
      } else if (tabId) {
        const sourcePaneId = e.dataTransfer.getData("text/pane-id");
        if (sourcePaneId && sourcePaneId !== node.id) {
          if (zone === "center") {
            swapPanesAction(sourcePaneId, node.id);
          } else if (zone) {
            movePaneAction(sourcePaneId, node.id, zone);
          }
        }
      }

      setDropZone(null);
    },
    [node, swapPanesAction, movePaneAction],
  );

  const leftVisible =
    node.kind === "split"
      ? nodeHasVisibleContent({
          node: node.children[0],
          terminals,
          activeSessionId: effectiveSessionId,
          sessionId: session?.id,
          activePaneId,
        })
      : true;
  const rightVisible =
    node.kind === "split"
      ? nodeHasVisibleContent({
          node: node.children[1],
          terminals,
          activeSessionId: effectiveSessionId,
          sessionId: session?.id,
          activePaneId,
        })
      : true;
  // Never collapse both children — a fully invisible split is never desired
  const bothInvisible = !leftVisible && !rightVisible;
  const shouldCollapseLeft =
    node.kind === "split" && !!effectiveSessionId && !leftVisible && !bothInvisible;
  const shouldCollapseRight =
    node.kind === "split" && !!effectiveSessionId && !rightVisible && !bothInvisible;

  useLayoutEffect(() => {
    if (node.kind !== "split") return;
    const leftPanel = leftPanelRef.current;
    const rightPanel = rightPanelRef.current;
    if (!leftPanel || !rightPanel) return;

    // Only save sizes when both panels are expanded — if one is collapsed
    // or about to be collapsed, the current sizes reflect a transitional
    // state (e.g. a fresh 50/50 split where one side is immediately invisible).
    // Saving those would cause the visible panel to be resized to 50% instead
    // of auto-filling to 100%.
    if (!shouldCollapseLeft && !shouldCollapseRight) {
      const leftSizeRaw = leftPanel.getSize();
      const rightSizeRaw = rightPanel.getSize();
      const leftSize = typeof leftSizeRaw === "number" ? leftSizeRaw : leftSizeRaw.asPercentage;
      const rightSize = typeof rightSizeRaw === "number" ? rightSizeRaw : rightSizeRaw.asPercentage;
      if (leftSize > 0) lastSizesRef.current[0] = leftSize;
      if (rightSize > 0) lastSizesRef.current[1] = rightSize;
    }

    // Block onLayoutChanged from updating the store while we adjust panels —
    // resize/collapse/expand fire onLayoutChanged synchronously, which would
    // trigger a store update → re-render → effect re-fire → infinite loop.
    isEffectResizingRef.current = true;

    if (shouldCollapseLeft) {
      leftPanel.collapse();
    } else {
      leftPanel.expand();
      // Only restore saved size when BOTH panels are visible.
      // When the other panel is collapsed, let react-resizable-panels
      // auto-fill this panel to 100% — explicitly resizing to 50% would
      // leave the terminal at half-width.
      if (!shouldCollapseRight && lastSizesRef.current[0] > 0) {
        leftPanel.resize(lastSizesRef.current[0]);
      }
    }

    if (shouldCollapseRight) {
      rightPanel.collapse();
    } else {
      rightPanel.expand();
      if (!shouldCollapseLeft && lastSizesRef.current[1] > 0) {
        rightPanel.resize(lastSizesRef.current[1]);
      }
    }

    isEffectResizingRef.current = false;
  }, [node.kind, node.id, shouldCollapseLeft, shouldCollapseRight, nodeSizes]);

  useEffect(() => {
    return () => {
      if (layoutRafRef.current !== null) {
        cancelAnimationFrame(layoutRafRef.current);
      }
    };
  }, []);

  if (node.kind === "leaf") {
    // If a pane is maximized and this isn't it, hide this leaf
    if (maximizedPaneId && node.id !== maximizedPaneId) return null;

    const isVisibleForSession = isLeafVisible(node);

    return (
      <div
        ref={containerRef}
        className={`absolute inset-0 flex flex-col overflow-hidden ${isFocused ? "ring-1 ring-primary/40 ring-inset" : ""}`}
        style={{
          visibility: isVisibleForSession ? "visible" : "hidden",
          pointerEvents: isVisibleForSession ? "auto" : "none",
        }}
        onMouseDown={() => setFocusedPane(node.id)}
      >
        {/* Maximized badge */}
        {maximizedPaneId === node.id && (
          <div className="absolute top-1 right-2 z-30 px-2 py-0.5 rounded bg-primary/15 text-[10px] text-muted-foreground font-medium pointer-events-none">
            Maximized — ⌘⇧↵ to restore
          </div>
        )}
        <PaneHeader
          node={node}
          onClose={handleClose}
          isOnly={isOnly}
          terminals={terminals}
        />
        {/* Invisible drag overlay — sits above xterm canvas so drag events fire */}
        {isDraggingPane && getDraggedPaneId() !== node.id && (
          <div
            className="absolute inset-0 z-20 top-6"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        )}
        <div className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0">
            {node.content.type === "terminal" &&
              (() => {
                const meta = terminals[node.content.terminalId];
                return (
                  <TerminalPanel
                    key={node.content.terminalId}
                    terminalId={node.content.terminalId}
                    cwd={meta?.cwd || session?.cwd || "~"}
                    wsRef={wsRef}
                    wsVersion={wsVersion}
                    command={meta?.command}
                    args={meta?.args}
                    isActive={isFocused}
                  />
                );
              })()}
            {node.content.type === "settings" && <SettingsPanel wsRef={wsRef} />}
            {node.content.type === "context" && (
              <ContextPanel session={session} />
            )}
            {node.content.type === "empty" && (
              <EmptyTerminalPrompt onCreateTerminal={() => {
                // Trigger ⌘T equivalent — will replace this empty pane via addTerminal
              }} />
            )}
          </div>
        </div>



        {/* Drop zone overlay */}
        {dropZone && <DropIndicator zone={dropZone} />}
      </div>
    );
  }

  // Split node

  // If a pane is maximized, skip the split structure and render only the branch containing it
  if (maximizedPaneId) {
    if (containsPane(node.children[0], maximizedPaneId)) {
      return (
        <TilingPane
          node={node.children[0]}
          session={session}
          wsRef={wsRef}
          wsVersion={wsVersion}
          groupTerminals={groupTerminals}
          groupActivePaneId={groupActivePaneId}
          groupActiveSessionId={groupActiveSessionId}
          groupFocusedPaneId={groupFocusedPaneId}
        />
      );
    }
    if (containsPane(node.children[1], maximizedPaneId)) {
      return (
        <TilingPane
          node={node.children[1]}
          session={session}
          wsRef={wsRef}
          wsVersion={wsVersion}
          groupTerminals={groupTerminals}
          groupActivePaneId={groupActivePaneId}
          groupActiveSessionId={groupActiveSessionId}
          groupFocusedPaneId={groupFocusedPaneId}
        />
      );
    }
    // Maximized pane not in this subtree — don't render
    return null;
  }

  // Keep all panes mounted; visibility is handled by pane focus.
  const filteredLeft = filterPaneTree(node.children[0]);
  const filteredRight = filterPaneTree(node.children[1]);

  // If both children are pruned, render nothing
  if (!filteredLeft && !filteredRight) return null;

  // If one child is pruned, render only the survivor (skip the split wrapper)
  if (!filteredLeft && filteredRight) {
    return (
      <TilingPane
        node={filteredRight}
        session={session}
        wsRef={wsRef}
        wsVersion={wsVersion}
        groupTerminals={groupTerminals}
        groupActivePaneId={groupActivePaneId}
        groupActiveSessionId={groupActiveSessionId}
      />
    );
  }
  if (filteredLeft && !filteredRight) {
    return (
      <TilingPane
        node={filteredLeft}
        session={session}
        wsRef={wsRef}
        wsVersion={wsVersion}
        groupTerminals={groupTerminals}
        groupActivePaneId={groupActivePaneId}
        groupActiveSessionId={groupActiveSessionId}
      />
    );
  }

  const orientation = node.orientation;
  const separatorClass =
    orientation === "horizontal"
      ? "w-1 bg-border/30 hover:bg-primary/30 transition-colors cursor-col-resize"
      : "h-1 bg-border/30 hover:bg-primary/30 transition-colors cursor-row-resize";
  const showSeparator = leftVisible && rightVisible;

  return (
    <Group
      orientation={orientation}
      id={`split-${node.id}`}
      onLayoutChanged={(layout) => {
        // Skip store updates triggered by effect-driven resize/collapse/expand
        if (isEffectResizingRef.current) return;
        const values = Object.values(layout);
        if (!(values.length === 2 && values[0] > 0 && values[1] > 0)) return;
        pendingLayoutRef.current = [values[0], values[1]];
        if (layoutRafRef.current !== null) return;
        layoutRafRef.current = requestAnimationFrame(() => {
          layoutRafRef.current = null;
          const pending = pendingLayoutRef.current;
          pendingLayoutRef.current = null;
          if (!pending) return;
          updatePaneSizes(node.id, pending);
        });
      }}
    >
      <Panel
        className="relative"
        defaultSize={node.sizes?.[0] ?? 50}
        minSize={10}
        collapsible
        collapsedSize={0}
        panelRef={leftPanelRef}
      >
        <TilingPane
          node={node.children[0]}
          session={session}
          wsRef={wsRef}
          wsVersion={wsVersion}
          groupTerminals={groupTerminals}
          groupActivePaneId={groupActivePaneId}
          groupActiveSessionId={groupActiveSessionId}
          groupFocusedPaneId={groupFocusedPaneId}
        />
      </Panel>
      {showSeparator && <Separator className={separatorClass} />}
      <Panel
        className="relative"
        defaultSize={node.sizes?.[1] ?? 50}
        minSize={10}
        collapsible
        collapsedSize={0}
        panelRef={rightPanelRef}
      >
        <TilingPane
          node={node.children[1]}
          session={session}
          wsRef={wsRef}
          wsVersion={wsVersion}
          groupTerminals={groupTerminals}
          groupActivePaneId={groupActivePaneId}
          groupActiveSessionId={groupActiveSessionId}
          groupFocusedPaneId={groupFocusedPaneId}
        />
      </Panel>
    </Group>
  );
});

/** Visual indicator showing where a dragged pane will land */
function DropIndicator({ zone }: { zone: DropZone }) {
  if (!zone) return null;

  if (zone === "center") {
    return (
      <div className="absolute inset-0 z-30 pointer-events-none border-2 border-primary/60 bg-primary/10 rounded-sm flex items-center justify-center">
        <span className="text-xs font-medium text-primary bg-background/80 px-2 py-1 rounded">
          Swap
        </span>
      </div>
    );
  }

  const positionClasses: Record<string, string> = {
    left: "left-0 top-0 w-1/3 h-full",
    right: "right-0 top-0 w-1/3 h-full",
    top: "left-0 top-0 w-full h-1/3",
    bottom: "left-0 bottom-0 w-full h-1/3",
  };

  const labels: Record<string, string> = {
    left: "Move Left",
    right: "Move Right",
    top: "Move Above",
    bottom: "Move Below",
  };

  return (
    <div
      className={`absolute z-30 pointer-events-none border-2 border-primary/60 bg-primary/10 rounded-sm flex items-center justify-center ${positionClasses[zone]}`}
    >
      <span className="text-xs font-medium text-primary bg-background/80 px-2 py-1 rounded">
        {labels[zone]}
      </span>
    </div>
  );
}
