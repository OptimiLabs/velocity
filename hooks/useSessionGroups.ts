"use client";

import { useCallback, useRef } from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { archiveScrollback } from "@/lib/console/terminal-db";
import { formatGroupTimestamp } from "@/lib/console/claude-args";
import { deleteActivity } from "@/lib/console/activity-tracker";
import { persistGroups } from "@/lib/console/session-persistence";
import { findLeafByContent } from "@/lib/console/pane-tree";
import type { ConsoleSession, SessionGroup } from "@/types/console";

export interface UseSessionGroupsConfig {
  sessions: Map<string, ConsoleSession>;
  groups: Map<string, SessionGroup>;
  activeGroupId: string | null;
  sessionsRef: React.MutableRefObject<Map<string, ConsoleSession>>;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
  setSessions: React.Dispatch<
    React.SetStateAction<Map<string, ConsoleSession>>
  >;
  setGroups: React.Dispatch<React.SetStateAction<Map<string, SessionGroup>>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  safeSend: (data: Record<string, unknown>) => boolean;
  cleanupTerminalArtifacts: (terminalId: string) => void;
}

export interface UseSessionGroupsResult {
  createGroup: (label?: string) => string;
  renameGroup: (groupId: string, label: string) => void;
  switchGroup: (groupId: string) => void;
  archiveGroup: (groupId: string) => Promise<void>;
  clearAllSessions: () => void;
  bumpGroupActivity: (groupId: string) => void;
}

export function useSessionGroups(
  config: UseSessionGroupsConfig,
): UseSessionGroupsResult {
  const {
    sessions,
    groups,
    activeGroupId,
    sessionsRef,
    deletedSessionIdsRef,
    setSessions,
    setGroups,
    setActiveId,
    safeSend,
    cleanupTerminalArtifacts,
  } = config;

  // Throttle group lastActivityAt updates to at most once per 30s per group
  const GROUP_ACTIVITY_THROTTLE_MS = 30_000;
  const groupActivityThrottleRef = useRef<Map<string, number>>(new Map());

  const bumpGroupActivity = useCallback(
    (groupId: string) => {
      const now = Date.now();
      const lastBump = groupActivityThrottleRef.current.get(groupId) ?? 0;
      if (now - lastBump < GROUP_ACTIVITY_THROTTLE_MS) return;
      groupActivityThrottleRef.current.set(groupId, now);
      setGroups((prev) => {
        const group = prev.get(groupId);
        if (!group) return prev;
        const next = new Map(prev);
        next.set(groupId, { ...group, lastActivityAt: now });
        return next;
      });
    },
    [setGroups],
  );

  const createGroup = useCallback(
    (label?: string) => {
      const groupId = crypto.randomUUID();
      const now = Date.now();
      let groupLabel = label?.trim() || "";

      setGroups((prev) => {
        const baseLabel =
          groupLabel || `Workspace ${formatGroupTimestamp(now)}`;
        let unique = baseLabel;
        let suffix = 2;
        const existing = new Set([...prev.values()].map((g) => g.label));
        while (existing.has(unique)) {
          unique = `${baseLabel} (${suffix})`;
          suffix += 1;
        }
        groupLabel = unique;
        const group: SessionGroup = {
          id: groupId,
          label: groupLabel,
          createdAt: now,
          lastActivityAt: now,
        };
        const next = new Map(prev);
        next.set(groupId, group);
        return next;
      });

      useConsoleLayoutStore.getState().createGroup(groupId);
      safeSend({
        type: "group:create",
        groupId,
        label: groupLabel,
        createdAt: now,
      });

      return groupId;
    },
    [safeSend, setGroups],
  );

  const renameGroup = useCallback(
    (groupId: string, label: string) => {
      setGroups((prev) => {
        const group = prev.get(groupId);
        if (!group) return prev;
        const next = new Map(prev);
        next.set(groupId, { ...group, label });
        return next;
      });
      safeSend({ type: "group:rename", groupId, label });
    },
    [safeSend, setGroups],
  );

  const switchGroup = useCallback(
    (groupId: string) => {
      if (!groups.has(groupId)) return;
      useConsoleLayoutStore.getState().switchGroup(groupId);

      setGroups((prev) => {
        const group = prev.get(groupId);
        if (!group) return prev;
        const next = new Map(prev);
        next.set(groupId, { ...group, lastActivityAt: Date.now() });
        return next;
      });

      const groupSessions = [...sessions.values()]
        .filter((s) => s.groupId === groupId)
        .sort((a, b) => b.createdAt - a.createdAt);
      if (groupSessions.length > 0) {
        const preferred =
          groupSessions.find((s) => s.status === "active" && !!s.terminalId) ??
          groupSessions.find((s) => !!s.terminalId) ??
          groupSessions[0];
        setActiveId(preferred.id);
        const nextStore = useConsoleLayoutStore.getState();
        nextStore.setActiveSessionId(preferred.id);
        const freshGroup = nextStore.groups[groupId];
        if (freshGroup) {
          const terminalLeaf = findLeafByContent(freshGroup.paneTree, (c) => {
            if (c.type !== "terminal") return false;
            const meta = freshGroup.terminals[c.terminalId];
            return meta?.sessionId === preferred.id;
          });
          if (terminalLeaf) {
            nextStore.setActivePaneId(terminalLeaf.id);
            nextStore.setFocusedPane(terminalLeaf.id);
          }
        }
        nextStore.requestActiveTerminalFocus();
      } else {
        // Group may still contain terminal leaves without mapped sessions.
        const nextStore = useConsoleLayoutStore.getState();
        const freshGroup = nextStore.groups[groupId];
        if (freshGroup) {
          const firstTerminalLeaf = findLeafByContent(
            freshGroup.paneTree,
            (c) => c.type === "terminal",
          );
          if (firstTerminalLeaf) {
            nextStore.setActivePaneId(firstTerminalLeaf.id);
            nextStore.setFocusedPane(firstTerminalLeaf.id);
            nextStore.requestActiveTerminalFocus();
          }
        }
      }
    },
    [groups, sessions, setGroups, setActiveId],
  );

  const archiveGroup = useCallback(
    async (groupId: string) => {
      const groupSessions = [...sessions.values()].filter(
        (s) => s.groupId === groupId,
      );

      for (const session of groupSessions) {
        if (session.status !== "idle" && session.terminalId) {
          safeSend({ type: "pty:close", terminalId: session.terminalId });
        }

        const { groups: storeGroups, removeTerminal } =
          useConsoleLayoutStore.getState();
        const groupLayout = storeGroups[groupId];
        if (groupLayout) {
          const linkedTerminals = Object.entries(groupLayout.terminals)
            .filter(([, meta]) => meta.sessionId === session.id)
            .map(([terminalId, meta]) => ({
              terminalId,
              label: meta.label,
              cwd: meta.cwd,
              envOverrides: meta.envOverrides,
            }));

          try {
            const res = await fetch("/api/console-sessions/archive", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: session.id,
                terminals: linkedTerminals,
              }),
            });
            if (!res.ok) {
              console.warn(
                "[CONSOLE] Archive failed for session",
                session.id,
                res.status,
              );
            }
          } catch (err) {
            console.warn(
              "[CONSOLE] Archive fetch failed for session",
              session.id,
              (err as Error).message,
            );
          }

          // Close PTYs for linked terminals — always clean up regardless of archive result
          for (const t of linkedTerminals) {
            safeSend({ type: "pty:close", terminalId: t.terminalId });
            removeTerminal(t.terminalId);
            archiveScrollback(t.terminalId, session.id);
            cleanupTerminalArtifacts(t.terminalId);
          }
        }
      }

      setSessions((prev) => {
        const next = new Map(prev);
        for (const s of groupSessions) {
          next.delete(s.id);
          deletedSessionIdsRef.current.add(s.id);
          deleteActivity(s.id);
        }
        sessionsRef.current = next;
        return next;
      });

      useConsoleLayoutStore.getState().removeGroup(groupId);
      safeSend({ type: "group:delete", groupId });

      setGroups((prev) => {
        const next = new Map(prev);
        next.delete(groupId);
        return next;
      });

      // Flush immediately — don't wait for the debounced persist
      const updatedGroups = new Map(groups);
      updatedGroups.delete(groupId);
      persistGroups(updatedGroups);

      if (activeGroupId === groupId) {
        const remainingGroups = [...groups.keys()].filter((k) => k !== groupId);
        const newGroupId =
          remainingGroups.length > 0 ? remainingGroups[0] : null;
        if (newGroupId) {
          useConsoleLayoutStore.getState().switchGroup(newGroupId);
          const currentSessions = sessionsRef.current;
          const nextGroupSessions = [...currentSessions.values()]
            .filter((s) => s.groupId === newGroupId)
            .sort((a, b) => b.createdAt - a.createdAt);
          if (nextGroupSessions.length > 0) {
            setActiveId(nextGroupSessions[0].id);
          } else {
            setActiveId(null);
          }
        } else {
          setActiveId(null);
        }
      }
    },
    [
      sessions,
      activeGroupId,
      groups,
      safeSend,
      cleanupTerminalArtifacts,
      setSessions,
      setGroups,
      setActiveId,
      sessionsRef,
      deletedSessionIdsRef,
    ],
  );

  const clearAllSessions = useCallback(() => {
    // Close all PTYs
    for (const session of sessions.values()) {
      if (session.terminalId) {
        safeSend({ type: "pty:close", terminalId: session.terminalId });
      }
    }

    // Clean up all terminals from the layout store
    const { groups: storeGroups, removeTerminal } =
      useConsoleLayoutStore.getState();
    for (const groupLayout of Object.values(storeGroups)) {
      for (const terminalId of Object.keys(groupLayout.terminals)) {
        safeSend({ type: "pty:close", terminalId });
        removeTerminal(terminalId);
      }
    }

    // Clear all sessions from memory
    for (const s of sessions.values()) {
      deletedSessionIdsRef.current.add(s.id);
      deleteActivity(s.id);
    }
    setSessions(() => {
      const next = new Map<string, ConsoleSession>();
      sessionsRef.current = next;
      return next;
    });

    // Remove all groups
    for (const groupId of groups.keys()) {
      useConsoleLayoutStore.getState().removeGroup(groupId);
      safeSend({ type: "group:delete", groupId });
    }
    setGroups(new Map());
    persistGroups(new Map());
    setActiveId(null);
  }, [
    sessions,
    groups,
    safeSend,
    setSessions,
    setGroups,
    setActiveId,
    sessionsRef,
    deletedSessionIdsRef,
  ]);

  return {
    createGroup,
    renameGroup,
    switchGroup,
    archiveGroup,
    clearAllSessions,
    bumpGroupActivity,
  };
}
