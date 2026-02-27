"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Terminal,
  Folder,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Archive,
  Trash2,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { toast } from "sonner";
import type { ConsoleSession, SessionGroup } from "@/types/console";

interface ConsoleSidebarProps {
  width?: number;
  // Session props (restored)
  sessions: ConsoleSession[];
  activeId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onRenameSession?: (id: string, label: string) => void;
  onArchiveSession?: (id: string) => void;
  pinnedSessionIds?: string[];
  onPinSession?: (id: string) => void;
  onUnpinSession?: (id: string) => void;
  // Group/workspace props (kept from refactor)
  groups: SessionGroup[];
  activeGroupId: string | null;
  onCreateSession: () => void;
  onSwitchGroup: (id: string) => void;
  onArchiveGroup?: (id: string) => void;
  onClearAllSessions?: () => void;
  onRenameGroup?: (id: string, label: string) => void;
  onCreateSessionInGroup?: (groupId: string) => void;
  onOpenArchive?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function ConsoleSidebar(props: ConsoleSidebarProps) {
  const {
    width,
    sessions,
    activeId,
    onSelectSession,
    onCloseSession,
    groups,
    activeGroupId,
    onCreateSession,
    onSwitchGroup,
    onArchiveGroup,
    onClearAllSessions,
    onRenameGroup,
    onCreateSessionInGroup,
    onOpenArchive,
    collapsed,
    onToggleCollapse,
    isFullscreen = false,
    onToggleFullscreen,
  } = props;
  const layoutGroups = useConsoleLayoutStore((s) => s.groups);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const isTerminalOpen = (terminalState?: string) =>
    terminalState !== "exited" && terminalState !== "dead";
  const compact = !collapsed && (width ?? 0) > 0 && (width ?? 0) < 232;

  // Derive activity indicators from layout store terminals
  const groupStats = useMemo(() => {
    const stats: Record<
      string,
      { sessionCount: number; terminalCount: number; hasActivity: boolean }
    > = {};
    const sessionCounts: Record<string, number> = {};
    for (const session of sessions) {
      if (!session.groupId) continue;
      sessionCounts[session.groupId] = (sessionCounts[session.groupId] ?? 0) + 1;
    }
    for (const group of groups) {
      const groupState = layoutGroups[group.id];
      if (groupState) {
        const terminals = Object.values(groupState.terminals);
        stats[group.id] = {
          sessionCount: sessionCounts[group.id] ?? 0,
          terminalCount: terminals.filter((t) => isTerminalOpen(t.terminalState))
            .length,
          hasActivity: terminals.some((t) => t.hasActivity),
        };
      } else {
        stats[group.id] = {
          sessionCount: sessionCounts[group.id] ?? 0,
          terminalCount: 0,
          hasActivity: false,
        };
      }
    }
    return stats;
  }, [groups, layoutGroups, sessions]);

  const totalSessionCount = sessions.length;
  const openTerminalCount = useMemo(() => {
    let count = 0;
    for (const group of Object.values(layoutGroups)) {
      for (const meta of Object.values(group.terminals)) {
        if (!isTerminalOpen(meta.terminalState)) {
          continue;
        }
        count += 1;
      }
    }
    return count;
  }, [layoutGroups]);

  const sessionTerminalCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of Object.values(layoutGroups)) {
      for (const meta of Object.values(group.terminals)) {
        if (!meta.sessionId) continue;
        if (!isTerminalOpen(meta.terminalState)) continue;
        counts[meta.sessionId] = (counts[meta.sessionId] ?? 0) + 1;
      }
    }
    return counts;
  }, [layoutGroups]);

  const sessionsByGroup = useMemo(() => {
    const grouped = new Map<string, ConsoleSession[]>();
    for (const session of sessions) {
      if (!session.groupId) continue;
      const existing = grouped.get(session.groupId) ?? [];
      existing.push(session);
      grouped.set(session.groupId, existing);
    }
    for (const [gid, list] of grouped) {
      grouped.set(
        gid,
        [...list].sort(
          (a, b) =>
            (b.lastActivityAt ?? b.createdAt) - (a.lastActivityAt ?? a.createdAt),
        ),
      );
    }
    return grouped;
  }, [sessions]);

  const formatCountLabel = (
    count: number,
    singular: string,
    plural: string,
    shortUnit?: string,
  ) =>
    shortUnit
      ? `${count}${shortUnit}`
      : `${count} ${count === 1 ? singular : plural}`;

  const openWorkspace = (groupId: string) => {
    onSwitchGroup(groupId);
    setExpandedGroupId(groupId);
    const groupSessions = sessionsByGroup.get(groupId) ?? [];
    const firstSession =
      groupSessions.find((s) => s.status === "active" && !!s.terminalId) ??
      groupSessions.find((s) => !!s.terminalId) ??
      groupSessions[0];
    if (firstSession) {
      queueMicrotask(() => {
        onSelectSession(firstSession.id);
      });
    }
  };

  const handleArchiveWorkspace = (
    group: SessionGroup,
    runningTerminalCount: number,
  ) => {
    if (!onArchiveGroup) return;
    toast.warning(`Close workspace "${group.label}"?`, {
      id: `close-workspace-${group.id}`,
      description:
        runningTerminalCount > 0
          ? `This will close all running terminals in this workspace (${runningTerminalCount}).`
          : "This removes the workspace and its sessions.",
      action: {
        label: "Close workspace",
        onClick: () => onArchiveGroup(group.id),
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
      duration: 10000,
    });
  };

  // Collapsed mini-mode
  if (collapsed) {
    return (
      <div className="flex flex-col h-full border-r border-border bg-sidebar items-center py-2 gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="w-8 h-8 p-0"
          title="Expand sidebar"
          onClick={onToggleCollapse}
        >
          <ChevronRight size={14} />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-8 h-8 p-0"
          title="New Workspace"
          onClick={onCreateSession}
        >
          <Plus size={14} />
        </Button>
        {onToggleFullscreen && (
          <Button
            size="sm"
            variant="ghost"
            className="w-8 h-8 p-0"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </Button>
        )}
        <div className="flex-1 flex flex-col items-center gap-0.5 pt-1 overflow-y-auto min-h-0">
          {groups.map((g) => {
            const stats = groupStats[g.id];
            return (
              <button
                key={g.id}
                onClick={() => openWorkspace(g.id)}
                title={`${g.label} (${stats?.sessionCount ?? 0} sessions, ${stats?.terminalCount ?? 0} terminals)`}
                className={cn(
                  "relative w-8 h-8 rounded-md flex items-center justify-center text-micro font-mono font-medium transition-all shrink-0 group",
                  g.id === activeGroupId
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Terminal size={14} />
                {stats?.hasActivity && (
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
                <div className="absolute left-full ml-2 px-2 py-1 rounded bg-popover border border-border text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-md font-sans">
                  {g.label}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden border-r border-border bg-sidebar">
      {/* Header */}
      <div
        className={cn(
          "border-b border-border flex items-center gap-1.5 shrink-0",
          compact ? "px-2 py-1.5" : "px-2.5 py-2",
        )}
      >
        {onToggleCollapse && (
          <Button
            size="sm"
            variant="ghost"
            className={cn("p-0 shrink-0", compact ? "h-6 w-6" : "h-7 w-7")}
            title="Collapse sidebar"
            onClick={onToggleCollapse}
          >
            <ChevronLeft size={14} />
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "flex-1 min-w-0 text-xs gap-1.5 border-primary/20 hover:bg-muted/50 hover:border-primary/30 text-foreground",
            compact ? "h-6 px-2" : "h-7",
          )}
          onClick={onCreateSession}
        >
          <Plus size={12} />
          <span className="truncate">{compact ? "New" : "New Workspace"}</span>
          <span
            className="ml-auto shrink-0 text-[10px] text-muted-foreground tabular-nums"
            title={`${groups.length} workspaces`}
          >
            {groups.length}
          </span>
        </Button>
        {onOpenArchive && (
          <Button
            size="sm"
            variant="ghost"
            className={cn("p-0 shrink-0", compact ? "h-6 w-6" : "h-7 w-7")}
            title="Archived sessions"
            onClick={onOpenArchive}
          >
            <Archive size={12} />
          </Button>
        )}
        {onToggleFullscreen && (
          <Button
            size="sm"
            variant={isFullscreen ? "secondary" : "ghost"}
            className={cn("p-0 shrink-0", compact ? "h-6 w-6" : "h-7 w-7")}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </Button>
        )}
      </div>
      <div
        className={cn(
          "border-b border-border/70 text-[10px] text-muted-foreground tabular-nums",
          compact ? "px-2 py-0.5" : "px-2.5 py-1",
        )}
        title="Sessions can exist without an open terminal if they are idle or ended."
      >
        {compact
          ? `${groups.length} ws · ${totalSessionCount} sess · ${openTerminalCount} open`
          : `${groups.length} workspaces · ${totalSessionCount} sessions · ${openTerminalCount} open terminals`}
      </div>

      {/* Workspace list (folders first; sessions on explicit expand) */}
      <ScrollArea className="flex-1 min-h-0">
        <div className={cn(compact ? "p-1.5 space-y-0.5" : "p-2 space-y-0.5")}>
          {groups.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <Terminal
                size={20}
                className="mx-auto text-muted-foreground mb-2"
              />
              <div className="text-xs text-muted-foreground">
                No sessions yet
              </div>
              <div className="text-detail text-muted-foreground mt-1">
                Click &ldquo;New&rdquo; above to start
              </div>
            </div>
          ) : (
            groups.map((group) => {
              const isActive = group.id === activeGroupId;
              const stats = groupStats[group.id];
              const groupSessions = sessionsByGroup.get(group.id) ?? [];
              const isExpanded = expandedGroupId === group.id;
              return (
                <div key={group.id} className="space-y-1">
                  <div
                    className={cn(
                      "group/row flex items-center rounded-md text-xs transition-colors cursor-pointer",
                      compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-2.5 py-2",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                    onClick={() => openWorkspace(group.id)}
                  >
                    <Folder size={13} className="shrink-0" />
                    <InlineGroupLabel
                      label={group.label}
                      onRename={
                        onRenameGroup
                          ? (label) => onRenameGroup(group.id, label)
                          : undefined
                      }
                    />
                    {stats?.hasActivity && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                    {compact ? (
                      <span
                        className={cn(
                          "text-[10px] text-right shrink-0 tabular-nums",
                          isActive ? "text-primary/70" : "text-muted-foreground",
                          (stats?.sessionCount ?? 0) === 0 &&
                            (stats?.terminalCount ?? 0) === 0 &&
                            "opacity-50",
                        )}
                        title={`${stats?.sessionCount ?? 0} sessions · ${stats?.terminalCount ?? 0} open terminals`}
                      >
                        {formatCountLabel(stats?.sessionCount ?? 0, "session", "sessions", "s")} ·{" "}
                        {formatCountLabel(stats?.terminalCount ?? 0, "terminal", "terminals", "t")}
                      </span>
                    ) : (
                      <>
                        <span
                          className={cn(
                            "text-[10px] text-right shrink-0",
                            isActive ? "text-primary/70" : "text-muted-foreground",
                            (stats?.sessionCount ?? 0) === 0 &&
                              (stats?.terminalCount ?? 0) === 0 &&
                              "opacity-50",
                          )}
                          title="Sessions"
                        >
                          {formatCountLabel(stats?.sessionCount ?? 0, "session", "sessions")}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] text-right shrink-0",
                            isActive ? "text-primary/70" : "text-muted-foreground",
                            (stats?.terminalCount ?? 0) === 0 && "opacity-60",
                          )}
                          title="Open terminals"
                        >
                          {formatCountLabel(stats?.terminalCount ?? 0, "terminal", "terminals")}
                        </span>
                      </>
                    )}
                    {groupSessions.length > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedGroupId((prev) =>
                            prev === group.id ? null : group.id,
                          );
                        }}
                        className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                        title={
                          isExpanded ? "Hide sessions" : "Show sessions"
                        }
                      >
                        <ChevronDown
                          size={12}
                          className={cn(
                            "transition-transform",
                            isExpanded ? "rotate-180" : "",
                          )}
                        />
                      </button>
                    )}
                    {onCreateSessionInGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onCreateSessionInGroup(group.id);
                        }}
                        className={cn(
                          "p-0.5 rounded transition-colors",
                          isActive
                            ? "hover:bg-primary/20 text-primary/70 hover:text-primary"
                            : "hover:bg-muted/40 text-muted-foreground hover:text-foreground",
                        )}
                        title="Add terminal session"
                      >
                        <Plus size={12} />
                      </button>
                    )}
                    {onArchiveGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveWorkspace(
                            group,
                            stats?.terminalCount ?? 0,
                          );
                        }}
                        className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                        title="Close workspace"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className={cn(compact ? "pl-3 space-y-0.5" : "pl-4 space-y-0.5")}>
                      {groupSessions.length === 0 ? (
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                          No sessions
                        </div>
                      ) : (
                        groupSessions.map((session) => (
                          <div
                            key={session.id}
                            className={cn(
                              "group/session flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] cursor-pointer transition-colors",
                              session.id === activeId
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                            )}
                            onClick={() => {
                              onSwitchGroup(group.id);
                              onSelectSession(session.id);
                            }}
                          >
                            <Terminal size={11} className="shrink-0" />
                            <span className="truncate flex-1">
                              {session.label}
                            </span>
                            <span
                              className="text-[10px] text-muted-foreground/80 shrink-0"
                              title="Open terminals for this session"
                            >
                              {formatCountLabel(
                                sessionTerminalCounts[session.id] ?? 0,
                                "terminal",
                                "terminals",
                                compact ? "t" : undefined,
                              )}
                            </span>
                            {session.status !== "active" && (
                              <span className="text-[10px] text-muted-foreground/70">
                                Ended
                              </span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onCloseSession(session.id);
                              }}
                              className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/session:opacity-100"
                              title="Close session"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      {onClearAllSessions && groups.length > 0 && (
        <div className="border-t border-border/70 p-2">
          <ClearAllWorkspacesButton
            count={groups.length}
            onClearAll={onClearAllSessions}
          />
        </div>
      )}
    </div>
  );
}

function ClearAllWorkspacesButton({
  count,
  onClearAll,
}: {
  count: number;
  onClearAll: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete all workspaces and sessions"
      >
        <Trash2 size={11} />
        Delete all workspaces
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          onClearAll();
          setConfirming(false);
        }}
        className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        title="Delete all workspaces and close all running terminals"
      >
        <Trash2 size={11} />
        Confirm delete ({count})
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

/** Inline-editable group label (double-click to rename). */
function InlineGroupLabel({
  label,
  onRename,
}: {
  label: string;
  onRename?: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== label) onRename?.(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(label);
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className="truncate flex-1 text-left text-xs font-semibold text-primary bg-background border border-primary/30 rounded px-1 py-0 outline-none focus:border-primary/60 min-w-0"
      />
    );
  }

  return (
    <span
      className={cn(
        "truncate flex-1 text-left text-xs font-semibold text-primary",
        onRename && "cursor-text",
      )}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (onRename) {
          setValue(label);
          setEditing(true);
        }
      }}
      title={onRename ? "Double-click to rename" : label}
    >
      {label}
    </span>
  );
}
