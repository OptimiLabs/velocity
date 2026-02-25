import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { jsonWithCache } from "@/lib/api/cache-headers";
import { buildProviderFilter } from "@/lib/api/provider-filter";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const { searchParams } = new URL(request.url);
  const pAnd = buildProviderFilter(searchParams);

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sessions = db
    .prepare(
      `
    SELECT id, slug, first_prompt, summary, message_count, tool_call_count,
           input_tokens, output_tokens, total_cost, created_at, modified_at, git_branch,
           project_id, cache_read_tokens, status, project_path, jsonl_path, tool_usage, model_usage, enriched_tools
    FROM sessions
    WHERE project_id = ? AND message_count > 0
      ${pAnd.sql}
    ORDER BY modified_at DESC
  `,
    )
    .all(id, ...pAnd.params);

  const modelBreakdown = db
    .prepare(
      `
    SELECT model_usage FROM sessions WHERE project_id = ? AND model_usage != '{}'
      ${pAnd.sql}
  `,
    )
    .all(id, ...pAnd.params) as { model_usage: string }[];

  const models: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cost: number;
      sessions: number;
    }
  > = {};
  for (const row of modelBreakdown) {
    try {
      const usage = JSON.parse(row.model_usage) as Record<
        string,
        { inputTokens: number; outputTokens: number; cost: number }
      >;
      for (const [model, stats] of Object.entries(usage)) {
        if (!models[model])
          models[model] = {
            inputTokens: 0,
            outputTokens: 0,
            cost: 0,
            sessions: 0,
          };
        models[model].inputTokens += stats.inputTokens || 0;
        models[model].outputTokens += stats.outputTokens || 0;
        models[model].cost += stats.cost || 0;
        models[model].sessions++;
      }
    } catch {
      /* skip */
    }
  }

  return jsonWithCache({ project, sessions, models }, "detail");
}
