"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getContextWindow } from "@/lib/cost/pricing";

export interface SessionContextState {
  // Current turn (latest)
  lastTurnInputTokens: number;
  turnInputTokens: number;
  turnOutputTokens: number;
  turnCacheReadTokens: number;
  turnCacheWriteTokens: number;
  turnCost: number;

  // Cumulative (sum of all turns)
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalCost: number;

  // Session info
  model: string | null;
  contextWindow: number;
  turnCount: number;

  // Git context
  gitBranch: string | null;
  gitDirty: boolean;
  isWorktree: boolean;

  // Permission mode
  permissionMode: string | null;
}

const INITIAL_STATE: SessionContextState = {
  lastTurnInputTokens: 0,
  turnInputTokens: 0,
  turnOutputTokens: 0,
  turnCacheReadTokens: 0,
  turnCacheWriteTokens: 0,
  turnCost: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  totalCost: 0,
  model: null,
  contextWindow: getContextWindow(),
  turnCount: 0,
  gitBranch: null,
  gitDirty: false,
  isWorktree: false,
  permissionMode: null,
};

// Module-level cache: survives across renders and re-mounts without
// triggering React lint rules about refs-during-render.
const sessionStateCache = new Map<string, SessionContextState>();

export function useSessionContext(consoleSessionId: string | null) {
  const [state, setState] = useState<SessionContextState>(() =>
    consoleSessionId
      ? (sessionStateCache.get(consoleSessionId) ?? INITIAL_STATE)
      : INITIAL_STATE,
  );
  const prevSessionIdRef = useRef<string | null>(consoleSessionId);

  // Keep a ref mirror so the effect cleanup / WS handler always has latest state
  // without adding `state` to dependency arrays.
  const stateRef = useRef<SessionContextState>(state);

  /** Update both React state and the mutable ref mirror. */
  const setStateAndSync = useCallback(
    (
      updater:
        | SessionContextState
        | ((prev: SessionContextState) => SessionContextState),
    ) => {
      setState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  // Save/restore state when session changes
  useEffect(() => {
    if (consoleSessionId !== prevSessionIdRef.current) {
      // Save current state for the old session
      const oldId = prevSessionIdRef.current;
      if (oldId) {
        sessionStateCache.set(oldId, stateRef.current);
      }

      prevSessionIdRef.current = consoleSessionId;

      // Restore from cache or reset
      const cached = consoleSessionId
        ? sessionStateCache.get(consoleSessionId)
        : undefined;
      const next = cached ?? INITIAL_STATE;
      stateRef.current = next;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: sync derived state from prop change
      setState(next);
    }
  }, [consoleSessionId]);

  // Persist to cache on unmount so remounting the panel restores state
  useEffect(() => {
    return () => {
      if (prevSessionIdRef.current) {
        sessionStateCache.set(prevSessionIdRef.current, stateRef.current);
      }
    };
  }, []);

  const handleMessage = useCallback(
    (e: Event) => {
      const data = (e as CustomEvent).detail;
      if (!data?.type || !consoleSessionId) return;

      // Filter by active session
      if (data.consoleSessionId !== consoleSessionId) return;

      switch (data.type) {
        case "console:context-update": {
          const turnInput = (data.turnInputTokens as number) || 0;
          const turnOutput = (data.turnOutputTokens as number) || 0;
          const turnCacheRead = (data.turnCacheReadTokens as number) || 0;
          const turnCacheWrite = (data.turnCacheWriteTokens as number) || 0;
          const turnCost = (data.turnCost as number) || 0;
          const lastTurnInput = (data.lastTurnInputTokens as number) || 0;
          const model = (data.model as string) || null;

          setStateAndSync((prev) => ({
            ...prev,
            lastTurnInputTokens: lastTurnInput,
            turnInputTokens: turnInput,
            turnOutputTokens: turnOutput,
            turnCacheReadTokens: turnCacheRead,
            turnCacheWriteTokens: turnCacheWrite,
            turnCost,
            totalInputTokens: prev.totalInputTokens + turnInput,
            totalOutputTokens: prev.totalOutputTokens + turnOutput,
            totalCacheReadTokens: prev.totalCacheReadTokens + turnCacheRead,
            totalCacheWriteTokens: prev.totalCacheWriteTokens + turnCacheWrite,
            totalCost: prev.totalCost + turnCost,
            turnCount: prev.turnCount + 1,
            ...(model ? { model, contextWindow: getContextWindow(model) } : {}),
          }));
          break;
        }

        case "console:token-reconcile": {
          // Reconcile replaces cumulative totals with accurate server values.
          // Use != null (not ||) so zero values from the server aren't ignored.
          const model = (data.model as string) || null;
          setStateAndSync((prev) => ({
            ...prev,
            totalInputTokens:
              data.totalInputTokens != null ? (data.totalInputTokens as number) : prev.totalInputTokens,
            totalOutputTokens:
              data.totalOutputTokens != null ? (data.totalOutputTokens as number) : prev.totalOutputTokens,
            totalCacheReadTokens:
              data.totalCacheReadTokens != null ? (data.totalCacheReadTokens as number) : prev.totalCacheReadTokens,
            totalCacheWriteTokens:
              data.totalCacheWriteTokens != null ? (data.totalCacheWriteTokens as number) : prev.totalCacheWriteTokens,
            totalCost:
              data.totalCost != null ? (data.totalCost as number) : prev.totalCost,
            ...(model ? { model, contextWindow: getContextWindow(model) } : {}),
          }));
          break;
        }

        case "console:model-info": {
          const model = (data.model as string) || null;
          const permissionMode = (data.permissionMode as string) || null;
          setStateAndSync((prev) => ({
            ...prev,
            ...(model ? { model, contextWindow: getContextWindow(model) } : {}),
            permissionMode,
          }));
          break;
        }

        case "console:session-history": {
          const model = (data.model as string) || null;
          setStateAndSync((prev) => ({
            ...prev,
            totalInputTokens:
              data.totalInputTokens != null ? (data.totalInputTokens as number) : prev.totalInputTokens,
            totalOutputTokens:
              data.totalOutputTokens != null ? (data.totalOutputTokens as number) : prev.totalOutputTokens,
            totalCacheReadTokens:
              data.totalCacheReadTokens != null ? (data.totalCacheReadTokens as number) : prev.totalCacheReadTokens,
            totalCacheWriteTokens:
              data.totalCacheWriteTokens != null ? (data.totalCacheWriteTokens as number) : prev.totalCacheWriteTokens,
            totalCost:
              data.totalCost != null ? (data.totalCost as number) : prev.totalCost,
            lastTurnInputTokens:
              data.lastTurnInputTokens != null ? (data.lastTurnInputTokens as number) : prev.lastTurnInputTokens,
            ...(model ? { model, contextWindow: getContextWindow(model) } : {}),
          }));
          break;
        }

        case "console:git-context": {
          setStateAndSync((prev) => ({
            ...prev,
            gitBranch: (data.branch as string) || null,
            gitDirty: !!data.isDirty,
            isWorktree: !!data.isWorktree,
          }));
          break;
        }
      }
    },
    [consoleSessionId, setStateAndSync],
  );

  useEffect(() => {
    window.addEventListener("console:ws-message", handleMessage);
    return () =>
      window.removeEventListener("console:ws-message", handleMessage);
  }, [handleMessage]);

  return state;
}
