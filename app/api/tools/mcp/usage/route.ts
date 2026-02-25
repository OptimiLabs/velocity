import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { buildProviderFilter } from "@/lib/api/provider-filter";

interface ToolUsageResult {
  [toolName: string]: { totalCalls: number; lastUsed: string | null };
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
          { count?: number }
        >;
        for (const [toolName, data] of Object.entries(usage)) {
          // Only include MCP tools (prefixed with mcp__)
          if (!toolName.startsWith("mcp__")) continue;
          if (!result[toolName]) {
            result[toolName] = { totalCalls: 0, lastUsed: null };
          }
          result[toolName].totalCalls += data.count || 0;
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

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
