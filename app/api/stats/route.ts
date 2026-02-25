import { getDb, ensureIndexed } from "@/lib/db";
import { jsonWithCache } from "@/lib/api/cache-headers";
import { buildProviderFilter } from "@/lib/api/provider-filter";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET(request: Request) {
  await ensureIndexed();
  const db = getDb();

  const { searchParams } = new URL(request.url);
  const pWhere = buildProviderFilter(searchParams, { conjunction: "WHERE" });
  const pAnd = buildProviderFilter(searchParams);

  const overall = db
    .prepare(
      `
    SELECT
      COUNT(*) as total_sessions,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(total_cost), 0) as total_cost
    FROM sessions
    ${pWhere.sql}
  `,
    )
    .get(...pWhere.params);

  const today = db
    .prepare(
      `
    SELECT
      date('now') as date,
      COALESCE(SUM(message_count), 0) as message_count,
      COUNT(*) as session_count,
      COALESCE(SUM(tool_call_count), 0) as tool_call_count,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(total_cost), 0) as total_cost
    FROM sessions
    WHERE DATE(created_at) = date('now')
      ${pAnd.sql}
  `,
    )
    .get(...pAnd.params);

  const recentSessions = db
    .prepare(
      `
    SELECT * FROM sessions ${pWhere.sql} ORDER BY modified_at DESC LIMIT 5
  `,
    )
    .all(...pWhere.params);

  const projectCount = db
    .prepare(
      `
    SELECT COUNT(*) as count FROM projects
  `,
    )
    .get() as { count: number };

  const lastIndexedRow = db
    .prepare("SELECT value FROM index_metadata WHERE key = 'last_indexed_at'")
    .get() as { value: string } | undefined;

  let dbSizeBytes = 0;
  try {
    const dbPath = path.join(os.homedir(), ".claude", "dashboard.db");
    dbSizeBytes = fs.statSync(dbPath).size;
  } catch {}

  return jsonWithCache(
    {
      overall,
      today,
      recentSessions,
      projectCount: projectCount.count,
      lastIndexedAt: lastIndexedRow?.value || null,
      dbSizeBytes,
    },
    "stats",
  );
}
