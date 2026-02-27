"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { dispatchPtyMessage } from "@/lib/console/terminal-registry";
import { findTerminalForSession } from "@/lib/console/layout-queries";
import {
  inferProviderFromCommand,
  inferProviderFromModel,
} from "@/lib/console/cli-launch";
import type { ConsoleSession, SessionGroup } from "@/types/console";
import type { ConfigProvider } from "@/types/provider";
import { toast } from "sonner";

export interface UseConsoleWsConfig {
  sessionsRef: React.MutableRefObject<Map<string, ConsoleSession>>;
  activeIdRef: React.MutableRefObject<string | null>;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
  resumableSessionsLoadedRef: React.MutableRefObject<boolean>;
  createdTerminalIds: React.MutableRefObject<Set<string>>;
  wsConnectCountRef: React.MutableRefObject<number>;
  wsEpochRef: React.MutableRefObject<number>;
  terminalSeenEpochRef: React.MutableRefObject<Map<string, number>>;
  groupsRef: React.MutableRefObject<Map<string, SessionGroup>>;
  settingsRef: React.MutableRefObject<Record<string, unknown> | undefined>;
  setSessions: React.Dispatch<
    React.SetStateAction<Map<string, ConsoleSession>>
  >;
  setGroups: React.Dispatch<React.SetStateAction<Map<string, SessionGroup>>>;
  bumpGroupActivity: (groupId: string) => void;
  pruneOrphanedTerminals: () => void;
}

export interface UseConsoleWsResult {
  wsRef: React.MutableRefObject<WebSocket | null>;
  wsVersion: number;
  wsState: "connecting" | "connected" | "reconnecting" | "disconnected";
  safeSend: (data: Record<string, unknown>) => boolean;
}

const GROUP_ACTIVITY_LOOKUP_THROTTLE_MS = 30_000;

type TerminalOwnership = {
  groupId: string;
  sessionId?: string;
};

export function useConsoleWs(config: UseConsoleWsConfig): UseConsoleWsResult {
  const {
    sessionsRef,
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
  } = config;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const reconnectDelayRef = useRef(1000);
  const everConnectedRef = useRef(false);
  const disconnectToastShownRef = useRef(false);
  const lastToastAtRef = useRef(0);
  const terminalOwnershipRef = useRef<Map<string, TerminalOwnership>>(new Map());
  const terminalActivityLookupRef = useRef<Map<string, number>>(new Map());
  const [wsVersion, setWsVersion] = useState(0);
  const [wsState, setWsState] = useState<
    "connecting" | "connected" | "reconnecting" | "disconnected"
  >("connecting");

  const safeSend = useCallback((data: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    function connect() {
      if (!mountedRef.current) return;
      const rs = wsRef.current?.readyState;
      if (rs === WebSocket.OPEN || rs === WebSocket.CONNECTING) return;

      setWsState(everConnectedRef.current ? "reconnecting" : "connecting");
      const wsPort = process.env.NEXT_PUBLIC_WS_PORT || "3001";
      const wsUrl = `ws://${window.location.hostname}:${wsPort}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const syncActiveTerminalsToServer = (): boolean => {
        const layoutState = useConsoleLayoutStore.getState();
        if (!layoutState._hydrated) return false;

        const terminalIds = new Set<string>();
        for (const group of Object.values(layoutState.groups)) {
          for (const terminalId of Object.keys(group.terminals ?? {})) {
            terminalIds.add(terminalId);
          }
        }
        if (terminalIds.size === 0) {
          for (const terminalId of Object.keys(layoutState.terminals)) {
            terminalIds.add(terminalId);
          }
        }
        if (ws.readyState !== WebSocket.OPEN) return true;
        ws.send(
          JSON.stringify({
            type: "pty:sync-active",
            terminalIds: [...terminalIds],
          }),
        );
        return true;
      };

      const scheduleActiveTerminalSync = (attempt = 0) => {
        if (!mountedRef.current || wsRef.current !== ws) return;
        if (ws.readyState !== WebSocket.OPEN) return;
        if (syncActiveTerminalsToServer()) return;
        if (attempt >= 20) return;
        setTimeout(() => scheduleActiveTerminalSync(attempt + 1), 200);
      };

      const connectTimeout = setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }, 5000);

      ws.onopen = () => {
        clearTimeout(connectTimeout);
        reconnectDelayRef.current = 1000;
        everConnectedRef.current = true;
        setWsState("connected");
        if (disconnectToastShownRef.current) {
          const now = Date.now();
          if (now - lastToastAtRef.current > 1_000) {
            toast.success("WebSocket reconnected. Live console features restored.");
            lastToastAtRef.current = now;
          }
          disconnectToastShownRef.current = false;
        }
        wsEpochRef.current += 1;
        wsConnectCountRef.current += 1;
        setWsVersion((v) => v + 1);

        // Heartbeat: ping every 30s
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 30000);

        // Sync orphan timeout setting to server on (re)connect
        const currentSettings = settingsRef.current;
        const orphanMs = currentSettings?.orphanTimeoutMs as number | undefined;
        if (orphanMs !== undefined && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "settings:orphan-timeout",
              timeoutMs: orphanMs,
            }),
          );
        }

        // Reconcile server-side persisted terminals (tmux-backed sessions) with
        // the terminal IDs currently tracked by layout state.
        scheduleActiveTerminalSync();
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;

        try {
          const data = JSON.parse(event.data);

          if (data.type === "pong") return;

          // Seed groups from DB on connect
          if (
            data.type === "console:resumable-groups" &&
            Array.isArray(data.groups)
          ) {
            handleResumableGroups(data, safeSend, setGroups, groupsRef);
            return;
          }

          // Restore sessions from DB
          if (
            data.type === "console:resumable-sessions" &&
            Array.isArray(data.sessions)
          ) {
            handleResumableSessions(
              data,
              safeSend,
              sessionsRef,
              deletedSessionIdsRef,
              resumableSessionsLoadedRef,
              setSessions,
              pruneOrphanedTerminals,
              terminalOwnershipRef,
            );
            return;
          }

          // PTY created/reclaimed
          if (data.type === "pty:created") {
            handlePtyCreated(
              data,
              wsEpochRef,
              terminalSeenEpochRef,
              wsConnectCountRef,
              createdTerminalIds,
              setSessions,
            );
            return;
          }

          // Route PTY messages
          if (data.terminalId) {
            handleTerminalMessage(
              data,
              setSessions,
              terminalOwnershipRef,
              terminalActivityLookupRef,
              sessionsRef,
              bumpGroupActivity,
            );
          } else {
            // Broadcast non-PTY messages for other hooks
            window.dispatchEvent(
              new CustomEvent("console:ws-message", { detail: data }),
            );
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        clearTimeout(connectTimeout);
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;

        wsRef.current = null;
        setWsState("reconnecting");
        if (everConnectedRef.current && !disconnectToastShownRef.current) {
          const now = Date.now();
          if (now - lastToastAtRef.current > 5_000) {
            toast.warning(
              "WebSocket disconnected. Console live actions are paused while reconnecting.",
            );
            lastToastAtRef.current = now;
          }
          disconnectToastShownRef.current = true;
        }
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        setWsVersion((v) => v + 1);
        if (mountedRef.current) {
          const delay = reconnectDelayRef.current;
          reconnectDelayRef.current = Math.min(delay * 2, 10000);
          reconnectRef.current = setTimeout(() => connect(), delay);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
      setWsState("disconnected");
    };
  }, []);

  return { wsRef, wsVersion, wsState, safeSend };
}

// --- Message handlers (extracted for readability) ---

function handleResumableGroups(
  data: {
    groups: Array<{
      id: string;
      label: string;
      createdAt: number;
      lastActivityAt: number;
    }>;
  },
  safeSend: (data: Record<string, unknown>) => boolean,
  setGroups: React.Dispatch<
    React.SetStateAction<Map<string, import("@/types/console").SessionGroup>>
  >,
  groupsRef: React.MutableRefObject<
    Map<string, import("@/types/console").SessionGroup>
  >,
) {
  const serverGroupIds = new Set<string>();
  let mergedGroupsSnapshot = groupsRef.current;
  setGroups((prev) => {
    const next = new Map(prev);
    let changed = false;
    for (const g of data.groups) {
      serverGroupIds.add(g.id);
      if (!next.has(g.id)) {
        next.set(g.id, {
          id: g.id,
          label: g.label,
          createdAt: g.createdAt,
          lastActivityAt: g.lastActivityAt,
        });
        changed = true;
      }
    }
    // Push localStorage groups the server doesn't know about
    for (const [id, group] of next) {
      if (!serverGroupIds.has(id)) {
        safeSend({
          type: "group:create",
          groupId: id,
          label: group.label,
          createdAt: group.createdAt,
        });
      }
    }
    mergedGroupsSnapshot = changed ? next : prev;
    return changed ? next : prev;
  });
  groupsRef.current = mergedGroupsSnapshot;

  // Sync layout store with hook groups
  queueMicrotask(() => {
    const mergedGroups = mergedGroupsSnapshot;
    for (const gid of Object.keys(useConsoleLayoutStore.getState().groups)) {
      if (!mergedGroups.has(gid)) {
        useConsoleLayoutStore.getState().removeGroup(gid);
      }
    }
    for (const gid of mergedGroups.keys()) {
      if (!useConsoleLayoutStore.getState().groups[gid]) {
        useConsoleLayoutStore.getState().ensureGroup(gid);
      }
    }
  });
}

function handleResumableSessions(
  data: { sessions: Array<Record<string, unknown>> },
  safeSend: (d: Record<string, unknown>) => boolean,
  sessionsRef: React.MutableRefObject<Map<string, ConsoleSession>>,
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>,
  resumableSessionsLoadedRef: React.MutableRefObject<boolean>,
  setSessions: React.Dispatch<
    React.SetStateAction<Map<string, ConsoleSession>>
  >,
  pruneOrphanedTerminals: () => void,
  terminalOwnershipRef: React.MutableRefObject<Map<string, TerminalOwnership>>,
) {
  resumableSessionsLoadedRef.current = true;
  const orphanIds: string[] = [];
  const groupAssignments: Array<{ id: string; groupId: string }> = [];
  const additions: ConsoleSession[] = [];
  const existing = sessionsRef.current;
  const deleted = deletedSessionIdsRef.current;

  for (const s of data.sessions) {
    const sid = s.id as string;
    if (deleted.has(sid)) {
      safeSend({ type: "remove-session", consoleSessionId: sid });
      continue;
    }
    if (existing.has(sid)) continue;
    const match = findTerminalForSession(sid);
    const tid = match.terminalId;
    if (tid) {
      const providerFromPayload =
        (s.provider as ConfigProvider | undefined) ?? undefined;
      const provider =
        providerFromPayload ??
        inferProviderFromCommand(match.meta?.command) ??
        inferProviderFromModel(
          (match.meta?.model as string | null | undefined) ??
            (s.model as string | null | undefined) ??
            null,
        ) ??
        "claude";
      const resolvedGroupId = match.groupId ?? (s.groupId as string) ?? undefined;
      const inferredStatus =
        match.meta?.terminalState !== "exited" &&
        match.meta?.terminalState !== "dead"
          ? "active"
          : "idle";
      additions.push({
        id: sid,
        label: s.label as string,
        cwd: s.cwd as string,
        status: inferredStatus,
        kind: "claude",
        provider,
        createdAt: s.createdAt as number,
        claudeSessionId:
          provider === "claude"
            ? ((s.claudeSessionId as string) ?? undefined)
            : undefined,
        manuallyRenamed: s.manuallyRenamed as boolean | undefined,
        lastActivityAt: (s.lastActivityAt as number) ?? undefined,
        groupId: resolvedGroupId,
        agentName: (s.agentName as string) ?? undefined,
        terminalId: tid,
      });
      if (resolvedGroupId) {
        terminalOwnershipRef.current.set(tid, {
          groupId: resolvedGroupId,
          sessionId: sid,
        });
      }
      if (!s.groupId && match.groupId) {
        groupAssignments.push({ id: sid, groupId: match.groupId });
      }
    } else {
      orphanIds.push(sid);
    }
  }

  if (additions.length > 0) {
    // Keep the ref updated synchronously before orphan pruning runs.
    const optimisticMerged = new Map(existing);
    for (const session of additions) {
      optimisticMerged.set(session.id, session);
    }
    sessionsRef.current = optimisticMerged;
    setSessions((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const session of additions) {
        if (!next.has(session.id)) {
          next.set(session.id, session);
          changed = true;
        }
      }
      const resolved = changed ? next : prev;
      sessionsRef.current = resolved;
      return resolved;
    });
  }
  for (const id of orphanIds) {
    safeSend({ type: "remove-session", consoleSessionId: id });
  }
  for (const assignment of groupAssignments) {
    safeSend({
      type: "session:set-group",
      consoleSessionId: assignment.id,
      groupId: assignment.groupId,
    });
  }
  pruneOrphanedTerminals();
}

function handlePtyCreated(
  data: Record<string, unknown>,
  wsEpochRef: React.MutableRefObject<number>,
  terminalSeenEpochRef: React.MutableRefObject<Map<string, number>>,
  wsConnectCountRef: React.MutableRefObject<number>,
  createdTerminalIds: React.MutableRefObject<Set<string>>,
  setSessions: React.Dispatch<
    React.SetStateAction<Map<string, ConsoleSession>>
  >,
) {
  const terminalId = data.terminalId as string;
  const reclaimed = data.reclaimed as boolean | undefined;
  const currentEpoch = wsEpochRef.current;
  const lastSeenEpoch = terminalSeenEpochRef.current.get(terminalId);
  terminalSeenEpochRef.current.set(terminalId, currentEpoch);

  setSessions((prev) => {
    const next = new Map(prev);
    let changed = false;
    let found = false;
    for (const [sid, s] of next) {
      if (s.terminalId === terminalId && s.status === "idle") {
        next.set(sid, { ...s, status: "active" });
        changed = true;
        found = true;
        break;
      }
    }
    if (!found) {
      const { groups: storeGroups } = useConsoleLayoutStore.getState();
      for (const g of Object.values(storeGroups)) {
        const meta = g.terminals[terminalId];
        if (meta?.sessionId && next.has(meta.sessionId)) {
          const s = next.get(meta.sessionId)!;
          if (s.status === "idle") {
            next.set(meta.sessionId, { ...s, status: "active", terminalId });
            changed = true;
          }
          break;
        }
      }
    }
    return changed ? next : prev;
  });

  // Show reconnection indicator
  const isReconnect =
    reclaimed &&
    wsConnectCountRef.current > 1 &&
    !createdTerminalIds.current.has(terminalId) &&
    lastSeenEpoch !== undefined &&
    lastSeenEpoch < currentEpoch;
  if (isReconnect) {
    dispatchPtyMessage({
      type: "pty:output",
      terminalId,
      data: "\x1b[32m\u2713 Terminal reconnected \u2014 shell process preserved\x1b[0m\r\n",
    });
  }
}

function handleTerminalMessage(
  data: Record<string, unknown>,
  setSessions: React.Dispatch<
    React.SetStateAction<Map<string, ConsoleSession>>
  >,
  terminalOwnershipRef: React.MutableRefObject<Map<string, TerminalOwnership>>,
  terminalActivityLookupRef: React.MutableRefObject<Map<string, number>>,
  sessionsRef: React.MutableRefObject<Map<string, ConsoleSession>>,
  bumpGroupActivity: (groupId: string) => void,
) {
  const termId = data.terminalId as string;

  if (data.type === "pty:cwd-change") {
    const newCwd = data.cwd as string;
    const { updateTerminalMeta } = useConsoleLayoutStore.getState();
    const ownership = resolveTerminalOwnership(termId, terminalOwnershipRef);
    const sessionId = ownership?.sessionId;
    if (sessionId) {
      const capturedSessionId = sessionId;
      setSessions((prev) => {
        const session = prev.get(capturedSessionId);
        if (!session) return prev;
        if (session.cwd === newCwd) return prev;
        const next = new Map(prev);
        next.set(capturedSessionId, { ...session, cwd: newCwd });
        return next;
      });
      const session = sessionsRef.current.get(sessionId);
      if (session?.groupId) {
        bumpGroupActivity(session.groupId);
      }
    }
    updateTerminalMeta(termId, { cwd: newCwd });
    return;
  }

  if (data.type === "pty:died") {
    dispatchPtyMessage({ type: "pty:died", terminalId: termId });
    useConsoleLayoutStore
      .getState()
      .updateTerminalMeta(termId, { terminalState: "dead" });
    terminalActivityLookupRef.current.delete(termId);
    return;
  }

  if (data.type === "pty:exit") {
    const ownership = resolveTerminalOwnership(termId, terminalOwnershipRef);
    if (ownership?.sessionId) {
      const capturedSessionId = ownership.sessionId;
      setSessions((prev) => {
        const session = prev.get(capturedSessionId);
        if (!session) return prev;
        if (session.status === "idle") return prev;
        const next = new Map(prev);
        next.set(capturedSessionId, { ...session, status: "idle" });
        return next;
      });
    }
    dispatchPtyMessage(
      data as {
        type: string;
        terminalId: string;
        data?: string;
        exitCode?: number;
      },
    );
    useConsoleLayoutStore.getState().updateTerminalMeta(termId, {
      terminalState: "exited",
      exitCode: (data as { exitCode?: number }).exitCode ?? 0,
      exitedAt: Date.now(),
    });
    terminalActivityLookupRef.current.delete(termId);
  } else {
    // General PTY data — avoid expensive ownership scans on every output chunk.
    const now = Date.now();
    const lastLookup = terminalActivityLookupRef.current.get(termId) ?? 0;
    if (now - lastLookup >= GROUP_ACTIVITY_LOOKUP_THROTTLE_MS) {
      terminalActivityLookupRef.current.set(termId, now);
      const cachedSessionId =
        resolveTerminalOwnership(termId, terminalOwnershipRef)?.sessionId;
      if (cachedSessionId) {
        const session = sessionsRef.current.get(cachedSessionId);
        if (session?.groupId) bumpGroupActivity(session.groupId);
      }
    }
    dispatchPtyMessage(
      data as {
        type: string;
        terminalId: string;
        data?: string;
        exitCode?: number;
      },
    );
  }
}

function resolveTerminalOwnership(
  terminalId: string,
  terminalOwnershipRef: React.MutableRefObject<Map<string, TerminalOwnership>>,
): TerminalOwnership | undefined {
  const cached = terminalOwnershipRef.current.get(terminalId);
  if (cached) {
    const group = useConsoleLayoutStore.getState().groups[cached.groupId];
    const meta = group?.terminals[terminalId];
    if (meta) {
      if (meta.sessionId !== cached.sessionId) {
        const updated = { groupId: cached.groupId, sessionId: meta.sessionId };
        terminalOwnershipRef.current.set(terminalId, updated);
        return updated;
      }
      return cached;
    }
    terminalOwnershipRef.current.delete(terminalId);
  }

  const { groups } = useConsoleLayoutStore.getState();
  for (const [groupId, group] of Object.entries(groups)) {
    const meta = group.terminals[terminalId];
    if (!meta) continue;
    const resolved = { groupId, sessionId: meta.sessionId };
    terminalOwnershipRef.current.set(terminalId, resolved);
    return resolved;
  }

  return undefined;
}

export const __testables = {
  handleResumableGroups,
  handleResumableSessions,
};
