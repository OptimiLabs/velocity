"use client";

import { useCallback } from "react";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import { archiveScrollback } from "@/lib/console/terminal-db";
import { findLeafByContent } from "@/lib/console/pane-tree";
import { buildClaudeArgs, buildClaudeEnv } from "@/lib/console/claude-args";
import { trackActivity, deleteActivity } from "@/lib/console/activity-tracker";
import { STORAGE_KEY_LAST_CWD } from "@/lib/console/session-persistence";
import { toast } from "sonner";
import type { ConsoleSession, SessionGroup } from "@/types/console";

export interface UseSessionCrudConfig {
  sessions: Map<string, ConsoleSession>;
  activeId: string | null;
  sessionsRef: React.MutableRefObject<Map<string, ConsoleSession>>;
  deletedSessionIdsRef: React.MutableRefObject<Set<string>>;
  createdTerminalIds: React.MutableRefObject<Set<string>>;
  settingsRef: React.MutableRefObject<Record<string, unknown> | undefined>;
  setSessions: React.Dispatch<
    React.SetStateAction<Map<string, ConsoleSession>>
  >;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setGroups: React.Dispatch<React.SetStateAction<Map<string, SessionGroup>>>;
  safeSend: (data: Record<string, unknown>) => boolean;
  cleanupTerminalArtifacts: (terminalId: string) => void;
  pruneOrphanedTerminals: () => void;
}

export interface UseSessionCrudResult {
  createSession: (opts: CreateSessionOpts) => string | null;
  createShellSession: (opts: CreateShellSessionOpts) => string | null;
  switchSession: (id: string) => void;
  stopSession: (id: string) => void;
  removeSession: (id: string) => void;
  renameSession: (id: string, label: string) => void;
  restartSession: (id: string, opts?: RestartSessionOpts) => void;
  sendModelChange: (id: string, model: string) => void;
  archiveSession: (id: string) => Promise<void>;
  restoreSession: (id: string) => Promise<void>;
}

interface CreateSessionOpts {
  cwd: string;
  label?: string;
  prompt?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  env?: Record<string, string>;
  claudeSessionId?: string;
  skipPermissions?: boolean;
  groupId?: string;
  agentName?: string;
  source?: "user" | "auto";
}

interface CreateShellSessionOpts {
  cwd: string;
  label?: string;
  env?: Record<string, string>;
  groupId?: string;
}

interface RestartSessionOpts {
  model?: string;
  effort?: "low" | "medium" | "high";
  env?: Record<string, string>;
}

export function useSessionCrud(
  config: UseSessionCrudConfig,
): UseSessionCrudResult {
  const {
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
  } = config;

  const updateSession = useCallback(
    (id: string, updater: (s: ConsoleSession) => ConsoleSession) => {
      setSessions((prev) => {
        const session = prev.get(id);
        if (!session) return prev;
        const next = new Map(prev);
        next.set(id, updater(session));
        return next;
      });
    },
    [setSessions],
  );

  const createSession = useCallback(
    ({
      cwd,
      label,
      prompt,
      model,
      effort,
      env,
      claudeSessionId,
      skipPermissions,
      groupId,
      agentName,
      source: _source = "user",
    }: CreateSessionOpts) => {
      const targetGroupId =
        groupId || useConsoleLayoutStore.getState().activeGroupId;

      const id = crypto.randomUUID();
      const effectiveModel =
        model ?? (settingsRef.current?.model as string | undefined);
      const effectiveEffort = (effort ??
        (settingsRef.current?.effortLevel as string | undefined)) as
        | "low"
        | "medium"
        | "high"
        | undefined;
      const claudeArgs = buildClaudeArgs({
        model: effectiveModel,
        claudeSessionId,
        skipPermissions,
      });
      const claudeEnv = buildClaudeEnv({ effort: effectiveEffort, env });

      const { addTerminal, setActiveSessionId } =
        useConsoleLayoutStore.getState();
      const terminalId = addTerminal(
        {
          label: label || undefined,
          cwd,
          envOverrides: claudeEnv,
          sessionId: id,
          isClaudeSession: true,
          claudeSessionId,
          model,
          effort,
          command: "claude",
          args: claudeArgs,
          pendingPrompt: prompt,
        },
        undefined,
        targetGroupId ?? undefined,
      );

      createdTerminalIds.current.add(terminalId);

      const assignedLabel =
        label ||
        useConsoleLayoutStore.getState().terminals[terminalId]?.label ||
        "New Session";

      const session: ConsoleSession = {
        id,
        label: assignedLabel,
        cwd,
        status: "active",
        kind: "claude",
        createdAt: Date.now(),
        claudeSessionId,
        terminalId,
        model,
        effort,
        env,
        groupId: targetGroupId ?? undefined,
        agentName,
      };

      setSessions((prev) => {
        const next = new Map(prev);
        next.set(id, session);
        sessionsRef.current = next;
        return next;
      });
      setActiveId(id);

      try {
        localStorage.setItem(STORAGE_KEY_LAST_CWD, cwd);
      } catch {
        /* non-critical */
      }

      setActiveSessionId(id);
      trackActivity(id);

      safeSend({
        type: "session:persist",
        consoleSessionId: id,
        cwd,
        label: assignedLabel,
        createdAt: session.createdAt,
        firstPrompt: prompt,
        agentName,
      });

      if (targetGroupId) {
        safeSend({
          type: "session:set-group",
          consoleSessionId: id,
          groupId: targetGroupId,
        });
      }

      if (targetGroupId) {
        const gid = targetGroupId;
        setGroups((prev) => {
          const group = prev.get(gid);
          if (!group) return prev;
          const next = new Map(prev);
          next.set(gid, { ...group, lastActivityAt: Date.now() });
          return next;
        });
      }

      return id;
    },
    [
      safeSend,
      sessionsRef,
      settingsRef,
      createdTerminalIds,
      setSessions,
      setActiveId,
      setGroups,
    ],
  );

  const createShellSession = useCallback(
    ({ cwd, label, env, groupId }: CreateShellSessionOpts) => {
      const targetGroupId =
        groupId || useConsoleLayoutStore.getState().activeGroupId;
      const id = crypto.randomUUID();

      const { addTerminal, setActiveSessionId, switchGroup } =
        useConsoleLayoutStore.getState();
      const terminalId = addTerminal(
        {
          label: label || undefined,
          cwd,
          envOverrides: env,
          sessionId: id,
        },
        undefined,
        targetGroupId ?? undefined,
      );

      if (
        targetGroupId &&
        targetGroupId !== useConsoleLayoutStore.getState().activeGroupId
      ) {
        switchGroup(targetGroupId);
      }

      createdTerminalIds.current.add(terminalId);

      const assignedLabel =
        label ||
        useConsoleLayoutStore.getState().terminals[terminalId]?.label ||
        "Terminal Session";

      const session: ConsoleSession = {
        id,
        label: assignedLabel,
        cwd,
        status: "active",
        kind: "shell",
        createdAt: Date.now(),
        terminalId,
        env,
        groupId: targetGroupId ?? undefined,
      };

      setSessions((prev) => {
        const next = new Map(prev);
        next.set(id, session);
        sessionsRef.current = next;
        return next;
      });
      setActiveId(id);
      setActiveSessionId(id);
      trackActivity(id);

      try {
        localStorage.setItem(STORAGE_KEY_LAST_CWD, cwd);
      } catch {
        /* non-critical */
      }

      if (targetGroupId) {
        const gid = targetGroupId;
        setGroups((prev) => {
          const group = prev.get(gid);
          if (!group) return prev;
          const next = new Map(prev);
          next.set(gid, { ...group, lastActivityAt: Date.now() });
          return next;
        });
      }

      return id;
    },
    [sessionsRef, createdTerminalIds, setSessions, setActiveId, setGroups],
  );

  const switchSession = useCallback(
    (id: string) => {
      setActiveId(id);
      const session = sessionsRef.current.get(id);
      if (session?.terminalId) {
        const store = useConsoleLayoutStore.getState();
        for (const [gid, group] of Object.entries(store.groups)) {
          if (!group.terminals[session.terminalId]) continue;
          if (gid !== store.activeGroupId) store.switchGroup(gid);

          const freshGroup = useConsoleLayoutStore.getState().groups[gid];
          if (!freshGroup) break;

          const terminalLeaf = findLeafByContent(freshGroup.paneTree, (c) => {
            if (c.type !== "terminal") return false;
            const meta = freshGroup.terminals[c.terminalId];
            return meta?.sessionId === id;
          });

          if (terminalLeaf) {
            useConsoleLayoutStore.getState().setActivePaneId(terminalLeaf.id);
            useConsoleLayoutStore.getState().setFocusedPane(terminalLeaf.id);
          }
          break;
        }
      }
      useConsoleLayoutStore.getState().setActiveSessionId(id);
    },
    [setActiveId, sessionsRef],
  );

  const stopSession = useCallback(
    (id: string) => {
      const session = sessions.get(id);
      if (!session) return;

      if (session.terminalId) {
        safeSend({ type: "pty:close", terminalId: session.terminalId });
      }

      updateSession(id, (s) => ({ ...s, status: "idle" }));
    },
    [sessions, updateSession, safeSend],
  );

  const removeSession = useCallback(
    (id: string) => {
      const session = sessions.get(id);
      if (session && session.status !== "idle") {
        stopSession(id);
      }
      deletedSessionIdsRef.current.add(id);
      deleteActivity(id);

      const { groups, removeTerminal } = useConsoleLayoutStore.getState();
      const terminalIds: string[] = [];
      for (const g of Object.values(groups)) {
        for (const [tid, meta] of Object.entries(g.terminals)) {
          if (meta.sessionId === id) terminalIds.push(tid);
        }
      }
      for (const terminalId of terminalIds) {
        safeSend({ type: "pty:close", terminalId });
        removeTerminal(terminalId);
        cleanupTerminalArtifacts(terminalId);
      }

      safeSend({ type: "remove-session", consoleSessionId: id });

      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        sessionsRef.current = next;
        return next;
      });

      if (activeId === id) {
        setActiveId(() => {
          const remaining = [...sessionsRef.current.keys()].filter(
            (k) => k !== id,
          );
          return remaining.length > 0 ? remaining[remaining.length - 1] : null;
        });
      }

      pruneOrphanedTerminals();
    },
    [
      sessions,
      activeId,
      stopSession,
      safeSend,
      cleanupTerminalArtifacts,
      pruneOrphanedTerminals,
      setSessions,
      setActiveId,
      sessionsRef,
      deletedSessionIdsRef,
    ],
  );

  const renameSession = useCallback(
    (id: string, label: string) => {
      updateSession(id, (s) => ({ ...s, label, manuallyRenamed: true }));
      const session = sessions.get(id);
      if (session?.terminalId) {
        const { updateTerminalMeta } = useConsoleLayoutStore.getState();
        updateTerminalMeta(session.terminalId, { label });
      }
      safeSend({ type: "rename-session", consoleSessionId: id, label });
    },
    [updateSession, sessions, safeSend],
  );

  const restartSession = useCallback(
    (id: string, opts?: RestartSessionOpts) => {
      const session = sessions.get(id);
      if (!session) return;
      if (session.kind === "shell") {
        toast.error("Shell sessions do not support restart.");
        return;
      }

      if (session.terminalId) {
        safeSend({ type: "pty:close", terminalId: session.terminalId });
        const { removeTerminal } = useConsoleLayoutStore.getState();
        removeTerminal(session.terminalId);
        cleanupTerminalArtifacts(session.terminalId);
      }

      const newModel =
        opts?.model ??
        session.model ??
        (settingsRef.current?.model as string | undefined);
      const newEffort = (opts?.effort ??
        session.effort ??
        (settingsRef.current?.effortLevel as string | undefined)) as
        | "low"
        | "medium"
        | "high"
        | undefined;
      const newEnv = opts?.env ? { ...session.env, ...opts.env } : session.env;

      const claudeArgs = buildClaudeArgs({
        model: newModel,
        claudeSessionId: session.claudeSessionId,
      });
      const claudeEnv = buildClaudeEnv({ effort: newEffort, env: newEnv });

      const { addTerminal } = useConsoleLayoutStore.getState();
      const terminalId = addTerminal({
        label: session.label,
        cwd: session.cwd,
        envOverrides: claudeEnv,
        sessionId: id,
        isClaudeSession: true,
        claudeSessionId: session.claudeSessionId,
        model: newModel,
        effort: newEffort,
        command: "claude",
        args: claudeArgs,
      });
      createdTerminalIds.current.add(terminalId);

      updateSession(id, (s) => ({
        ...s,
        status: "active",
        terminalId,
        model: newModel,
        effort: newEffort,
        env: newEnv,
      }));
    },
    [
      sessions,
      safeSend,
      updateSession,
      cleanupTerminalArtifacts,
      settingsRef,
      createdTerminalIds,
    ],
  );

  const sendModelChange = useCallback(
    (id: string, model: string) => {
      const session = sessions.get(id);
      if (!session?.terminalId || session.kind === "shell") return;

      safeSend({
        type: "pty:input",
        terminalId: session.terminalId,
        data: `/model ${model}\n`,
      });

      updateSession(id, (s) => ({ ...s, model }));

      const { updateTerminalMeta } = useConsoleLayoutStore.getState();
      updateTerminalMeta(session.terminalId, { model });

      window.dispatchEvent(
        new CustomEvent("console:ws-message", {
          detail: {
            type: "console:model-info",
            consoleSessionId: id,
            model,
            permissionMode: null,
          },
        }),
      );
    },
    [sessions, safeSend, updateSession],
  );

  const archiveSession = useCallback(
    async (id: string) => {
      const session = sessions.get(id);
      if (!session) return;
      if (session.kind === "shell") {
        removeSession(id);
        return;
      }

      if (session.status !== "idle") {
        stopSession(id);
      }

      const { groups, removeTerminal } = useConsoleLayoutStore.getState();
      const linkedTerminals: Array<{
        terminalId: string;
        label?: string;
        cwd: string;
        envOverrides?: Record<string, string>;
      }> = [];
      for (const g of Object.values(groups)) {
        for (const [terminalId, meta] of Object.entries(g.terminals)) {
          if (meta.sessionId !== id) continue;
          linkedTerminals.push({
            terminalId,
            label: meta.label,
            cwd: meta.cwd,
            envOverrides: meta.envOverrides,
          });
        }
      }

      try {
        const res = await fetch("/api/console-sessions/archive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, terminals: linkedTerminals }),
        });
        if (!res.ok) {
          console.error(
            "[CONSOLE] Archive failed:",
            res.status,
            await res.text().catch(() => ""),
          );
          return;
        }
      } catch (err) {
        console.error(
          "[CONSOLE] Archive fetch failed:",
          (err as Error).message,
        );
        return;
      }

      // Close PTYs for linked terminals — normalized to use safeSend
      for (const t of linkedTerminals) {
        safeSend({ type: "pty:close", terminalId: t.terminalId });
        removeTerminal(t.terminalId);
        archiveScrollback(t.terminalId, id);
        cleanupTerminalArtifacts(t.terminalId);
      }

      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        sessionsRef.current = next;
        return next;
      });

      if (activeId === id) {
        setActiveId(() => {
          const remaining = [...sessionsRef.current.keys()].filter(
            (k) => k !== id,
          );
          return remaining.length > 0 ? remaining[remaining.length - 1] : null;
        });
      }

      deletedSessionIdsRef.current.add(id);
      deleteActivity(id);
      pruneOrphanedTerminals();
    },
    [
      sessions,
      activeId,
      stopSession,
      cleanupTerminalArtifacts,
      pruneOrphanedTerminals,
      removeSession,
      safeSend,
      setSessions,
      setActiveId,
      sessionsRef,
      deletedSessionIdsRef,
    ],
  );

  const restoreSession = useCallback(
    async (id: string) => {
      try {
        const res = await fetch("/api/console-sessions/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) return;
        const restored = await res.json();

        const restoredSession: ConsoleSession = {
          id: restored.id,
          label: restored.label,
          cwd: restored.cwd,
          status: "idle",
          kind: "claude",
          createdAt: restored.createdAt,
          claudeSessionId: restored.claudeSessionId ?? undefined,
          model: restored.model ?? undefined,
          effort: restored.effort ?? undefined,
          env: restored.env ?? undefined,
          manuallyRenamed: restored.manuallyRenamed,
          groupId: restored.groupId ?? undefined,
        };

        setSessions((prev) => {
          const next = new Map(prev);
          next.set(id, restoredSession);
          sessionsRef.current = next;
          return next;
        });
        deletedSessionIdsRef.current.delete(id);

        const archivedTerminals = restored.archivedTerminals ?? [];
        const { addTerminal } = useConsoleLayoutStore.getState();
        for (const t of archivedTerminals) {
          addTerminal({
            label: t.label,
            cwd: t.cwd,
            envOverrides: t.envOverrides,
            sessionId: id,
          });
        }

        setActiveId(id);
        useConsoleLayoutStore.getState().setActiveSessionId(id);
      } catch {
        // Restore failed — non-critical
      }
    },
    [setSessions, setActiveId, sessionsRef, deletedSessionIdsRef],
  );

  return {
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
  };
}
