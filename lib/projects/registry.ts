import { createHash } from "crypto";
import path from "path";
import { getDb } from "@/lib/db";

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
}

function manualProjectId(projectPath: string): string {
  const digest = createHash("sha1").update(projectPath).digest("hex").slice(0, 16);
  return `manual:${digest}`;
}

/**
 * Ensure a project path exists in the projects table so project-scoped artifacts
 * remain discoverable even before session indexing has seen that project.
 */
export function ensureProjectRecord(
  projectPath: string,
  nameHint?: string,
): ProjectRecord {
  const normalizedPath = projectPath.trim();
  const db = getDb();

  const existing = db
    .prepare("SELECT id, name, path FROM projects WHERE path = ? LIMIT 1")
    .get(normalizedPath) as ProjectRecord | undefined;
  if (existing) return existing;

  const id = manualProjectId(normalizedPath);
  const name = (nameHint || path.basename(normalizedPath) || normalizedPath).trim();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR IGNORE INTO projects (
       id,
       path,
       name,
       session_count,
       total_tokens,
       total_cost,
       last_activity_at,
       created_at
     ) VALUES (?, ?, ?, 0, 0, 0, NULL, ?)`
  ).run(id, normalizedPath, name, now);

  const inserted = db
    .prepare("SELECT id, name, path FROM projects WHERE path = ? LIMIT 1")
    .get(normalizedPath) as ProjectRecord | undefined;

  return inserted ?? { id, name, path: normalizedPath };
}
