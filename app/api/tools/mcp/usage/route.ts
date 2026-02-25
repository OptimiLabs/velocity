import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildProviderFilter } from "@/lib/api/provider-filter";

interface SessionToolUsageEntry {
  count?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  estimatedCost?: number;
}

interface MCPUsageEntry {
  totalCalls: number;
  lastUsed: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  avgTokensPerCall: number;
  avgCostPerCall: number;
}

interface ToolUsageResult {
  [toolName: string]: MCPUsageEntry;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const pAnd = buildProviderFilter(searchParams);

    const rows = db
      .prepare(
        `SELECT tool_usage, modified_at FROM sessions WHERE tool_usage IS NOT NULL AND tool_usage != '{}' ${pAnd.sql}`,
      )
      .all(...pAnd.params) as Array<{ tool_usage: string; modified_at: string }>;

    const result: ToolUsageResult = {};

    for (const row of rows) {
      try {
        const usage = JSON.parse(row.tool_usage) as Record<
          string,
          SessionToolUsageEntry
        >;
        for (const [toolName, data] of Object.entries(usage)) {
          // Only include MCP tools (prefixed with mcp__)
          if (!toolName.startsWith("mcp__")) continue;
          if (!result[toolName]) {
            result[toolName] = {
              totalCalls: 0,
              lastUsed: null,
              totalTokens: 0,
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
              estimatedCost: 0,
              avgTokensPerCall: 0,
              avgCostPerCall: 0,
            };
          }
          const callCount = numberOrZero(data.count);
          const inputTokens = numberOrZero(data.inputTokens);
          const outputTokens = numberOrZero(data.outputTokens);
          const cacheReadTokens = numberOrZero(data.cacheReadTokens);
          const cacheWriteTokens = numberOrZero(data.cacheWriteTokens);
          const totalTokens =
            numberOrZero(data.totalTokens) ||
            (inputTokens +
              outputTokens +
              cacheReadTokens +
              cacheWriteTokens);

          result[toolName].totalCalls += callCount;
          result[toolName].inputTokens += inputTokens;
          result[toolName].outputTokens += outputTokens;
          result[toolName].cacheReadTokens += cacheReadTokens;
          result[toolName].cacheWriteTokens += cacheWriteTokens;
          result[toolName].totalTokens += totalTokens;
          result[toolName].estimatedCost += numberOrZero(data.estimatedCost);

          if (
            !result[toolName].lastUsed ||
            row.modified_at > result[toolName].lastUsed!
          ) {
            result[toolName].lastUsed = row.modified_at;
          }
        }
      } catch {
        // Skip rows with invalid JSON
      }
    }

    for (const entry of Object.values(result)) {
      if (entry.totalCalls > 0) {
        entry.avgTokensPerCall = entry.totalTokens / entry.totalCalls;
        entry.avgCostPerCall = entry.estimatedCost / entry.totalCalls;
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
