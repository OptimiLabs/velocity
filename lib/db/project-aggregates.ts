import { getDb } from "@/lib/db";

export interface RefreshProjectAggregatesOptions {
  /**
   * When true, only active (non-compressed) sessions contribute to
   * denormalized project metrics.
   */
  activeOnly?: boolean;
}

export interface RefreshProjectAggregatesResult {
  projectCount: number;
  updatedRows: number;
  activeOnly: boolean;
}

/**
 * Recompute denormalized project metrics from sessions.
 * This is a lightweight "reindex" for project-level summary fields.
 */
export function refreshProjectAggregates(
  options: RefreshProjectAggregatesOptions = {},
): RefreshProjectAggregatesResult {
  const db = getDb();
  const activeOnly = options.activeOnly !== false;
  const compressionClause = activeOnly ? "AND s.compressed_at IS NULL" : "";

  const projectCountRow = db
    .prepare("SELECT COUNT(*) as count FROM projects")
    .get() as { count: number } | undefined;
  const projectCount = projectCountRow?.count ?? 0;

  const updatedRows = db
    .prepare(
      `
      UPDATE projects
      SET
        session_count = COALESCE((
          SELECT COUNT(*)
          FROM sessions s
          WHERE s.project_id = projects.id
            AND s.message_count > 0
            ${compressionClause}
        ), 0),
        total_tokens = COALESCE((
          SELECT SUM(
            s.input_tokens +
            s.output_tokens +
            s.cache_read_tokens +
            s.cache_write_tokens
          )
          FROM sessions s
          WHERE s.project_id = projects.id
            AND s.message_count > 0
            ${compressionClause}
        ), 0),
        total_cost = COALESCE((
          SELECT SUM(s.total_cost)
          FROM sessions s
          WHERE s.project_id = projects.id
            AND s.message_count > 0
            ${compressionClause}
        ), 0),
        last_activity_at = (
          SELECT MAX(s.modified_at)
          FROM sessions s
          WHERE s.project_id = projects.id
            AND s.message_count > 0
            ${compressionClause}
        )
    `,
    )
    .run().changes;

  return {
    projectCount,
    updatedRows,
    activeOnly,
  };
}
