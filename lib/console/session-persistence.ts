/**
 * LocalStorage persistence for console sessions and groups.
 */

import type { ConsoleSession, SessionGroup } from "@/types/console";
import type { ConfigProvider } from "@/types/provider";

// --- Storage key constants ---
export const STORAGE_KEY_SESSIONS = "claude-console-sessions";
export const STORAGE_KEY_ACTIVE = "claude-console-active";
export const STORAGE_KEY_LAST_CWD = "claude-console-last-cwd";
export const STORAGE_KEY_GROUPS = "velocity:console-groups";

// --- Persisted interfaces ---

export interface PersistedSession {
  id: string;
  label: string;
  cwd: string;
  status: "active" | "idle";
  kind?: "claude" | "shell";
  provider?: ConfigProvider;
  createdAt: number;
  claudeSessionId?: string;
  terminalId?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  env?: Record<string, string>;
  manuallyRenamed?: boolean;
  groupId?: string;
  agentName?: string;
}

export interface PersistedGroup {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number;
}

// --- Load functions ---

export function loadPersistedSessions(): Map<string, ConsoleSession> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSIONS);
    if (!raw) return new Map();
    const entries: PersistedSession[] = JSON.parse(raw);
    const map = new Map<string, ConsoleSession>();
    for (const entry of entries) {
      map.set(entry.id, {
        ...entry,
        kind: entry.kind ?? "claude",
        status: "idle", // restored sessions are idle (no active PTY)
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

export function loadPersistedGroups(): Map<string, SessionGroup> {
  if (typeof window === "undefined") return new Map();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GROUPS);
    if (!raw) return new Map();
    const entries: PersistedGroup[] = JSON.parse(raw);
    const map = new Map<string, SessionGroup>();
    for (const entry of entries) {
      map.set(entry.id, {
        id: entry.id,
        label: entry.label,
        createdAt: entry.createdAt,
        lastActivityAt: entry.lastActivityAt,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

export function loadActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(STORAGE_KEY_ACTIVE);
  } catch {
    return null;
  }
}

// --- Persist functions ---

export function persistSessions(
  sessions: Map<string, ConsoleSession>,
  activeId: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    const entries: PersistedSession[] = [...sessions.values()].map((s) => ({
      id: s.id,
      label: s.label,
      cwd: s.cwd,
      status: s.status,
      kind: s.kind,
      provider: s.provider,
      createdAt: s.createdAt,
      claudeSessionId: s.claudeSessionId,
      terminalId: s.terminalId,
      model: s.model,
      effort: s.effort,
      env: s.env,
      manuallyRenamed: s.manuallyRenamed,
      groupId: s.groupId,
      agentName: s.agentName,
    }));
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(entries));
    if (activeId) localStorage.setItem(STORAGE_KEY_ACTIVE, activeId);
    else localStorage.removeItem(STORAGE_KEY_ACTIVE);
  } catch {
    // localStorage may be full or unavailable
  }
}

export function persistGroups(groups: Map<string, SessionGroup>): void {
  if (typeof window === "undefined") return;
  try {
    const entries: PersistedGroup[] = [...groups.values()].map((g) => ({
      id: g.id,
      label: g.label,
      createdAt: g.createdAt,
      lastActivityAt: g.lastActivityAt,
    }));
    localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(entries));
  } catch {
    // localStorage may be full or unavailable
  }
}
