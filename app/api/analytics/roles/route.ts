import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams);

  const db = getDb();

  // 1. Totals by role (treat any non-subagent as standalone)
  const byRole = db
    .prepare(
      `
    SELECT
      CASE WHEN session_role = 'subagent' THEN 'subagent' ELSE 'standalone' END as role,
      COUNT(*) as sessionCount,
      SUM(message_count) as messageCount, SUM(total_cost) as totalCost,
      SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens,
      SUM(cache_read_tokens) as cacheReadTokens
    FROM sessions
    WHERE created_at >= ? AND created_at < ?
    ${filterSql}
    GROUP BY CASE WHEN session_role = 'subagent' THEN 'subagent' ELSE 'standalone' END
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    role: string;
    sessionCount: number;
    messageCount: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  }[];

  // 2. Daily by role (for stacked chart)
  const dailyRaw = db
    .prepare(
      `
    SELECT DATE(created_at) as date,
      CASE WHEN session_role = 'subagent' THEN 'subagent' ELSE 'standalone' END as role,
      SUM(total_cost) as totalCost, COUNT(*) as sessionCount
    FROM sessions
    WHERE created_at >= ? AND created_at < ?
    ${filterSql}
    GROUP BY DATE(created_at), CASE WHEN session_role = 'subagent' THEN 'subagent' ELSE 'standalone' END
    ORDER BY date ASC
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    date: string;
    role: string;
    totalCost: number;
    sessionCount: number;
  }[];

  const dailyMap = new Map<
    string,
    {
      date: string;
      subagent_cost: number;
      standalone_cost: number;
      subagent_sessions: number;
      standalone_sessions: number;
    }
  >();

  for (const row of dailyRaw) {
    let entry = dailyMap.get(row.date);
    if (!entry) {
      entry = {
        date: row.date,
        subagent_cost: 0,
        standalone_cost: 0,
        subagent_sessions: 0,
        standalone_sessions: 0,
      };
      dailyMap.set(row.date, entry);
    }
    if (row.role === "subagent") {
      entry.subagent_cost += row.totalCost;
      entry.subagent_sessions += row.sessionCount;
    } else {
      entry.standalone_cost += row.totalCost;
      entry.standalone_sessions += row.sessionCount;
    }
  }

  const daily = Array.from(dailyMap.values());

  // 3. By subagent type
  const byAgentType = db
    .prepare(
      `
    SELECT COALESCE(subagent_type, 'unknown') as type, COUNT(*) as sessionCount,
      SUM(total_cost) as totalCost,
      SUM(input_tokens) as inputTokens,
      SUM(output_tokens) as outputTokens,
      SUM(cache_read_tokens) as cacheReadTokens,
      SUM(cache_write_tokens) as cacheWriteTokens
    FROM sessions
    WHERE session_role = 'subagent'
      AND created_at >= ? AND created_at < ?
    ${filterSql}
    GROUP BY COALESCE(subagent_type, 'unknown')
    ORDER BY totalCost DESC
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    type: string;
    sessionCount: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }[];

  return NextResponse.json({ byRole, daily, byAgentType });
}
