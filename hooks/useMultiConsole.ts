"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { clearTerminalBuffer } from "@/lib/console/terminal-registry";
import {
  clearOldScrollback,
  deleteScrollback,
} from "@/lib/console/terminal-db";
import {
  clearSerializedBuffer,
  clearPromptTracker,
} from "@/lib/console/terminal-cache";
import { useSettings } from "@/hooks/useSettings";
import type { ConsoleSession, SessionGroup } from "@/types/console";

// Extracted modules
import {
  loadPersistedSessions,
  loadPersistedGroups,
  loadActiveId,
  persistSessions,
  persistGroups,
} from "@/lib/console/session-persistence";
import {
  findTerminalForSession,
  findGroupIdForTerminal,
} from "@/lib/console/layout-queries";
import { useConsoleWs } from "@/hooks/useConsoleWs";
import { useSessionGroups } from "@/hooks/useSessionGroups";
import { useSessionCrud } from "@/hooks/useSessionCrud";

function getLastCwd(sessions: Map<string, ConsoleSession>): string {
  const sorted = [...sessions.values()].sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  if (sorted[0]?.cwd) return sorted[0].cwd;
  const stored =
    typeof window !== "undefined"
      ? localStorage.getItem("claude-console-last-cwd")
      : null;
  if (stored) return stored;
  return "~";
}

export function useMultiConsole() {
  // --- Core state ---
  const [sessions, setSessions] = useState<Map<string, ConsoleSession>>(
    new Map(),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [groups, setGroups] =
    useState<Map<string, SessionGroup>>(loadPersistedGroups);
  const [hydrated, setHydrated] = useState(false);

  // --- Shared refs ---
  const sessionsRef = useRef<Map<string, ConsoleSession>>(new Map());
  const activeIdRef = useRef<string | null>(null);
  const deletedSessionIdsRef = useRef(new Set<string>());
  const resumableSessionsLoadedRef = useRef(false);
  const createdTerminalIds = useRef(new Set<string>());
  const wsConnectCountRef = useRef(0);
  const wsEpochRef = useRef(0);
  const terminalSeenEpochRef = useRef(new Map<string, number>());
  const groupsRef = useRef(groups);
  const initialLayoutReconciledRef = useRef(false);

  // --- Layout store subscriptions ---
  const activeGroupId = useConsoleLayoutStore((s) => s.activeGroupId);
  const layoutHydrated = useConsoleLayoutStore((s) => s._hydrated);

  // --- Global settings ---
  const { data: globalSettings } = useSettings();
  const settingsRef = useRef(globalSettings);
  useEffect(() => {
    settingsRef.current = globalSettings;
  }, [globalSettings]);

  // --- Terminal cleanup utility ---
  const cleanupTerminalArtifacts = useCallback((terminalId: string) => {
    clearTerminalBuffer(terminalId);
    clearSerializedBuffer(terminalId);
    clearPromptTracker(terminalId);
    deleteScrollback(terminalId);
  }, []);

  const pruneOrphanedTerminals = useCallback(() => {
    const validSessionIds = new Set(sessionsRef.current.keys());
    const deletedIds = deletedSessionIdsRef.current;
    const store = useConsoleLayoutStore.getState();
    for (const group of Object.values(store.groups)) {
      for (const [terminalId, meta] of Object.entries(group.terminals)) {
        const sessionId = meta.sessionId;
        if (!sessionId) {
          store.removeTerminal(terminalId);
          cleanupTerminalArtifacts(terminalId);
          continue;
        }
        if (deletedIds.has(sessionId)) {
          store.removeTerminal(terminalId);
          cleanupTerminalArtifacts(terminalId);
          continue;
        }
        if (
          resumableSessionsLoadedRef.current &&
          !validSessionIds.has(sessionId)
        ) {
          store.removeTerminal(terminalId);
          cleanupTerminalArtifacts(terminalId);
        }
      }
    }
  }, [cleanupTerminalArtifacts]);

  // --- Ref-based safeSend to break circular dependency ---
  // Groups need safeSend, but WS needs bumpGroupActivity from groups.
  // We use a ref so groups can call safeSend before the WS hook is wired.
  const safeSendRef = useRef<(data: Record<string, unknown>) => boolean>(
    () => false,
  );
  const safeSendViaRef = useCallback(
    (data: Record<string, unknown>) => safeSendRef.current(data),
    [],
  );

  // --- Step 1: Group management (provides bumpGroupActivity) ---
  const {
    createGroup,
    renameGroup,
    switchGroup,
    archiveGroup,
    clearAllSessions,
    bumpGroupActivity,
  } = useSessionGroups({
    sessions,
    groups,
    activeGroupId,
    sessionsRef,
    deletedSessionIdsRef,
    setSessions,
    setGroups,
    setActiveId,
    safeSend: safeSendViaRef,
    cleanupTerminalArtifacts,
  });

  // --- Step 2: WebSocket (provides safeSend) ---
  const { wsRef, wsVersion, safeSend } = useConsoleWs({
    sessionsRef,
    activeIdRef,
    deletedSessionIdsRef,
    resumableSessionsLoadedRef,
    createdTerminalIds,
    wsConnectCountRef,
    wsEpochRef,
    terminalSeenEpochRef,
    groupsRef,
    settingsRef,
    setSessions,
    setGroups,
    bumpGroupActivity,
    pruneOrphanedTerminals,
  });

  // Wire real safeSend into the ref so groups use it
  useEffect(() => {
    safeSendRef.current = safeSend;
  }, [safeSend]);

  // --- Step 3: Session CRUD (uses safeSend) ---
  const {
    createSession,
    createShellSession,
    switchSession,
    stopSession,
    removeSession,
    renameSession,
    restartSession,
    sendModelChange,
    archiveSession,
    restoreSession,
  } = useSessionCrud({
    sessions,
    activeId,
    sessionsRef,
    deletedSessionIdsRef,
    createdTerminalIds,
    settingsRef,
    setSessions,
    setActiveId,
    setGroups,
    safeSend,
    cleanupTerminalArtifacts,
    pruneOrphanedTerminals,
  });

  // --- Hydrate from localStorage after mount ---
  useEffect(() => {
    const loaded = loadPersistedSessions();
    for (const [id, session] of loaded) {
      const match = findTerminalForSession(id);
      const terminalId = session.terminalId ?? match.terminalId;
      const groupId =
        match.groupId ??
        (session.terminalId
          ? findGroupIdForTerminal(session.terminalId)
          : undefined) ??
        session.groupId;
      const kind = session.kind ?? "claude";
      const inferredStatus =
        terminalId &&
        match.meta?.terminalState !== "exited" &&
        match.meta?.terminalState !== "dead"
          ? "active"
          : "idle";
      if (
        terminalId !== session.terminalId ||
        groupId !== session.groupId ||
        session.status !== inferredStatus ||
        session.kind !== kind
      ) {
        loaded.set(id, {
          ...session,
          terminalId,
          groupId,
          status: inferredStatus,
          kind,
        });
      }
    }
    setSessions(loaded);
    sessionsRef.current = loaded;
    setActiveId(loadActiveId());

    clearOldScrollback(7);
    setHydrated(true);
  }, []);

  // --- Reconcile session <-> group mappings once both stores are hydrated ---
  useEffect(() => {
    if (!hydrated || !layoutHydrated || initialLayoutReconciledRef.current)
      return;
    initialLayoutReconciledRef.current = true;
    const layoutState = useConsoleLayoutStore.getState();
    const layoutGroups = layoutState.groups;
    const fallbackGroupId =
      layoutState.activeGroupId ?? Object.keys(layoutGroups)[0];

    if (!layoutState.activeGroupId && fallbackGroupId) {
      layoutState.setActiveGroup(fallbackGroupId);
    }

    setSessions((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, session] of prev) {
        const match = findTerminalForSession(id);
        const terminalId = session.terminalId ?? match.terminalId;
        const groupId =
          match.groupId ??
          (terminalId ? findGroupIdForTerminal(terminalId) : undefined) ??
          session.groupId ??
          fallbackGroupId;
        if (terminalId !== session.terminalId || groupId !== session.groupId) {
          next.set(id, { ...session, terminalId, groupId });
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Prune orphaned groups that exist in localStorage but not in the layout store
    setGroups((prev) => {
      let pruned = false;
      const next = new Map(prev);
      for (const groupId of prev.keys()) {
        if (!layoutGroups[groupId]) {
          next.delete(groupId);
          pruned = true;
        }
      }
      if (pruned) persistGroups(next);
      return pruned ? next : prev;
    });
  }, [hydrated, layoutHydrated]);

  // --- Keep refs in sync ---
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  // --- Persist sessions to localStorage (debounced) ---
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    persistTimeoutRef.current = setTimeout(() => {
      persistSessions(sessions, activeId);
    }, 500);
    return () => {
      if (persistTimeoutRef.current) clearTimeout(persistTimeoutRef.current);
    };
  }, [sessions, activeId, hydrated]);

  // --- Persist groups to localStorage (debounced) ---
  const persistGroupsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    if (!hydrated) return;
    if (persistGroupsTimeoutRef.current)
      clearTimeout(persistGroupsTimeoutRef.current);
    persistGroupsTimeoutRef.current = setTimeout(() => {
      persistGroups(groups);
    }, 500);
    return () => {
      if (persistGroupsTimeoutRef.current)
        clearTimeout(persistGroupsTimeoutRef.current);
    };
  }, [groups, hydrated]);

  // --- Flush persist on page unload ---
  useEffect(() => {
    const onUnload = () => {
      persistSessions(sessionsRef.current, activeIdRef.current);
      persistGroups(groupsRef.current);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // --- Derived state ---
  const activeSession = activeId ? (sessions.get(activeId) ?? null) : null;
  const sessionList = useMemo(
    () =>
      [...sessions.values()].sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  );
  const groupList = useMemo(
    () => [...groups.values()].sort((a, b) => b.createdAt - a.createdAt),
    [groups],
  );
  const lastCwd = useCallback(() => getLastCwd(sessions), [sessions]);

  // --- Return combined API (same shape as before) ---
  return {
    sessions,
    sessionList,
    activeId,
    activeSession,
    hydrated,
    createSession,
    createClaudeSession: createSession,
    createShellSession,
    switchSession,
    stopSession,
    removeSession,
    renameSession,
    restartSession,
    sendModelChange,
    archiveSession,
    restoreSession,
    wsRef,
    wsVersion,
    getLastCwd: lastCwd,
    // Group management
    groups,
    groupList,
    activeGroupId,
    createGroup,
    renameGroup,
    switchGroup,
    archiveGroup,
    clearAllSessions,
  };
}
