import { getDb } from "./index";
import type { PromptSnippet } from "@/types/library";

function generateId(): string {
  return `ps_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Prompt Snippets ---

export function listPromptSnippets(category?: string): PromptSnippet[] {
  const db = getDb();
  const sql = category
    ? "SELECT * FROM prompt_snippets WHERE category = ? ORDER BY updated_at DESC"
    : "SELECT * FROM prompt_snippets ORDER BY updated_at DESC";
  const rows = category ? db.prepare(sql).all(category) : db.prepare(sql).all();
  return (rows as Record<string, unknown>[]).map(rowToSnippet);
}

export function getPromptSnippet(id: string): PromptSnippet | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM prompt_snippets WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToSnippet(row) : null;
}

export function createPromptSnippet(data: {
  name: string;
  content: string;
  category: PromptSnippet["category"];
  tags?: string[];
}): PromptSnippet {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO prompt_snippets (id, name, content, category, tags, usage_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?)
  `,
  ).run(
    id,
    data.name,
    data.content,
    data.category,
    JSON.stringify(data.tags || []),
    now,
    now,
  );
  return getPromptSnippet(id)!;
}

export function updatePromptSnippet(
  id: string,
  data: {
    name?: string;
    content?: string;
    category?: PromptSnippet["category"];
    tags?: string[];
  },
): PromptSnippet | null {
  const db = getDb();
  const existing = getPromptSnippet(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE prompt_snippets
    SET name = ?, content = ?, category = ?, tags = ?, updated_at = ?
    WHERE id = ?
  `,
  ).run(
    data.name ?? existing.name,
    data.content ?? existing.content,
    data.category ?? existing.category,
    JSON.stringify(data.tags ?? existing.tags),
    now,
    id,
  );
  return getPromptSnippet(id);
}

export function deletePromptSnippet(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM prompt_snippets WHERE id = ?").run(id);
  return result.changes > 0;
}

export function incrementPromptUsage(id: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE prompt_snippets SET usage_count = usage_count + 1 WHERE id = ?",
  ).run(id);
}

// --- Row mappers ---

function rowToSnippet(row: Record<string, unknown>): PromptSnippet {
  return {
    id: row.id as string,
    name: row.name as string,
    content: row.content as string,
    category: row.category as PromptSnippet["category"],
    tags: (() => { try { return JSON.parse((row.tags as string) || "[]"); } catch { return []; } })(),
    usageCount: row.usage_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
