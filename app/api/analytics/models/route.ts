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

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
          input_tokens?: number;
          outputTokens?: number;
          output_tokens?: number;
          reasoningTokens?: number;
          reasoning_output_tokens?: number;
          cacheReadTokens?: number;
          cache_read_tokens?: number;
          cacheReadInputTokens?: number;
          cache_read_input_tokens?: number;
          cacheWriteTokens?: number;
          cache_write_tokens?: number;
          cacheWriteInputTokens?: number;
          cache_write_input_tokens?: number;
          cacheCreationInputTokens?: number;
          cache_creation_input_tokens?: number;
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
        const inputTokens = numberOrZero(stats.inputTokens ?? stats.input_tokens);
        const outputTokens = numberOrZero(
          stats.outputTokens ?? stats.output_tokens,
        );
        const reasoningTokens = numberOrZero(
          stats.reasoningTokens ?? stats.reasoning_output_tokens,
        );
        const cacheReadTokens = numberOrZero(
          stats.cacheReadTokens ??
            stats.cache_read_tokens ??
            stats.cacheReadInputTokens ??
            stats.cache_read_input_tokens,
        );
        const cacheWriteTokens = numberOrZero(
          stats.cacheWriteTokens ??
            stats.cache_write_tokens ??
            stats.cacheWriteInputTokens ??
            stats.cache_write_input_tokens ??
            stats.cacheCreationInputTokens ??
            stats.cache_creation_input_tokens,
        );
        const modelCost = numberOrZero(stats.costUSD ?? stats.cost);
        const modelUnpricedTokens = numberOrZero(
          stats.unpricedTokens ?? stats.unpriced_tokens,
        );

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
        models[model].inputTokens += inputTokens;
        models[model].outputTokens += outputTokens;
        models[model].reasoningTokens += reasoningTokens;
        models[model].cacheReadTokens += cacheReadTokens;
        models[model].cacheWriteTokens += cacheWriteTokens;
        models[model].cost += modelCost;
        models[model].messageCount +=
          typeof stats.messageCount === "number"
            ? stats.messageCount
            : fallbackMessagesPerModel;
        models[model].sessionCount++;
        models[model].unpricedTokens += modelUnpricedTokens;

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
          roleMap[model].inputTokens += inputTokens;
          roleMap[model].outputTokens += outputTokens;
          roleMap[model].reasoningTokens += reasoningTokens;
          roleMap[model].cacheReadTokens += cacheReadTokens;
          roleMap[model].cacheWriteTokens += cacheWriteTokens;
          roleMap[model].cost += modelCost;
          roleMap[model].messageCount +=
            typeof stats.messageCount === "number"
              ? stats.messageCount
              : fallbackMessagesPerModel;
          roleMap[model].sessionCount++;
          roleMap[model].unpricedTokens += modelUnpricedTokens;
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
