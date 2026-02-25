"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Archive,
  Cpu,
  MemoryStick,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { useSystemStats } from "@/hooks/useSystemStats";
import { ConsoleSessionCard } from "@/components/console/ConsoleSessionCard";
import type { ConsoleSession, SessionGroup } from "@/types/console";

interface ConsoleSidebarProps {
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
}

export function ConsoleSidebar({
  sessions,
  activeId,
  onSelectSession,
  onCloseSession,
  onRenameSession,
  onArchiveSession,
  pinnedSessionIds,
  onPinSession,
  onUnpinSession,
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
}: ConsoleSidebarProps) {
  const layoutGroups = useConsoleLayoutStore((s) => s.groups);

  // Derive activity indicators from layout store terminals
  const groupStats = useMemo(() => {
    const stats: Record<
      string,
      { sessionCount: number; hasActivity: boolean }
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
          hasActivity: terminals.some((t) => t.hasActivity),
        };
      } else {
        stats[group.id] = { sessionCount: sessionCounts[group.id] ?? 0, hasActivity: false };
      }
    }
    return stats;
  }, [groups, layoutGroups, sessions]);

  // Count terminal panes per session (for displaying on session cards)
  const terminalCountBySession = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of Object.values(layoutGroups)) {
      for (const meta of Object.values(group.terminals)) {
        if (meta.sessionId) {
          counts[meta.sessionId] = (counts[meta.sessionId] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [layoutGroups]);

  // Filter sessions for the active group into active/ended buckets
  const activeGroupSessions = useMemo(
    () =>
      activeGroupId
        ? sessions.filter((s) => s.groupId === activeGroupId)
        : [],
    [sessions, activeGroupId],
  );
  const activeSessions = useMemo(
    () => activeGroupSessions.filter((s) => s.status === "active"),
    [activeGroupSessions],
  );
  const endedSessions = useMemo(
    () => activeGroupSessions.filter((s) => s.status === "idle"),
    [activeGroupSessions],
  );

  const pinnedSet = useMemo(
    () => new Set(pinnedSessionIds ?? []),
    [pinnedSessionIds],
  );

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
        <div className="flex-1 flex flex-col items-center gap-0.5 pt-1 overflow-y-auto min-h-0">
          {groups.map((g) => {
            const stats = groupStats[g.id];
            return (
              <button
                key={g.id}
                onClick={() => onSwitchGroup(g.id)}
                title={`${g.label} (${stats?.sessionCount ?? 0} sessions)`}
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
      <div className="px-2.5 py-2 border-b border-border flex items-center gap-1.5 shrink-0">
        {onToggleCollapse && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            title="Collapse sidebar"
            onClick={onToggleCollapse}
          >
            <ChevronLeft size={14} />
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-7 text-xs gap-1.5 border-primary/20 hover:bg-muted/50 hover:border-primary/30 text-foreground"
          onClick={onCreateSession}
        >
          <Plus size={12} />
          New Workspace
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{sessions.length}</span>
        </Button>
        {onOpenArchive && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 shrink-0"
            title="Archived sessions"
            onClick={onOpenArchive}
          >
            <Archive size={12} />
          </Button>
        )}
      </div>

      {/* Flat session (group) list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
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

              if (isActive) {
                // Active group: expanded with nested sessions
                return (
                  <div key={group.id} className="space-y-0.5">
                    {/* Group header */}
                    <div
                      className={cn(
                        "group/row flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer",
                        "bg-primary/10 text-primary",
                      )}
                      onClick={() => onSwitchGroup(group.id)}
                    >
                      <Terminal size={13} className="shrink-0" />
                      <InlineGroupLabel
                        label={group.label}
                        onRename={
                          onRenameGroup
                            ? (label) => onRenameGroup(group.id, label)
                            : undefined
                        }
                      />
                      <div className="ml-auto flex items-center gap-1 shrink-0">
                        <span
                          className={cn(
                            "text-[10px] text-primary/60 font-mono tabular-nums text-right w-[16px] shrink-0",
                            (stats?.sessionCount ?? 0) === 0 && "opacity-50",
                          )}
                        >
                          {stats?.sessionCount ?? 0}
                        </span>
                        {onCreateSessionInGroup && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onCreateSessionInGroup(group.id);
                            }}
                            className="p-0.5 rounded hover:bg-primary/20 text-primary/60 hover:text-primary transition-colors opacity-0 group-hover/row:opacity-100 shrink-0"
                          title="Add terminal session"
                          >
                            <Plus size={12} />
                          </button>
                        )}
                        {onArchiveGroup && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onArchiveGroup(group.id);
                            }}
                            className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/row:opacity-100 shrink-0"
                            title="Close session"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Nested session cards */}
                    <div className="pl-3 space-y-0.5">
                      {activeSessions.length > 0 && (
                        <div className="space-y-0.5">
                          {activeSessions.length > 0 && endedSessions.length > 0 && (
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium px-2.5 pt-1">
                              Active
                            </div>
                          )}
                          {activeSessions.map((s) => (
                            <ConsoleSessionCard
                              key={s.id}
                              session={s}
                              isActive={s.id === activeId}
                              onSelect={() => onSelectSession(s.id)}
                              onClose={() => onCloseSession(s.id)}
                              onRename={
                                onRenameSession
                                  ? (label) => onRenameSession(s.id, label)
                                  : undefined
                              }
                              onArchive={
                                onArchiveSession
                                  ? () => onArchiveSession(s.id)
                                  : undefined
                              }
                              isPinned={pinnedSet.has(s.id)}
                              onPin={
                                pinnedSet.has(s.id)
                                  ? onUnpinSession
                                    ? () => onUnpinSession(s.id)
                                    : undefined
                                  : onPinSession
                                    ? () => onPinSession(s.id)
                                    : undefined
                              }
                              terminalCount={terminalCountBySession[s.id]}
                            />
                          ))}
                        </div>
                      )}
                      {endedSessions.length > 0 && (
                        <div className="space-y-0.5">
                          {activeSessions.length > 0 && (
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium px-2.5 pt-1">
                              Ended
                            </div>
                          )}
                          {endedSessions.map((s) => (
                            <ConsoleSessionCard
                              key={s.id}
                              session={s}
                              isActive={s.id === activeId}
                              onSelect={() => onSelectSession(s.id)}
                              onClose={() => onCloseSession(s.id)}
                              onRename={
                                onRenameSession
                                  ? (label) => onRenameSession(s.id, label)
                                  : undefined
                              }
                              onArchive={
                                onArchiveSession
                                  ? () => onArchiveSession(s.id)
                                  : undefined
                              }
                              isPinned={pinnedSet.has(s.id)}
                              onPin={
                                pinnedSet.has(s.id)
                                  ? onUnpinSession
                                    ? () => onUnpinSession(s.id)
                                    : undefined
                                  : onPinSession
                                    ? () => onPinSession(s.id)
                                    : undefined
                              }
                              terminalCount={terminalCountBySession[s.id]}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Inactive group: flat row (unchanged)
              return (
                <div
                  key={group.id}
                  className={cn(
                    "group/row flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors cursor-pointer",
                    "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                  onClick={() => onSwitchGroup(group.id)}
                >
                  <Terminal size={13} className="shrink-0" />
                  <span className="truncate flex-1 text-left font-medium">
                    {group.label}
                  </span>
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <span
                      className={cn(
                        "text-[10px] text-muted-foreground font-mono tabular-nums text-right w-[16px] shrink-0",
                        (stats?.sessionCount ?? 0) === 0 && "opacity-50",
                      )}
                    >
                      {stats?.sessionCount ?? 0}
                    </span>
                    {stats?.hasActivity && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                    {onArchiveGroup && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveGroup(group.id);
                        }}
                        className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/row:opacity-100"
                        title="Close session"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer with resource indicator + shortcut hints */}
      <div className="p-2 border-t border-border shrink-0 space-y-1">
        <ResourceIndicator />
        {onClearAllSessions && <ClearAllButton onClearAll={onClearAllSessions} />}
        <ShortcutHints />
      </div>
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

function useModKey() {
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.platform));
  }, []);
  return isMac ? "\u2318" : "Ctrl+";
}

/** Compact resource indicator showing terminal count, CPU, and RAM usage. */
function ResourceIndicator() {
  const groups = useConsoleLayoutStore((s) => s.groups);
  const { data: stats } = useSystemStats();

  // Count terminals across all groups
  const terminalCount = useMemo(() => {
    let count = 0;
    for (const group of Object.values(groups)) {
      count += Object.keys(group.terminals).length;
    }
    return count;
  }, [groups]);

  const cpuColor =
    stats && stats.cpu > 80 ? "text-amber-400" : "text-muted-foreground";
  const ramColor =
    stats && stats.memory.percent > 85
      ? "text-amber-400"
      : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between gap-2 text-[10px] font-mono px-1 py-0.5">
      <span
        className="flex items-center gap-1 text-muted-foreground"
        title="Open terminals"
      >
        <Terminal size={10} />
        {terminalCount}
      </span>
      {stats && (
        <>
          <span
            className={cn("flex items-center gap-1", cpuColor)}
            title="CPU usage"
          >
            <Cpu size={10} />
            {Math.round(stats.cpu)}%
          </span>
          <span
            className={cn("flex items-center gap-1", ramColor)}
            title="RAM usage"
          >
            <MemoryStick size={10} />
            {Math.round(stats.memory.percent)}%
          </span>
        </>
      )}
    </div>
  );
}

/** Two-click "Clear All Sessions" button with confirmation state. */
function ClearAllButton({ onClearAll }: { onClearAll: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-1 px-1">
        <button
          onClick={() => { onClearAll(); setConfirming(false); }}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        >
          <Trash2 size={11} />
          Yes, clear all
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="w-full flex items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
    >
      <Trash2 size={11} />
      Clear all sessions
    </button>
  );
}

function ShortcutHints() {
  const mod = useModKey();
  return (
    <div className="text-[9px] font-mono text-text-quaternary tracking-wide text-center space-x-2.5">
      <span>{mod}N workspace</span>
      <span>{mod}W close</span>
    </div>
  );
}
