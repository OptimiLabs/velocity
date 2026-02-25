import { getDb, ensureIndexed } from "@/lib/db";
import { subDays, format, differenceInCalendarDays } from "date-fns";
import { jsonWithCache } from "@/lib/api/cache-headers";
import {
  buildAnalyticsFilters,
  hasActiveFilters,
} from "@/lib/api/analytics-filters";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

function getInclusiveDaySpan(from: string, to: string): number {
  return Math.max(
    differenceInCalendarDays(
      new Date(`${to}T00:00:00`),
      new Date(`${from}T00:00:00`),
    ) + 1,
    1,
  );
}

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const granularity = searchParams.get("granularity") || "day";

  // Use day-based text bounds so SQLite can use the created_at index directly.
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams);
  const filtered = hasActiveFilters(searchParams);

  const db = getDb();

  let daily, totals, previousTotals;

  if (granularity === "hour") {
    const hourlyQuery = `
      SELECT
        strftime('%Y-%m-%d %H:00', created_at) as date,
        COUNT(*) as session_count,
        COALESCE(SUM(message_count), 0) as message_count,
        COALESCE(SUM(tool_call_count), 0) as tool_call_count,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
        COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
        ${filterSql}
      GROUP BY strftime('%Y-%m-%d %H:00', created_at)
      ORDER BY date ASC
    `;
    daily = db.prepare(hourlyQuery).all(from, toExclusive, ...filterParams);
  }

  if (filtered) {
    if (granularity !== "hour") {
      daily = db
        .prepare(
          `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as session_count,
          COALESCE(SUM(message_count), 0) as message_count,
          COALESCE(SUM(tool_call_count), 0) as tool_call_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
          COALESCE(SUM(total_cost), 0) as total_cost,
          COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
          COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms
        FROM sessions
        WHERE created_at >= ? AND created_at < ?
          ${filterSql}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
        )
        .all(from, toExclusive, ...filterParams);
    }

    totals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as total_cache_write_tokens,
        COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
        COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms,
        COALESCE(AVG(session_duration_ms), 0) as avg_session_duration_ms
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
        ${filterSql}
    `,
      )
      .get(from, toExclusive, ...filterParams);

    const dayRange = getInclusiveDaySpan(from, to);
    const primaryStart = new Date(`${from}T00:00:00`);
    const prevFrom = format(subDays(primaryStart, dayRange), "yyyy-MM-dd");
    const prevTo = format(subDays(primaryStart, 1), "yyyy-MM-dd");
    const prevToExclusive = nextUtcDay(prevTo);

    previousTotals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as total_cache_write_tokens,
        COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
        COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms,
        COALESCE(AVG(session_duration_ms), 0) as avg_session_duration_ms
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
        ${filterSql}
    `,
      )
      .get(prevFrom, prevToExclusive, ...filterParams);
  } else {
    // Global view — query sessions directly for live-accurate data
    if (granularity !== "hour") {
      daily = db
        .prepare(
          `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as session_count,
          COALESCE(SUM(message_count), 0) as message_count,
          COALESCE(SUM(tool_call_count), 0) as tool_call_count,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
          COALESCE(SUM(total_cost), 0) as total_cost,
          COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
          COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms
        FROM sessions
        WHERE created_at >= ? AND created_at < ?
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,
        )
        .all(from, toExclusive);
    }

    totals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as total_cache_write_tokens,
        COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
        COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms,
        COALESCE(AVG(session_duration_ms), 0) as avg_session_duration_ms
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
`,
      )
      .get(from, toExclusive);

    const dayRange = getInclusiveDaySpan(from, to);
    const primaryStart = new Date(`${from}T00:00:00`);
    const prevFrom = format(subDays(primaryStart, dayRange), "yyyy-MM-dd");
    const prevTo = format(subDays(primaryStart, 1), "yyyy-MM-dd");
    const prevToExclusive = nextUtcDay(prevTo);

    previousTotals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as total_cache_write_tokens,
        COALESCE(AVG(avg_latency_ms), 0) as avg_latency_ms,
        COALESCE(AVG(p95_latency_ms), 0) as avg_p95_latency_ms,
        COALESCE(AVG(session_duration_ms), 0) as avg_session_duration_ms
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
`,
      )
      .get(prevFrom, prevToExclusive);
  }

  // Weekly aggregation
  let weeklyAgg;
  if (filtered) {
    weeklyAgg = db
      .prepare(
        `
      SELECT
        strftime('%Y-W%W', created_at) as week,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
        ${filterSql}
      GROUP BY week
      ORDER BY week ASC
    `,
      )
      .all(from, toExclusive, ...filterParams);
  } else {
    weeklyAgg = db
      .prepare(
        `
      SELECT
        strftime('%Y-W%W', created_at) as week,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions
      FROM sessions
      WHERE created_at >= ? AND created_at < ?
      GROUP BY week
      ORDER BY week ASC
    `,
      )
      .all(from, toExclusive);
  }

  // Cost distribution
  const costParams = [from, toExclusive, ...filterParams];

  let costDistribution = null;

  const costAgg = db
    .prepare(
      `
    SELECT COUNT(*) as cnt, MIN(total_cost) as min_cost, MAX(total_cost) as max_cost, AVG(total_cost) as avg_cost
    FROM sessions WHERE created_at >= ? AND created_at < ? AND total_cost > 0 ${filterSql}
  `,
    )
    .get(...costParams) as
    | { cnt: number; min_cost: number; max_cost: number; avg_cost: number }
    | undefined;

  if (costAgg && costAgg.cnt > 0) {
    const percentileRows = db
      .prepare(
        `
        SELECT total_cost, rn, cnt FROM (
          SELECT total_cost,
            ROW_NUMBER() OVER (ORDER BY total_cost) as rn,
            COUNT(*) OVER () as cnt
        FROM sessions WHERE created_at >= ? AND created_at < ? AND total_cost > 0 ${filterSql}
      ) sub
      WHERE rn IN (
        MAX(1, CAST(cnt * 0.5 AS INT)), MAX(1, CAST(cnt * 0.75 AS INT)),
        MAX(1, CAST(cnt * 0.9 AS INT)), MAX(1, CAST(cnt * 0.99 AS INT)), cnt
      )
    `,
      )
      .all(...costParams) as { total_cost: number; rn: number; cnt: number }[];

    const pMap = new Map<number, number>();
    for (const r of percentileRows) {
      pMap.set(r.rn, r.total_cost);
    }
    // Use cnt from the percentile query's window function to stay consistent
    // with the row numbers SQL computed (avoids race if rows change between queries)
    const cnt = percentileRows.length > 0 ? percentileRows[0].cnt : costAgg.cnt;
    const p50 = pMap.get(Math.max(1, Math.floor(cnt * 0.5))) ?? 0;
    const p75 = pMap.get(Math.max(1, Math.floor(cnt * 0.75))) ?? 0;
    const p90 = pMap.get(Math.max(1, Math.floor(cnt * 0.9))) ?? 0;
    const p99 = pMap.get(Math.max(1, Math.floor(cnt * 0.99))) ?? 0;

    const rawHistogram = db
      .prepare(
        `
      SELECT
        CASE
          WHEN total_cost <= 1 THEN '$0-1'
          WHEN total_cost <= 5 THEN '$1-5'
          WHEN total_cost <= 10 THEN '$5-10'
          WHEN total_cost <= 25 THEN '$10-25'
          WHEN total_cost <= 50 THEN '$25-50'
          ELSE '$50+'
        END as bucket,
        COUNT(*) as count
      FROM sessions
      WHERE created_at >= ? AND created_at < ? AND total_cost > 0 AND message_count > 0 ${filterSql}
      GROUP BY bucket
    `,
      )
      .all(...costParams) as { bucket: string; count: number }[];

    const BUCKET_ORDER = ["$0-1", "$1-5", "$5-10", "$10-25", "$25-50", "$50+"];
    const bucketMap = new Map(rawHistogram.map((b) => [b.bucket, b.count]));
    const histogram = BUCKET_ORDER.map((bucket) => ({
      bucket,
      count: bucketMap.get(bucket) ?? 0,
    }));

    costDistribution = {
      p50,
      p75,
      p90,
      p99,
      max: costAgg.max_cost,
      histogram,
    };
  }

  return jsonWithCache(
    { daily, totals, previousTotals, weekly: weeklyAgg, costDistribution },
    "list",
  );
}
