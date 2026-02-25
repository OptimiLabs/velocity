"use client";

import { useMemo, useState, useEffect } from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { collectLeaves, findNode } from "@/lib/console/pane-tree";
import {
  Terminal,
  Settings,
  BookOpen,
  Plus,
  X,
  SquareStack,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";
import { ToolbarContextMenu } from "@/components/console/ToolbarContextMenu";


function getTabLabel(meta: { label?: string } | undefined, termId: string): string {
  if (meta?.label) return meta.label;
  return termId.replace(/^term-/, "Terminal ");
}

function shortenPath(p: string): string {
  if (!p) return "";
  const normalized = p.replace(/^\/(?:Users|home)\/[^/]+/, "~");
  const parts = normalized.split("/");
  if (parts.length <= 3) return normalized;
  return `${parts[0]}/…/${parts.slice(-2).join("/")}`;
}

interface LayoutToolbarProps {
  groupId?: string;
  activeSessionId?: string | null;
  onCreateTerminal: () => void;
  onRemoveTerminal?: (id: string) => void;
}

export function LayoutToolbar({
  groupId,
  activeSessionId: activeSessionIdProp,
  onCreateTerminal,
  onRemoveTerminal,
}: LayoutToolbarProps) {
  const store = useConsoleLayoutStore();
  const groupState = groupId ? store.groups[groupId] : null;
  const paneTree = groupState?.paneTree ?? store.paneTree;
  const terminals = groupState?.terminals ?? store.terminals;
  const activePaneId = groupState?.activePaneId ?? store.activePaneId;
  const {
    layoutMode,
    setActivePaneId,
    setLayoutMode,
    reorderTerminalTabs,
  } = store;

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; termId: string } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  useEffect(() => {
    if (!overflowOpen) return;
    const handleClick = () => setOverflowOpen(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [overflowOpen]);

  // Derive tabs from tree leaves
  const leaves = useMemo(() => collectLeaves(paneTree), [paneTree]);
  const tabOrder = useMemo(() => groupState?.tabOrder ?? [], [groupState?.tabOrder]);
  const allTerminalLeaves = useMemo(() => {
    const termLeaves = leaves.filter((l) => l.content.type === "terminal");
    const orderMap = new Map(tabOrder.map((id, i) => [id, i]));
    return termLeaves.sort((a, b) => {
      const aId = a.content.type === "terminal" ? a.content.terminalId : "";
      const bId = b.content.type === "terminal" ? b.content.terminalId : "";
      const aIdx = orderMap.get(aId) ?? Infinity;
      const bIdx = orderMap.get(bId) ?? Infinity;
      return aIdx - bIdx;
    });
  }, [leaves, tabOrder]);

  const terminalLeafById = useMemo(() => {
    const map = new Map<string, (typeof allTerminalLeaves)[number]>();
    for (const leaf of allTerminalLeaves) {
      const termId =
        leaf.content.type === "terminal" ? leaf.content.terminalId : "";
      if (termId) map.set(termId, leaf);
    }
    return map;
  }, [allTerminalLeaves]);

  // Filter terminal tabs to only show terminals belonging to the active session
  const activeSessionId = activeSessionIdProp ?? store.activeSessionId;
  const allTabs = useMemo(() => {
    if (!activeSessionId) return [];
    const tabs: Array<{
      leaf: (typeof leaves)[number];
      termId: string;
      meta: (typeof terminals)[string] | undefined;
    }> = [];
    const seen = new Set<string>();

    // Ordered pass from tabOrder
    for (const termId of tabOrder) {
      const meta = terminals[termId];
      if (!meta || meta.sessionId !== activeSessionId) continue;
      const leaf = terminalLeafById.get(termId);
      if (!leaf) continue;
      tabs.push({ leaf, termId, meta });
      seen.add(termId);
    }

    // Append any terminals missing from tabOrder (safety)
    for (const [termId, leaf] of terminalLeafById) {
      if (seen.has(termId)) continue;
      const meta = terminals[termId];
      if (!meta || meta.sessionId !== activeSessionId) continue;
      tabs.push({ leaf, termId, meta });
      seen.add(termId);
    }

    return tabs;
  }, [activeSessionId, tabOrder, terminals, terminalLeafById]);

  const MAX_VISIBLE_TABS = 6;
  const visibleTabs = allTabs.length > MAX_VISIBLE_TABS
    ? allTabs.slice(0, MAX_VISIBLE_TABS)
    : allTabs;
  const overflowTabs = allTabs.length > MAX_VISIBLE_TABS
    ? allTabs.slice(MAX_VISIBLE_TABS)
    : [];

  const settingsLeaf = useMemo(
    () => leaves.find((l) => l.content.type === "settings"),
    [leaves],
  );
  const contextLeaf = useMemo(
    () => leaves.find((l) => l.content.type === "context"),
    [leaves],
  );

  // Determine what's active
  const activeLeaf = activePaneId ? findNode(paneTree, activePaneId) : null;
  const isSettingsActive =
    activeLeaf?.kind === "leaf" && activeLeaf.content.type === "settings";
  const isContextActive =
    activeLeaf?.kind === "leaf" && activeLeaf.content.type === "context";

  return (
    <div className="flex items-center h-7 px-1 border-b border-border/50 bg-card/30 shrink-0 gap-0.5 overflow-x-auto relative z-10 min-w-0">
      {/* Terminal tabs (active session only) */}
      {visibleTabs.map((tab, visIdx) => {
        const { leaf, termId, meta } = tab;
        const isActive = activePaneId === leaf.id;
        return (
          <button
            key={termId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/tab-id", termId);
              e.dataTransfer.setData("text/pane-id", leaf.id);
              useConsoleLayoutStore.getState().setIsDraggingPane(true);
            }}
            onDragEnd={() => {
              useConsoleLayoutStore.getState().setIsDraggingPane(false);
              setDragOverIndex(null);
            }}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("text/tab-id")) return;
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = "move";
              setDragOverIndex(visIdx);
            }}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const fromId = e.dataTransfer.getData("text/tab-id");
              if (fromId && fromId !== termId) {
                reorderTerminalTabs(fromId, termId, groupId);
              }
              setDragOverIndex(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, termId });
            }}
            onClick={() => {
              setActivePaneId(leaf.id);
              if (meta?.sessionId && meta.sessionId !== activeSessionId) {
                useConsoleLayoutStore.getState().setActiveSessionId(meta.sessionId);
              }
              if (meta?.hasActivity) {
                useConsoleLayoutStore.getState().updateTerminalMeta(termId, { hasActivity: false });
              }
            }}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-t text-xs font-medium transition-colors whitespace-nowrap min-w-0 max-w-[160px] ${
              isActive
                ? meta?.tabColor
                  ? "border-b-2"
                  : "bg-primary/25 text-primary border-b-2 border-primary shadow-[inset_0_-2px_0_0] shadow-primary"
                : meta?.tabColor
                  ? "hover:bg-muted/50 border-b-2"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent"
            } ${dragOverIndex === visIdx ? "border-l-2 border-l-primary" : ""}`}
            style={meta?.tabColor
              ? isActive
                ? { borderBottomWidth: 3, borderBottomColor: meta.tabColor, boxShadow: `inset 0 -2px 0 0 ${meta.tabColor}`, backgroundColor: `${meta.tabColor}20`, color: meta.tabColor }
                : { borderBottomWidth: 2, borderBottomColor: `${meta.tabColor}60` }
              : undefined}
          >
            <Terminal className="w-3 h-3 shrink-0" />
            <span className="flex flex-col items-start leading-tight min-w-0">
              {editingTabId === termId ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    if (editValue.trim()) {
                      useConsoleLayoutStore.getState().updateTerminalMeta(termId, { label: editValue.trim() });
                    }
                    setEditingTabId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    } else if (e.key === "Escape") {
                      setEditingTabId(null);
                    }
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-b border-primary text-xs font-medium outline-none w-full min-w-[40px] max-w-[120px]"
                />
              ) : (
                <span
                  className="truncate max-w-full"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTabId(termId);
                    setEditValue(meta?.label ?? "");
                  }}
                >
                  {getTabLabel(meta, termId)}
                </span>
              )}
              {meta?.cwd && (
                <span className="text-[9px] text-muted-foreground/60 font-normal truncate max-w-full">
                  {shortenPath(meta.cwd)}
                </span>
              )}
            </span>
            {!isActive && meta?.hasActivity && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
            <span
              role="button"
              tabIndex={0}
              aria-label="Close terminal"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveTerminal?.(termId);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onRemoveTerminal?.(termId);
                }
              }}
              className="ml-0.5 opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-muted/40 transition-opacity"
            >
              <X className="w-2.5 h-2.5" />
            </span>
          </button>
        );
      })}

      {/* Overflow dropdown for excess tabs */}
      {overflowTabs.length > 0 && (
        <div className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setOverflowOpen((v) => !v); }}
            className={`flex items-center gap-0.5 px-1.5 py-1 rounded text-xs font-medium transition-colors ${
              overflowOpen
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
            title={`${overflowTabs.length} more tab${overflowTabs.length > 1 ? "s" : ""}`}
          >
            +{overflowTabs.length}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {overflowOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-md shadow-lg py-1 min-w-[200px]">
              {overflowTabs.map((tab) => {
                const { leaf, termId, meta } = tab;
                const isActive = activePaneId === leaf.id;
                return (
                  <button
                    key={termId}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/pane-id", leaf.id);
                      e.dataTransfer.setData("text/tab-id", termId);
                      useConsoleLayoutStore.getState().setIsDraggingPane(true);
                    }}
                    onDragEnd={() => {
                      useConsoleLayoutStore.getState().setIsDraggingPane(false);
                    }}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes("text/tab-id")) return;
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const fromId = e.dataTransfer.getData("text/tab-id");
                      if (fromId && fromId !== termId) {
                        reorderTerminalTabs(fromId, termId, groupId);
                      }
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${
                      isActive ? (meta?.tabColor ? "" : "bg-primary/10 text-primary") : ""
                    }`}
                    style={isActive && meta?.tabColor ? { backgroundColor: `${meta.tabColor}18`, color: meta.tabColor } : undefined}
                    onClick={() => {
                      setActivePaneId(leaf.id);
                      if (meta?.sessionId && meta.sessionId !== activeSessionId) {
                        useConsoleLayoutStore.getState().setActiveSessionId(meta.sessionId);
                      }
                      if (meta?.hasActivity) {
                        useConsoleLayoutStore.getState().updateTerminalMeta(termId, { hasActivity: false });
                      }
                      setOverflowOpen(false);
                    }}
                  >
                    <Terminal className="w-3 h-3 shrink-0" />
                    <span className="flex flex-col items-start leading-tight min-w-0">
                      <span className="truncate max-w-full">{getTabLabel(meta, termId)}</span>
                      {meta?.cwd && (
                        <span className="text-[9px] text-muted-foreground/60 font-normal truncate max-w-full">
                          {shortenPath(meta.cwd)}
                        </span>
                      )}
                    </span>
                    {!isActive && meta?.hasActivity && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* New session button */}
      <button
        onClick={onCreateTerminal}
        className="flex items-center gap-1 px-1.5 py-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-muted/30 transition-colors"
        title="New Session"
      >
        <Plus className="w-3 h-3" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Context tab */}
      <button
        onClick={() => {
          if (contextLeaf) {
            setActivePaneId(contextLeaf.id);
          } else {
            useConsoleLayoutStore.getState().setActiveTab("context");
          }
        }}
        title="Context"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t text-xs font-medium transition-colors whitespace-nowrap ${
          isContextActive
            ? "bg-primary/25 text-primary border-b-2 border-primary shadow-[inset_0_-2px_0_0] shadow-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent"
        }`}
      >
        <BookOpen className="w-3 h-3" />
        Context
      </button>

      {/* Settings tab */}
      <button
        onClick={() => {
          if (settingsLeaf) {
            setActivePaneId(settingsLeaf.id);
          } else {
            useConsoleLayoutStore.getState().setActiveTab("settings");
          }
        }}
        title="Settings"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-t text-xs font-medium transition-colors whitespace-nowrap ${
          isSettingsActive
            ? "bg-primary/25 text-primary border-b-2 border-primary shadow-[inset_0_-2px_0_0] shadow-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent"
        }`}
      >
        <Settings className="w-3 h-3" />
        Settings
      </button>

      {/* Layout mode toggles */}
      <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-border/50">
        <button
          onClick={() => setLayoutMode("tabbed")}
          className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded transition-colors ${
            layoutMode === "tabbed"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          }`}
          title="Tabbed View"
        >
          <SquareStack className="w-3 h-3" />
        </button>
        <button
          onClick={() => setLayoutMode("tiling")}
          className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded transition-colors ${
            layoutMode === "tiling"
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          }`}
          title="Tiling View (⌘D to split)"
        >
          <LayoutGrid className="w-3 h-3" />
        </button>
      </div>

      {/* Right-click context menu for terminal tabs */}
      <ToolbarContextMenu
        contextMenu={contextMenu}
        terminals={terminals}
        onDismiss={() => { setContextMenu(null); setOverflowOpen(false); }}
        onRename={(termId, currentLabel) => {
          setEditingTabId(termId);
          setEditValue(currentLabel);
        }}
        onClose={(termId) => onRemoveTerminal?.(termId)}
        onCloseOthers={(termId) => {
          const targetSessionId = terminals[termId]?.sessionId;
          Object.keys(terminals).forEach(tid => {
            const meta = terminals[tid];
            if (!meta || tid === termId) return;
            if (meta.sessionId !== targetSessionId) return;
            onRemoveTerminal?.(tid);
          });
        }}
      />
    </div>
  );
}
