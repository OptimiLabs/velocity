import { getDb } from "./index";

export interface ArchivedTerminal {
  terminalId: string;
  label: string;
  cwd: string;
  envOverrides?: Record<string, string>;
}

export interface PersistedConsoleSession {
  id: string;
  claudeSessionId: string | null;
  cwd: string;
  label: string;
  firstPrompt: string | null;
  createdAt: number;
  manuallyRenamed: boolean;
  archivedAt: number | null;
  lastActivityAt: number | null;
  archivedTerminals: ArchivedTerminal[] | null;
  groupId: string | null;
  agentName: string | null;
}

interface RawRow {
  id: string;
  claude_session_id: string | null;
  cwd: string;
  label: string;
  first_prompt: string | null;
  created_at: number;
  manually_renamed: number;
  archived_at: number | null;
  last_activity_at: number | null;
  archived_terminals: string | null;
  group_id: string | null;
  agent_name: string | null;
}

function mapRow(r: RawRow): PersistedConsoleSession {
  let archivedTerminals: ArchivedTerminal[] | null = null;
  if (r.archived_terminals) {
    try {
      archivedTerminals = JSON.parse(r.archived_terminals);
    } catch {
      archivedTerminals = null;
    }
  }
  return {
    id: r.id,
    claudeSessionId: r.claude_session_id,
    cwd: r.cwd,
    label: r.label,
    firstPrompt: r.first_prompt,
    createdAt: r.created_at,
    manuallyRenamed: !!r.manually_renamed,
    archivedAt: r.archived_at,
    lastActivityAt: r.last_activity_at,
    archivedTerminals,
    groupId: r.group_id,
    agentName: r.agent_name,
  };
}

/** Insert a new console session (called at creation time, before Claude responds). */
export function saveConsoleSession(
  id: string,
  cwd: string,
  label: string,
  createdAt: number,
  firstPrompt?: string,
  agentName?: string,
): void {
  const db = getDb();
  db.prepare(
    `
    INSERT OR REPLACE INTO console_sessions (id, cwd, label, first_prompt, created_at, last_activity_at, agent_name)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(id, cwd, label, firstPrompt ?? null, createdAt, createdAt, agentName ?? null);
}

/** Set the claude_session_id once captured from Claude's first response. */
export function updateConsoleSessionClaudeId(
  id: string,
  claudeSessionId: string,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE console_sessions SET claude_session_id = ? WHERE id = ?",
  ).run(claudeSessionId, id);
}

/** Update label (and optionally firstPrompt) on rename or auto-label. */
export function updateConsoleSessionLabel(
  id: string,
  label: string,
  firstPrompt?: string,
): void {
  const db = getDb();
  if (firstPrompt !== undefined) {
    db.prepare(
      "UPDATE console_sessions SET label = ?, first_prompt = ? WHERE id = ?",
    ).run(label, firstPrompt, id);
  } else {
    db.prepare("UPDATE console_sessions SET label = ? WHERE id = ?").run(
      label,
      id,
    );
  }
}

export function getConsoleSessionClaudeId(id: string): string | null {
  const db = getDb();
  const row = db
    .prepare("SELECT claude_session_id FROM console_sessions WHERE id = ?")
    .get(id) as { claude_session_id: string } | undefined;
  return row?.claude_session_id ?? null;
}

/** Return active (non-archived) console sessions. */
export function listConsoleSessions(): PersistedConsoleSession[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, claude_session_id, cwd, label, first_prompt, created_at,
              manually_renamed, archived_at, last_activity_at, archived_terminals,
              group_id, agent_name
       FROM console_sessions
       WHERE archived_at IS NULL
       ORDER BY created_at DESC`,
    )
    .all() as RawRow[];
  return rows.map(mapRow);
}

/** Return archived console sessions. */
export function listArchivedConsoleSessions(): PersistedConsoleSession[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, claude_session_id, cwd, label, first_prompt, created_at,
              manually_renamed, archived_at, last_activity_at, archived_terminals, group_id, agent_name
       FROM console_sessions
       WHERE archived_at IS NOT NULL
       ORDER BY archived_at DESC`,
    )
    .all() as RawRow[];
  return rows.map(mapRow);
}

/** Return all console sessions (active + archived). */
export function listAllConsoleSessions(): PersistedConsoleSession[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, claude_session_id, cwd, label, first_prompt, created_at,
              manually_renamed, archived_at, last_activity_at, archived_terminals, group_id, agent_name
       FROM console_sessions
       ORDER BY created_at DESC`,
    )
    .all() as RawRow[];
  return rows.map(mapRow);
}

/** Get a single console session by ID. */
export function getConsoleSession(id: string): PersistedConsoleSession | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, claude_session_id, cwd, label, first_prompt, created_at,
              manually_renamed, archived_at, last_activity_at, archived_terminals, group_id, agent_name
       FROM console_sessions WHERE id = ?`,
    )
    .get(id) as RawRow | undefined;
  return row ? mapRow(row) : null;
}

/** Archive a session — sets archived_at and stores terminal metadata. */
export function archiveConsoleSession(
  id: string,
  terminals: ArchivedTerminal[],
): void {
  const db = getDb();
  db.prepare(
    `UPDATE console_sessions
     SET archived_at = ?, archived_terminals = ?
     WHERE id = ?`,
  ).run(Date.now(), JSON.stringify(terminals), id);
}

/** Restore an archived session — clears archived_at, returns the session. */
export function restoreConsoleSession(
  id: string,
): PersistedConsoleSession | null {
  const db = getDb();
  db.prepare(
    `UPDATE console_sessions
     SET archived_at = NULL
     WHERE id = ?`,
  ).run(id);
  return getConsoleSession(id);
}

/** Update last_activity_at timestamp. */
export function updateConsoleSessionActivity(
  id: string,
  timestamp: number,
): void {
  const db = getDb();
  db.prepare(
    "UPDATE console_sessions SET last_activity_at = ? WHERE id = ?",
  ).run(timestamp, id);
}

/** Get sessions eligible for auto-archive (active + idle past threshold). */
export function getAutoArchiveCandidates(
  thresholdMs: number,
): PersistedConsoleSession[] {
  const db = getDb();
  const cutoff = Date.now() - thresholdMs;
  const rows = db
    .prepare(
      `SELECT id, claude_session_id, cwd, label, first_prompt, created_at,
              manually_renamed, archived_at, last_activity_at, archived_terminals, group_id, agent_name
       FROM console_sessions
       WHERE archived_at IS NULL
         AND (last_activity_at < ? OR (last_activity_at IS NULL AND created_at < ?))`,
    )
    .all(cutoff, cutoff) as RawRow[];
  return rows.map(mapRow);
}

/** Mark a session as manually renamed (freezes auto-naming). */
export function markConsoleSessionManuallyRenamed(id: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE console_sessions SET manually_renamed = 1 WHERE id = ?",
  ).run(id);
}

export function deleteConsoleSession(id: string): void {
  const db = getDb();
  db.prepare("DELETE FROM console_sessions WHERE id = ?").run(id);
}

// --- Console Groups ---

export interface PersistedConsoleGroup {
  id: string;
  label: string;
  createdAt: number;
  lastActivityAt: number | null;
}

export function saveConsoleGroup(
  id: string,
  label: string,
  createdAt: number,
): void {
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO console_groups (id, label, created_at) VALUES (?, ?, ?)",
  ).run(id, label, createdAt);
}

export function listConsoleGroups(): PersistedConsoleGroup[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, label, created_at, last_activity_at FROM console_groups ORDER BY created_at DESC",
    )
    .all() as {
    id: string;
    label: string;
    created_at: number;
    last_activity_at: number | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    lastActivityAt: r.last_activity_at,
  }));
}

export function renameConsoleGroup(id: string, label: string): void {
  const db = getDb();
  db.prepare("UPDATE console_groups SET label = ? WHERE id = ?").run(label, id);
}

export function deleteConsoleGroup(id: string): void {
  const db = getDb();
  db.prepare("UPDATE console_sessions SET group_id = NULL WHERE group_id = ?").run(id);
  db.prepare("DELETE FROM console_groups WHERE id = ?").run(id);
}

export function updateConsoleSessionGroupId(
  sessionId: string,
  groupId: string | null,
): void {
  const db = getDb();
  db.prepare("UPDATE console_sessions SET group_id = ? WHERE id = ?").run(
    groupId,
    sessionId,
  );
}
