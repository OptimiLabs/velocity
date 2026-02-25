import { NextRequest, NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { readSettings, writeSettings } from "@/lib/claude-settings";
import { CLAUDE_DIR } from "@/lib/claude-paths";
import { generateStatuslineScript } from "@/lib/statusline/generator";
import { buildProviderFilter } from "@/lib/api/provider-filter";
import { writeFileSync, unlinkSync, chmodSync, existsSync } from "fs";
import path from "path";
import { apiLog } from "@/lib/logger";
import { isWindows } from "@/lib/platform";

const SCRIPT_PATH = path.join(CLAUDE_DIR, "statusline-usage.sh");

export async function GET(request: NextRequest) {
  // Return the generated script content if ?script=true
  const wantsScript = request.nextUrl.searchParams.get("script") === "true";
  if (wantsScript) {
    const port = parseInt(process.env.PORT || "3000", 10);
    const script = generateStatuslineScript(port);
    return NextResponse.json({ script });
  }
  await ensureIndexed();
  const db = getDb();
  const settings = readSettings();
  const resetMinutes = (settings.statuslineResetMinutes as number) || 300;

  // Optional from/to query params for time-window scoping
  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");

  // Block start override logic
  const blockStartOverride =
    (settings.statuslineBlockStartOverride as string) || null;

  let useOverride = false;
  if (blockStartOverride) {
    const expiresAt =
      new Date(blockStartOverride).getTime() + resetMinutes * 60_000;
    if (Date.now() < expiresAt) {
      useOverride = true;
    } else {
      // Expired — ignore it (cleaned up on next explicit settings save)
    }
  }

  const blockCutoff = fromParam
    ? fromParam
    : useOverride
      ? blockStartOverride!
      : toParam
        ? new Date(
            new Date(toParam).getTime() - resetMinutes * 60_000,
          ).toISOString()
        : new Date(Date.now() - resetMinutes * 60_000).toISOString();

  const pAnd = buildProviderFilter(request.nextUrl.searchParams);

  const toClause = toParam ? "AND created_at <= ?" : "";
  const toArgs = toParam ? [toParam] : [];

  const block = db
    .prepare(
      `
      SELECT
        COUNT(*) as session_count,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as message_count,
        COALESCE(SUM(tool_call_count), 0) as tool_call_count,
        MIN(created_at) as block_start
      FROM sessions
      WHERE created_at >= ?
        ${toClause}
        ${pAnd.sql}
    `,
    )
    .get(blockCutoff, ...toArgs, ...pAnd.params) as {
    session_count: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    total_cost: number;
    message_count: number;
    tool_call_count: number;
    block_start: string | null;
  };

  // Per-model breakdown for the block
  const blockModels = db
    .prepare(
      `
      SELECT model_usage
      FROM sessions
      WHERE created_at >= ?
        ${toClause}
        ${pAnd.sql}
        AND model_usage != '{}'
    `,
    )
    .all(blockCutoff, ...toArgs, ...pAnd.params) as { model_usage: string }[];

  const modelMap = new Map<
    string,
    { sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  >();
  for (const row of blockModels) {
    try {
      const usage = JSON.parse(row.model_usage) as Record<
        string,
        { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number;
          input_tokens?: number; output_tokens?: number; cache_read_tokens?: number; cache_write_tokens?: number }
      >;
      for (const [model, tokens] of Object.entries(usage)) {
        const existing = modelMap.get(model) ?? {
          sessions: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        existing.sessions += 1;
        existing.inputTokens += tokens.inputTokens ?? tokens.input_tokens ?? 0;
        existing.outputTokens += tokens.outputTokens ?? tokens.output_tokens ?? 0;
        existing.cacheReadTokens += tokens.cacheReadTokens ?? tokens.cache_read_tokens ?? 0;
        existing.cacheWriteTokens += tokens.cacheWriteTokens ?? tokens.cache_write_tokens ?? 0;
        modelMap.set(model, existing);
      }
    } catch (err) {
      apiLog.debug("statusline session parse error", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  const models = [...modelMap.entries()]
    .map(([model, data]) => ({ model, ...data }))
    .sort((a, b) => b.outputTokens - a.outputTokens);

  // Top sessions in the block by cost
  const topSessions = db
    .prepare(
      `
      SELECT id, slug, first_prompt, input_tokens, output_tokens,
             cache_read_tokens, total_cost, message_count, tool_call_count,
             created_at, project_path
      FROM sessions
      WHERE created_at >= ?
        ${toClause}
        ${pAnd.sql}
      ORDER BY total_cost DESC
      LIMIT 10
    `,
    )
    .all(blockCutoff, ...toArgs, ...pAnd.params) as {
    id: string;
    slug: string | null;
    first_prompt: string | null;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    total_cost: number;
    message_count: number;
    tool_call_count: number;
    created_at: string;
    project_path: string | null;
  }[];

  const blockStart = useOverride
    ? blockStartOverride
    : toParam
      ? new Date(
          new Date(toParam).getTime() - resetMinutes * 60_000,
        ).toISOString()
      : block.block_start
        ? new Date(block.block_start).toISOString()
        : null;
  const resetsAt = toParam
    ? toParam
    : blockStart
      ? new Date(
          new Date(blockStart).getTime() + resetMinutes * 60_000,
        ).toISOString()
      : null;

  return NextResponse.json({
    block: {
      sessions: block.session_count,
      inputTokens: block.input_tokens,
      outputTokens: block.output_tokens,
      cacheReadTokens: block.cache_read_tokens,
      cacheWriteTokens: block.cache_write_tokens,
      cost: block.total_cost,
      messages: block.message_count,
      toolCalls: block.tool_call_count,
      startedAt: blockStart,
      resetsAt,
    },
    models,
    topSessions,
    blockBudget: (settings.statuslineBlockBudget as number) || null,
    plan: (settings.statuslinePlan as string) ?? null,
    resetMinutes: (settings.statuslineResetMinutes as number) ?? 300,
    blockStartOverride: blockStartOverride ?? null,
    fileExists: existsSync(SCRIPT_PATH),
    configured: !!settings.statusLine,
    scriptPath: SCRIPT_PATH,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action as "install" | "uninstall";

  if (action === "install") {
    const port = parseInt(process.env.PORT || "3000", 10);
    const script = generateStatuslineScript(port);
    writeFileSync(SCRIPT_PATH, script, "utf-8");
    if (!isWindows) chmodSync(SCRIPT_PATH, 0o755);

    const settings = readSettings();
    settings.statusLine = {
      type: "command",
      command: SCRIPT_PATH,
    };
    writeSettings(settings);

    return NextResponse.json({ success: true, scriptPath: SCRIPT_PATH });
  }

  if (action === "uninstall") {
    const settings = readSettings();
    delete settings.statusLine;
    writeSettings(settings);

    if (existsSync(SCRIPT_PATH)) {
      unlinkSync(SCRIPT_PATH);
    }

    return NextResponse.json({ success: true });
  }

  if (action === "delete-script") {
    if (existsSync(SCRIPT_PATH)) {
      unlinkSync(SCRIPT_PATH);
    }
    return NextResponse.json({ success: true });
  }

  if (action === "remove-config") {
    const settings = readSettings();
    delete settings.statusLine;
    writeSettings(settings);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
