import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cost: number;
  messageCount: number;
  sessionCount: number;
  unpricedTokens: number;
}

export async function GET(request: Request) {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);
  const includeRoleBreakdown =
    searchParams.get("includeRoleBreakdown") === "true";
  const role = searchParams.get("role");

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams);

  const db = getDb();

  const rows = db
    .prepare(
      `
    SELECT model_usage, message_count, session_role FROM sessions
    WHERE created_at >= ? AND created_at < ?
    ${filterSql}
    AND model_usage != '{}'
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    model_usage: string;
    message_count: number;
    session_role: string | null;
  }[];

  const models: Record<string, ModelStats> = {};
  const byRole: Record<string, Record<string, ModelStats>> = {
    standalone: {},
    subagent: {},
  };

  for (const row of rows) {
    try {
      const usage = JSON.parse(row.model_usage) as Record<
        string,
        {
          inputTokens?: number;
          outputTokens?: number;
          reasoningTokens?: number;
          reasoning_output_tokens?: number;
          cacheReadTokens?: number;
          cacheWriteTokens?: number;
          cost?: number;
          costUSD?: number;
          messageCount?: number;
          unpricedTokens?: number;
          unpriced_tokens?: number;
        }
      >;
      const modelCount = Object.keys(usage).length;
      const fallbackMessagesPerModel =
        modelCount > 0 ? Math.round(row.message_count / modelCount) : 0;
      const effectiveRole =
        row.session_role === "subagent" ? "subagent" : "standalone";

      for (const [model, stats] of Object.entries(usage)) {
        if (!stats || typeof stats !== "object") continue;
        if (!models[model]) {
          models[model] = {
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            cost: 0,
            messageCount: 0,
            sessionCount: 0,
            unpricedTokens: 0,
          };
        }
        models[model].inputTokens += stats.inputTokens || 0;
        models[model].outputTokens += stats.outputTokens || 0;
        models[model].reasoningTokens +=
          stats.reasoningTokens || stats.reasoning_output_tokens || 0;
        models[model].cacheReadTokens += stats.cacheReadTokens || 0;
        models[model].cacheWriteTokens += stats.cacheWriteTokens || 0;
        models[model].cost += stats.costUSD || stats.cost || 0;
        models[model].messageCount +=
          typeof stats.messageCount === "number"
            ? stats.messageCount
            : fallbackMessagesPerModel;
        models[model].sessionCount++;
        models[model].unpricedTokens +=
          stats.unpricedTokens || stats.unpriced_tokens || 0;

        if (includeRoleBreakdown && !role) {
          const roleMap = byRole[effectiveRole];
          if (!roleMap[model]) {
            roleMap[model] = {
              inputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              cost: 0,
              messageCount: 0,
              sessionCount: 0,
              unpricedTokens: 0,
            };
          }
          roleMap[model].inputTokens += stats.inputTokens || 0;
          roleMap[model].outputTokens += stats.outputTokens || 0;
          roleMap[model].reasoningTokens +=
            stats.reasoningTokens || stats.reasoning_output_tokens || 0;
          roleMap[model].cacheReadTokens += stats.cacheReadTokens || 0;
          roleMap[model].cacheWriteTokens += stats.cacheWriteTokens || 0;
          roleMap[model].cost += stats.costUSD || stats.cost || 0;
          roleMap[model].messageCount +=
            typeof stats.messageCount === "number"
              ? stats.messageCount
              : fallbackMessagesPerModel;
          roleMap[model].sessionCount++;
          roleMap[model].unpricedTokens +=
            stats.unpricedTokens || stats.unpriced_tokens || 0;
        }
      }
    } catch {
      /* skip malformed rows */
    }
  }

  const toArray = (map: Record<string, ModelStats>) =>
    Object.entries(map)
      .filter(([model]) => !model.startsWith("<"))
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.cost - a.cost);

  const result = toArray(models);

  if (includeRoleBreakdown && !role) {
    return NextResponse.json({
      models: result,
      byRole: {
        standalone: toArray(byRole.standalone),
        subagent: toArray(byRole.subagent),
      },
    });
  }

  return NextResponse.json({ models: result });
}
