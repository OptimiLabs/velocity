import { jsonWithCache } from "@/lib/api/cache-headers";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildProviderFilter } from "@/lib/api/provider-filter";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);
  const projectId = searchParams.get("projectId");

  const db = getDb();
  const hasEffortModeColumn = (() => {
    try {
      const cols = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
        name: string;
      }>;
      return cols.some((col) => col.name === "effort_mode");
    } catch {
      return false;
    }
  })();
  const pAnd = buildProviderFilter(searchParams);
  const params: string[] = [from, toExclusive];
  if (projectId) params.push(projectId);
  params.push(...pAnd.params);
  const projectFilter = projectId ? "AND project_id = ?" : "";

  // Collect distinct model names from model_usage JSON.
  // Guard json_each with CASE to avoid runtime errors on malformed JSON blobs.
  const modelRows = db
    .prepare(
      `
    SELECT DISTINCT je.key
    FROM sessions, json_each(
      CASE
        WHEN json_valid(sessions.model_usage) THEN sessions.model_usage
        ELSE '{}'
      END
    ) je
    WHERE created_at >= ? AND created_at < ?
      ${projectFilter}
      ${pAnd.sql}
      AND model_usage IS NOT NULL AND model_usage != '{}'
      AND je.key NOT LIKE '<%'
  `,
    )
    .all(...params) as { key: string }[];

  // Collect distinct agent types — reset params for second query
  const agentParams: string[] = [from, toExclusive];
  if (projectId) agentParams.push(projectId);
  agentParams.push(...pAnd.params);

  const agentRows = db
    .prepare(
      `
    SELECT DISTINCT subagent_type FROM sessions
    WHERE subagent_type IS NOT NULL
      AND created_at >= ? AND created_at < ?
      ${projectFilter}
      ${pAnd.sql}
    LIMIT 200
  `,
    )
    .all(...agentParams) as { subagent_type: string }[];

  // Collect distinct providers
  const providerRows = db
    .prepare(
      `
    SELECT DISTINCT COALESCE(provider, 'claude') as provider FROM sessions
    WHERE created_at >= ? AND created_at < ?
      ${projectFilter}
  `,
    )
    .all(from, toExclusive, ...(projectId ? [projectId] : [])) as { provider: string }[];

  // Collect distinct effort modes (xhigh/high/medium/etc) for session filtering
  const effortParams: string[] = [from, toExclusive];
  if (projectId) effortParams.push(projectId);
  effortParams.push(...pAnd.params);
  const effortRows = hasEffortModeColumn
    ? (db
        .prepare(
          `
    SELECT DISTINCT LOWER(TRIM(effort_mode)) as effort_mode
    FROM sessions
    WHERE created_at >= ? AND created_at < ?
      ${projectFilter}
      ${pAnd.sql}
      AND effort_mode IS NOT NULL
      AND TRIM(effort_mode) != ''
    ORDER BY effort_mode ASC
  `,
        )
        .all(...effortParams) as { effort_mode: string }[])
    : [];

  const models = modelRows.map((r) => r.key).sort();
  const agentTypes = agentRows.map((r) => r.subagent_type).sort();
  const providers = providerRows.map((r) => r.provider).sort();
  const effortModes = effortRows.map((r) => r.effort_mode);

  return jsonWithCache({ models, agentTypes, providers, effortModes }, "stats");
}
