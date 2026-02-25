import { NextResponse } from "next/server";
import { getDb, ensureIndexed } from "@/lib/db";
import { buildAnalyticsFilters } from "@/lib/api/analytics-filters";
import { CLAUDE_CORE_TOOLS, CODEX_CORE_TOOLS, GEMINI_CORE_TOOLS } from "@/lib/tools/provider-tools";
import { apiLog } from "@/lib/logger";
import { nextUtcDay, normalizeDay } from "@/lib/api/date-range";

interface ToolAggregate {
  name: string;
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  errorCount: number;
  sessionCount: number;
  category: string;
  group: string;
}

interface CategorySummary {
  group: string;
  category: string;
  totalCalls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  toolCount: number;
}

function categorize(name: string, provider?: string): { category: string; group: string } {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    const server = parts.length >= 2 ? parts[1] : "unknown";
    return { category: "mcp", group: `MCP: ${server}` };
  }
  if (provider === "codex" && CODEX_CORE_TOOLS.has(name))
    return { category: "core", group: "Core Tools (Codex)" };
  if (provider === "gemini" && GEMINI_CORE_TOOLS.has(name))
    return { category: "core", group: "Core Tools (Gemini)" };
  if (CLAUDE_CORE_TOOLS.has(name))
    return { category: "core", group: "Core Tools (Claude)" };
  if (name === "Skill" || name.startsWith("Skill:"))
    return { category: "skill", group: "Skills" };
  if (name === "Task" || name.startsWith("Task:"))
    return { category: "agent", group: "Subagents" };
  return { category: "other", group: "Other" };
}

function buildCategories(tools: ToolAggregate[]): CategorySummary[] {
  const catMap = new Map<string, CategorySummary>();
  for (const t of tools) {
    const existing = catMap.get(t.group);
    if (existing) {
      existing.totalCalls += t.totalCalls;
      existing.totalTokens += t.totalTokens;
      existing.inputTokens += t.inputTokens;
      existing.outputTokens += t.outputTokens;
      existing.cacheReadTokens += t.cacheReadTokens;
      existing.cacheWriteTokens += t.cacheWriteTokens;
      existing.estimatedCost += t.estimatedCost;
      existing.toolCount += 1;
    } else {
      catMap.set(t.group, {
        group: t.group,
        category: t.category,
        totalCalls: t.totalCalls,
        totalTokens: t.totalTokens,
        inputTokens: t.inputTokens,
        outputTokens: t.outputTokens,
        cacheReadTokens: t.cacheReadTokens,
        cacheWriteTokens: t.cacheWriteTokens,
        estimatedCost: t.estimatedCost,
        toolCount: 1,
      });
    }
  }
  return Array.from(catMap.values()).sort(
    (a, b) => b.totalCalls - a.totalCalls,
  );
}

export async function GET(request: Request) {
  try {
  await ensureIndexed();
  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get("from") || "2025-01-01";
  const rawTo = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const from = normalizeDay(rawFrom);
  const to = normalizeDay(rawTo);
  const toExclusive = nextUtcDay(to);
  const role = searchParams.get("role");
  const splitBy = searchParams.get("splitBy");
  const includeRoleBreakdown =
    !splitBy && searchParams.get("includeRoleBreakdown") === "true";

  const { sql: filterSql, params: filterParams } =
    buildAnalyticsFilters(searchParams);

  const db = getDb();

  const rows = db
    .prepare(
      `
    SELECT tool_usage, enriched_tools, total_cost, input_tokens, output_tokens, cache_read_tokens, session_role, subagent_type, provider, id
    FROM sessions
    WHERE created_at >= ? AND created_at < ?
      AND tool_usage IS NOT NULL AND tool_usage != ''
      ${filterSql}
  `,
    )
    .all(from, toExclusive, ...filterParams) as {
    id: string;
    tool_usage: string;
    enriched_tools: string;
    total_cost: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    session_role: string | null;
    subagent_type: string | null;
    provider: string | null;
  }[];

  const agg = new Map<string, ToolAggregate>();
  const skillCounts = new Map<
    string,
    { count: number; sessions: Set<string> }
  >();
  const agentCounts = new Map<
    string,
    { count: number; sessions: Set<string> }
  >();

  const roleAgg: Record<string, Map<string, ToolAggregate>> = {
    standalone: new Map(),
    subagent: new Map(),
  };
  const roleSkillCounts: Record<
    string,
    Map<string, { count: number; sessions: Set<string> }>
  > = { standalone: new Map(), subagent: new Map() };
  const roleAgentCounts: Record<
    string,
    Map<string, { count: number; sessions: Set<string> }>
  > = { standalone: new Map(), subagent: new Map() };

  // splitBy=agentType aggregation
  const splitAgg: Record<string, Map<string, ToolAggregate>> = {};
  const splitSkillCounts: Record<
    string,
    Map<string, { count: number; sessions: Set<string> }>
  > = {};
  const splitAgentCounts: Record<
    string,
    Map<string, { count: number; sessions: Set<string> }>
  > = {};
  const doSplit = splitBy === "agentType";

  for (const row of rows) {
    let tools: Record<
      string,
      {
        name: string;
        count: number;
        totalTokens: number;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        estimatedCost?: number;
        errorCount?: number;
      }
    >;
    try {
      tools = JSON.parse(row.tool_usage);
    } catch (err) {
      apiLog.debug("malformed JSON in tool_usage", err);
      continue;
    }

    const effectiveRole =
      row.session_role === "subagent" ? "subagent" : "standalone";
    const doBreakdown = includeRoleBreakdown && !role;

    let enriched: {
      skills?: { name: string; count: number }[];
      agents?: { type: string }[];
    } | null = null;
    try {
      enriched = row.enriched_tools ? JSON.parse(row.enriched_tools) : null;
    } catch (err) {
      apiLog.debug("malformed JSON in enriched_tools", err);
    }

    const sessionKey = row.id;

    function accumulateSubEntries(
      sc: Map<string, { count: number; sessions: Set<string> }>,
      ac: Map<string, { count: number; sessions: Set<string> }>,
    ) {
      if (enriched?.skills) {
        for (const s of enriched.skills) {
          const existing = sc.get(s.name);
          if (existing) {
            existing.count += s.count;
            existing.sessions.add(sessionKey);
          } else
            sc.set(s.name, { count: s.count, sessions: new Set([sessionKey]) });
        }
      }
      if (enriched?.agents) {
        const perType = new Map<string, number>();
        for (const a of enriched.agents)
          perType.set(a.type, (perType.get(a.type) || 0) + 1);
        for (const [type, count] of perType) {
          const existing = ac.get(type);
          if (existing) {
            existing.count += count;
            existing.sessions.add(sessionKey);
          } else ac.set(type, { count, sessions: new Set([sessionKey]) });
        }
      }
    }

    accumulateSubEntries(skillCounts, agentCounts);
    if (doBreakdown)
      accumulateSubEntries(
        roleSkillCounts[effectiveRole],
        roleAgentCounts[effectiveRole],
      );

    // splitBy=agentType: accumulate sub-entries per agent type
    const splitKey = doSplit ? (row.subagent_type || "standalone") : "";
    if (doSplit) {
      if (!splitSkillCounts[splitKey]) splitSkillCounts[splitKey] = new Map();
      if (!splitAgentCounts[splitKey]) splitAgentCounts[splitKey] = new Map();
      accumulateSubEntries(splitSkillCounts[splitKey], splitAgentCounts[splitKey]);
    }

    const toolEntries = Object.values(tools);
    const effectiveTokens = (t: (typeof toolEntries)[0]) =>
      t.totalTokens ||
      (t.inputTokens || 0) +
        (t.outputTokens || 0) +
        (t.cacheReadTokens || 0) +
        (t.cacheWriteTokens || 0);

    const hasPerToolCost = toolEntries.some((t) => (t.estimatedCost ?? 0) > 0);
    const totalToolTokens = toolEntries.reduce(
      (s, t) => s + effectiveTokens(t),
      0,
    );

    function accumulateTool(
      targetAgg: Map<string, ToolAggregate>,
      tool: (typeof toolEntries)[0],
    ) {
      const existing = targetAgg.get(tool.name);
      const tokens = effectiveTokens(tool);
      const inp = tool.inputTokens || 0;
      const out = tool.outputTokens || 0;
      const cacheRead = tool.cacheReadTokens || 0;
      const cacheWrite = tool.cacheWriteTokens || 0;
      const estCost = hasPerToolCost
        ? (tool.estimatedCost ?? 0)
        : totalToolTokens > 0
          ? (tokens / totalToolTokens) * row.total_cost
          : 0;

      const errors = tool.errorCount ?? 0;

      if (existing) {
        existing.totalCalls += tool.count;
        existing.totalTokens += tokens;
        existing.inputTokens += inp;
        existing.outputTokens += out;
        existing.cacheReadTokens += cacheRead;
        existing.cacheWriteTokens += cacheWrite;
        existing.estimatedCost += estCost;
        existing.errorCount += errors;
        existing.sessionCount += 1;
      } else {
        const { category, group } = categorize(tool.name, row.provider ?? undefined);
        targetAgg.set(tool.name, {
          name: tool.name,
          totalCalls: tool.count,
          totalTokens: tokens,
          inputTokens: inp,
          outputTokens: out,
          cacheReadTokens: cacheRead,
          cacheWriteTokens: cacheWrite,
          estimatedCost: estCost,
          errorCount: errors,
          sessionCount: 1,
          category,
          group,
        });
      }
    }

    for (const tool of toolEntries) {
      accumulateTool(agg, tool);
      if (doBreakdown) accumulateTool(roleAgg[effectiveRole], tool);
      if (doSplit) {
        if (!splitAgg[splitKey]) splitAgg[splitKey] = new Map();
        accumulateTool(splitAgg[splitKey], tool);
      }
    }
  }

  function splitAggregate(
    targetAgg: Map<string, ToolAggregate>,
    parentName: string,
    subCounts: Map<string, { count: number; sessions: Set<string> }>,
    prefix: string,
  ) {
    const parent = targetAgg.get(parentName);
    if (!parent || subCounts.size === 0) return;

    const totalSubCalls = Array.from(subCounts.values()).reduce(
      (s, v) => s + v.count,
      0,
    );
    if (totalSubCalls === 0) return;

    let remainingCalls = parent.totalCalls;
    let remainingTokens = parent.totalTokens;
    let remainingInput = parent.inputTokens;
    let remainingOutput = parent.outputTokens;
    let remainingCacheRead = parent.cacheReadTokens;
    let remainingCacheWrite = parent.cacheWriteTokens;
    let remainingCost = parent.estimatedCost;
    let remainingErrors = parent.errorCount;

    const entries = Array.from(subCounts.entries());
    for (let i = 0; i < entries.length; i++) {
      const [subName, { count, sessions }] = entries[i];
      const ratio = count / totalSubCalls;
      const isLast = i === entries.length - 1;
      const name = `${prefix}:${subName}`;
      const { category, group } = categorize(name);

      const calls = isLast
        ? remainingCalls
        : Math.round(parent.totalCalls * ratio);
      const tokens = isLast
        ? remainingTokens
        : Math.round(parent.totalTokens * ratio);
      const inp = isLast
        ? remainingInput
        : Math.round(parent.inputTokens * ratio);
      const out = isLast
        ? remainingOutput
        : Math.round(parent.outputTokens * ratio);
      const cacheR = isLast
        ? remainingCacheRead
        : Math.round(parent.cacheReadTokens * ratio);
      const cacheW = isLast
        ? remainingCacheWrite
        : Math.round(parent.cacheWriteTokens * ratio);
      const cost = isLast ? remainingCost : parent.estimatedCost * ratio;
      const errs = isLast
        ? remainingErrors
        : Math.round(parent.errorCount * ratio);

      remainingCalls -= calls;
      remainingTokens -= tokens;
      remainingInput -= inp;
      remainingOutput -= out;
      remainingCacheRead -= cacheR;
      remainingCacheWrite -= cacheW;
      remainingCost -= cost;
      remainingErrors -= errs;

      targetAgg.set(name, {
        name,
        totalCalls: calls,
        totalTokens: tokens,
        inputTokens: inp,
        outputTokens: out,
        cacheReadTokens: cacheR,
        cacheWriteTokens: cacheW,
        estimatedCost: cost,
        errorCount: errs,
        sessionCount: sessions.size,
        category,
        group,
      });
    }

    targetAgg.delete(parentName);
  }

  splitAggregate(agg, "Task", agentCounts, "Task");
  splitAggregate(agg, "Skill", skillCounts, "Skill");

  const tools = Array.from(agg.values()).sort(
    (a, b) => b.estimatedCost - a.estimatedCost,
  );
  const categories = buildCategories(tools);

  if (includeRoleBreakdown && !role) {
    for (const r of ["standalone", "subagent"] as const) {
      splitAggregate(roleAgg[r], "Task", roleAgentCounts[r], "Task");
      splitAggregate(roleAgg[r], "Skill", roleSkillCounts[r], "Skill");
    }
    const standaloneTools = Array.from(roleAgg.standalone.values()).sort(
      (a, b) => b.estimatedCost - a.estimatedCost,
    );
    const subagentTools = Array.from(roleAgg.subagent.values()).sort(
      (a, b) => b.estimatedCost - a.estimatedCost,
    );

    return NextResponse.json({
      tools,
      categories,
      byRole: {
        standalone: {
          tools: standaloneTools,
          categories: buildCategories(standaloneTools),
        },
        subagent: {
          tools: subagentTools,
          categories: buildCategories(subagentTools),
        },
      },
    });
  }

  if (doSplit) {
    const splits: Record<string, { tools: ToolAggregate[]; categories: CategorySummary[] }> = {};
    for (const [type, typeAgg] of Object.entries(splitAgg)) {
      splitAggregate(typeAgg, "Task", splitAgentCounts[type] ?? new Map(), "Task");
      splitAggregate(typeAgg, "Skill", splitSkillCounts[type] ?? new Map(), "Skill");
      const typeTools = Array.from(typeAgg.values()).sort(
        (a, b) => b.estimatedCost - a.estimatedCost,
      );
      splits[type] = { tools: typeTools, categories: buildCategories(typeTools) };
    }
    return NextResponse.json({ tools, categories, splits });
  }

  return NextResponse.json({ tools, categories });
  } catch (err) {
    apiLog.error("analytics tools query failed", err);
    return NextResponse.json(
      { error: "Failed to fetch tool analytics" },
      { status: 500 }
    );
  }
}
