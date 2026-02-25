import { getDb } from "./index";
import type {
  AnalysisConversation,
  ComparisonMessage,
  ScopeOptions,
} from "@/types/session";

function generateId(): string {
  return `ac_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToConversation(row: Record<string, unknown>): AnalysisConversation {
  return {
    id: row.id as string,
    title: row.title as string,
    sessionIds: (() => { try { return JSON.parse((row.session_ids as string) || "[]"); } catch { return []; } })(),
    enabledSessionIds: (() => { try { return JSON.parse((row.enabled_session_ids as string) || "[]"); } catch { return []; } })(),
    scope: (() => { try { return JSON.parse((row.scope as string) || "{}"); } catch { return {}; } })(),
    model: row.model as string,
    messages: (() => { try { return JSON.parse((row.messages as string) || "[]"); } catch { return []; } })(),
    totalCost: (row.total_cost as number) || 0,
    totalTokens: (row.total_tokens as number) || 0,
    messageCount: (row.message_count as number) || 0,
    status: (row.status as "active" | "archived") || "active",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listAnalysisConversations(opts?: {
  status?: "active" | "archived";
  limit?: number;
  offset?: number;
}): { conversations: AnalysisConversation[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (
    db
      .prepare(`SELECT COUNT(*) as count FROM analysis_conversations ${where}`)
      .get(...params) as { count: number }
  ).count;

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  const rows = db
    .prepare(
      `SELECT * FROM analysis_conversations ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as Record<string, unknown>[];

  return { conversations: rows.map(rowToConversation), total };
}

export function getAnalysisConversation(
  id: string,
): AnalysisConversation | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM analysis_conversations WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToConversation(row) : null;
}

export function createAnalysisConversation(data: {
  title: string;
  sessionIds: string[];
  enabledSessionIds: string[];
  scope?: ScopeOptions;
  model?: string;
  messages?: ComparisonMessage[];
}): AnalysisConversation {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  const messages = data.messages ?? [];

  db.prepare(
    `INSERT INTO analysis_conversations
      (id, title, session_ids, enabled_session_ids, scope, model, messages,
       total_cost, total_tokens, message_count, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  ).run(
    id,
    data.title,
    JSON.stringify(data.sessionIds),
    JSON.stringify(data.enabledSessionIds),
    JSON.stringify(data.scope ?? {}),
    data.model ?? "claude-cli",
    JSON.stringify(messages),
    messages.reduce((sum, m) => sum + (m.cost || 0), 0),
    messages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0),
    messages.length,
    now,
    now,
  );

  return getAnalysisConversation(id)!;
}

export function updateAnalysisConversation(
  id: string,
  data: {
    title?: string;
    enabledSessionIds?: string[];
    scope?: ScopeOptions;
    model?: string;
    messages?: ComparisonMessage[];
    status?: "active" | "archived";
  },
): AnalysisConversation | null {
  const db = getDb();
  const existing = getAnalysisConversation(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (data.title !== undefined) {
    sets.push("title = ?");
    params.push(data.title);
  }
  if (data.enabledSessionIds !== undefined) {
    sets.push("enabled_session_ids = ?");
    params.push(JSON.stringify(data.enabledSessionIds));
  }
  if (data.scope !== undefined) {
    sets.push("scope = ?");
    params.push(JSON.stringify(data.scope));
  }
  if (data.model !== undefined) {
    sets.push("model = ?");
    params.push(data.model);
  }
  if (data.messages !== undefined) {
    sets.push("messages = ?");
    params.push(JSON.stringify(data.messages));
    sets.push("total_cost = ?");
    params.push(data.messages.reduce((sum, m) => sum + (m.cost || 0), 0));
    sets.push("total_tokens = ?");
    params.push(data.messages.reduce((sum, m) => sum + (m.tokensUsed || 0), 0));
    sets.push("message_count = ?");
    params.push(data.messages.length);
  }
  if (data.status !== undefined) {
    sets.push("status = ?");
    params.push(data.status);
  }

  params.push(id);
  db.prepare(
    `UPDATE analysis_conversations SET ${sets.join(", ")} WHERE id = ?`,
  ).run(...params);

  return getAnalysisConversation(id);
}

export function deleteAnalysisConversation(id: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM analysis_conversations WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
