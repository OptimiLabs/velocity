import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo =
    searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams);

  const db = getDb();

  // 1. Totals by provider
  const byProvider = db
    .prepare(
      `
    SELECT
      COALESCE(provider, 'claude') as provider,
      COUNT(*) as sessionCount,
      SUM(message_count) as messageCount,
      SUM(total_cost) as totalCost,
      SUM(input_tokens) as inputTokens,
      SUM(output_tokens) as outputTokens,
      SUM(cache_read_tokens) as cacheReadTokens,
      SUM(cache_write_tokens) as cacheWriteTokens
    FROM sessions
    WHERE created_at >= ? AND created_at < ?
      AND message_count > 0
      ${filterSql}
    GROUP BY COALESCE(provider, 'claude')
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    provider: string;
    sessionCount: number;
    messageCount: number;
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }[];

  // 2. Daily by provider (for stacked chart) — dynamic pivot
  const dailyRaw = db
    .prepare(
      `
    SELECT DATE(created_at) as date,
      COALESCE(provider, 'claude') as provider,
      SUM(total_cost) as totalCost,
      COUNT(*) as sessionCount
    FROM sessions
    WHERE created_at >= ? AND created_at < ?
      AND message_count > 0
      ${filterSql}
    GROUP BY DATE(created_at), COALESCE(provider, 'claude')
    ORDER BY date ASC
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    date: string;
    provider: string;
    totalCost: number;
    sessionCount: number;
  }[];

  // Pivot: generate dynamic keys from query results (e.g. claude_cost, codex_cost)
  const dailyMap = new Map<string, Record<string, string | number>>();

  for (const row of dailyRaw) {
    let entry = dailyMap.get(row.date);
    if (!entry) {
      entry = { date: row.date };
      dailyMap.set(row.date, entry);
    }
    entry[`${row.provider}_cost`] =
      ((entry[`${row.provider}_cost`] as number) || 0) + row.totalCost;
    entry[`${row.provider}_sessions`] =
      ((entry[`${row.provider}_sessions`] as number) || 0) + row.sessionCount;
  }

  // Backfill missing provider keys with 0 for consistent chart data
  const providerKeys = new Set<string>();
  for (const row of dailyRaw) providerKeys.add(row.provider);
  for (const entry of dailyMap.values()) {
    for (const p of providerKeys) {
      entry[`${p}_cost`] ??= 0;
      entry[`${p}_sessions`] ??= 0;
    }
  }

  const daily = Array.from(dailyMap.values());

  return NextResponse.json({ byProvider, daily });
}
