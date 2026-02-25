import { getDb } from "@/lib/db";
import { jsonWithCache } from "@/lib/api/cache-headers";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);

  const { sql: filterSql, params: filterParams } = buildAnalyticsFilters(
    searchParams,
    "s",
  );

  const db = getDb();

  const projects = db
    .prepare(
      `
    SELECT
      p.name,
      COALESCE(SUM(s.total_cost), 0) as total_cost,
      COUNT(s.id) as session_count,
      COALESCE(SUM(s.input_tokens + s.output_tokens), 0) as total_tokens
    FROM projects p
    LEFT JOIN sessions s ON s.project_id = p.id
      AND s.created_at >= ? AND s.created_at < ?
    WHERE 1=1 ${filterSql}
    GROUP BY p.id, p.name
    HAVING COALESCE(SUM(s.total_cost), 0) > 0
    ORDER BY COALESCE(SUM(s.total_cost), 0) DESC
    LIMIT 10
  `,
    )
    .all(from, toExclusive, ...filterParams);

  return jsonWithCache({ projects }, "list");
}
