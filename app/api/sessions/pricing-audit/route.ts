import { jsonWithCache } from "@/lib/api/cache-headers";
import { ensureIndexed, getDb } from "@/lib/db";
import { auditSessionPricing } from "@/lib/cost/pricing-audit";

function normalizeLimit(raw: string | null): number {
  if (!raw) return 5000;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5000;
  return Math.min(parsed, 25_000);
}

export async function GET(request: Request) {
  await ensureIndexed();

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const provider = searchParams.get("provider");
  const effortMode = searchParams.get("effortMode");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const limit = normalizeLimit(searchParams.get("limit"));
  const db = getDb();
  const sessionColumns = (() => {
    try {
      const columns = db.prepare("PRAGMA table_info(sessions)").all() as Array<{
        name: string;
      }>;
      return new Set(columns.map((column) => column.name));
    } catch {
      return new Set<string>();
    }
  })();
  const hasEffortModeColumn = sessionColumns.has("effort_mode");
  const hasPricingStatusColumn = sessionColumns.has("pricing_status");
  const hasUnpricedTokensColumn = sessionColumns.has("unpriced_tokens");
  const hasUnpricedMessagesColumn = sessionColumns.has("unpriced_messages");

  const conditions: string[] = ["message_count > 0"];
  const params: (string | number)[] = [];

  if (projectId) {
    conditions.push("project_id = ?");
    params.push(projectId);
  }
  if (provider) {
    conditions.push("LOWER(COALESCE(provider, 'claude')) = ?");
    params.push(provider.trim().toLowerCase());
  }
  if (effortMode && hasEffortModeColumn) {
    const modes = effortMode
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (modes.length === 1) {
      conditions.push("LOWER(COALESCE(effort_mode, '')) = ?");
      params.push(modes[0]);
    } else if (modes.length > 1) {
      conditions.push(
        `LOWER(COALESCE(effort_mode, '')) IN (${modes.map(() => "?").join(",")})`,
      );
      params.push(...modes);
    }
  }
  if (dateFrom) {
    conditions.push("created_at >= ?");
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push("created_at <= ?");
    params.push(dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `
      SELECT
        id,
        provider,
        billing_plan,
        ${hasEffortModeColumn ? "effort_mode" : "NULL AS effort_mode"},
        total_cost,
        model_usage,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        ${hasPricingStatusColumn ? "pricing_status" : "NULL AS pricing_status"},
        ${hasUnpricedTokensColumn ? "unpriced_tokens" : "0 AS unpriced_tokens"},
        ${hasUnpricedMessagesColumn ? "unpriced_messages" : "0 AS unpriced_messages"}
      FROM sessions
      ${whereClause}
      ORDER BY modified_at DESC
      LIMIT ?
    `,
    )
    .all(...params, limit) as Array<{
    id: string;
    provider: string | null;
    billing_plan: string | null;
    effort_mode: string | null;
    total_cost: number;
    model_usage: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    pricing_status: string | null;
    unpriced_tokens: number;
    unpriced_messages: number;
  }>;

  const audit = auditSessionPricing(rows);

  return jsonWithCache(
    {
      ...audit,
      ...(effortMode && !hasEffortModeColumn
        ? {
            warning:
              "effort_mode is unavailable in the current database schema. Re-index/restart to populate effort filters.",
          }
        : {}),
      filters: {
        projectId,
        provider: provider ? provider.trim().toLowerCase() : undefined,
        effortMode,
        dateFrom,
        dateTo,
        limit,
      },
    },
    "stats",
  );
}
