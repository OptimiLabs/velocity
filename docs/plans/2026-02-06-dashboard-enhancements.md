# Dashboard Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the broken token chart, add categorized tool/skill/agent display, per-project analytics with drill-down, and hybrid session summaries.

**Architecture:** Four independent feature tracks that share a common data layer change (enriched session aggregation). The aggregator learns to extract skill names, agent spawns, and files touched from JSONL tool_use blocks. A new classification utility categorizes tools into groups. Analytics gets project filtering and a dedicated project page. Session cards show auto-generated summaries with optional LLM enrichment.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, SQLite (better-sqlite3), Recharts, TanStack Query, Tailwind CSS, shadcn/ui

---

## Task 1: Fix Token Usage in daily_stats

The TokenChart on `/analytics` always shows zeros because `indexer.ts:251-252` hardcodes `0` for `input_tokens` and `output_tokens` when importing from `stats-cache.json`. We fix this by computing daily token totals from the sessions table after aggregation.

**Files:**

- Modify: `lib/parser/indexer.ts` (lines 265-332, after the second pass loop)

**Step 1: Add daily token update after session aggregation**

At the end of `rebuildIndex()`, after the project updates loop (line 329), add a query that computes daily token sums from sessions and upserts into `daily_stats`:

```typescript
// Backfill daily_stats token columns from session-level data
db.prepare(
  `
    INSERT OR REPLACE INTO daily_stats (date, message_count, session_count, tool_call_count, input_tokens, output_tokens, total_cost)
    SELECT
      DATE(s.created_at) as date,
      COALESCE(ds.message_count, 0),
      COALESCE(ds.session_count, 0),
      COALESCE(ds.tool_call_count, 0),
      COALESCE(SUM(s.input_tokens), 0),
      COALESCE(SUM(s.output_tokens), 0),
      COALESCE(ds.total_cost, 0)
    FROM sessions s
    LEFT JOIN daily_stats ds ON ds.date = DATE(s.created_at)
    GROUP BY DATE(s.created_at)
  `,
).run();
```

This preserves the existing `message_count`, `session_count`, `tool_call_count`, and `total_cost` values from `stats-cache.json` while filling in the actual token numbers from sessions.

**Step 2: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors

Run: `bun run build`
Expected: Build succeeds

**Step 3: Manual verification**

1. Delete `~/.claude/dashboard.db`
2. Start the dev server: `bun dev`
3. Trigger re-index from the Sessions page
4. Go to Analytics page -> Token Usage chart should now show actual data

**Step 4: Commit**

```bash
git add lib/parser/indexer.ts
git commit -m "fix: backfill daily_stats token columns from session data"
```

---

## Task 2: Enrich Session Aggregator with Tool Categories

Extend `aggregateSession()` to extract structured data about skills invoked, agents spawned, MCP tools used, and files touched. This data feeds both the sidebar display (Task 3) and session summaries (Task 7).

**Files:**

- Modify: `lib/parser/session-aggregator.ts`
- Modify: `types/session.ts` (add new types)

**Step 1: Add new types to `types/session.ts`**

After the existing `OverallStats` interface, add:

```typescript
export interface SkillEntry {
  name: string; // e.g. "brainstorming", "test-driven-development"
  count: number;
}

export interface AgentEntry {
  type: string; // e.g. "Explore", "Bash", "Plan"
  description: string; // the short description from the Task tool call
}

export interface EnrichedToolData {
  skills: SkillEntry[];
  agents: AgentEntry[];
  mcpTools: Record<string, number>; // server name -> total call count
  coreTools: Record<string, number>; // tool name -> count (Read, Write, etc.)
  otherTools: Record<string, number>; // everything else
  filesModified: string[]; // unique file paths from Write/Edit calls
}
```

**Step 2: Add new fields to `SessionStats` in `lib/parser/session-aggregator.ts`**

```typescript
export interface SessionStats {
  messageCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalCost: number;
  toolUsage: Record<string, ToolUsageEntry>;
  modelUsage: Record<string, ModelUsageEntry>;
  enrichedTools: EnrichedToolData; // NEW
  autoSummary: string | null; // NEW — for Task 7
}
```

**Step 3: Add classification constants at top of `session-aggregator.ts`**

```typescript
const CORE_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "TodoRead",
  "TodoWrite",
]);
```

**Step 4: Expand the tool_use extraction loop**

Replace lines 82-92 (the `if (Array.isArray(content))` block) with enriched extraction:

```typescript
if (Array.isArray(content)) {
  for (const block of content) {
    if (block.type === "tool_use" && block.name) {
      toolCallCount++;
      const name = block.name as string;
      if (!toolUsage[name]) {
        toolUsage[name] = { name, count: 0, totalTokens: 0 };
      }
      toolUsage[name].count++;

      const input = block.input as Record<string, unknown> | undefined;

      // Skill detection
      if (name === "Skill" && input?.skill) {
        const skillName = String(input.skill);
        const existing = skills.find((s) => s.name === skillName);
        if (existing) existing.count++;
        else skills.push({ name: skillName, count: 1 });
      }

      // Agent/subagent detection
      if (name === "Task" && input) {
        agents.push({
          type: String(input.subagent_type || "unknown"),
          description: String(input.description || "").slice(0, 100),
        });
      }

      // MCP tool detection (format: mcp__<server>__<tool>)
      if (name.startsWith("mcp__")) {
        const parts = name.split("__");
        const server = parts[1] || "unknown";
        mcpTools[server] = (mcpTools[server] || 0) + 1;
      }

      // File tracking from Write/Edit calls
      if ((name === "Write" || name === "Edit") && input?.file_path) {
        filesModified.add(String(input.file_path));
      }
    }
  }
}
```

Where `skills`, `agents`, `mcpTools`, `filesModified` are declared before the main loop:

```typescript
const skills: SkillEntry[] = [];
const agents: AgentEntry[] = [];
const mcpTools: Record<string, number> = {};
const filesModified = new Set<string>();
```

**Step 5: Build the `enrichedTools` object and classify remaining tools**

After the main loop, before the return statement:

```typescript
// Classify tool usage into categories
const coreTools: Record<string, number> = {};
const otherTools: Record<string, number> = {};

for (const [name, entry] of Object.entries(toolUsage)) {
  if (name === "Skill" || name === "Task" || name.startsWith("mcp__")) continue;
  if (CORE_TOOLS.has(name)) {
    coreTools[name] = entry.count;
  } else {
    otherTools[name] = entry.count;
  }
}

const enrichedTools: EnrichedToolData = {
  skills,
  agents,
  mcpTools,
  coreTools,
  otherTools,
  filesModified: [...filesModified],
};
```

**Step 6: Update the return statement**

```typescript
return {
  messageCount,
  toolCallCount,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  totalCost,
  toolUsage,
  modelUsage,
  enrichedTools,
  autoSummary: null, // populated in Task 7
};
```

**Step 7: Add import for the new types**

At the top of `session-aggregator.ts`:

```typescript
import type { SkillEntry, AgentEntry, EnrichedToolData } from "@/types/session";
```

**Step 8: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors (there may be errors in indexer.ts due to the new field — those are fixed in Task 3)

**Step 9: Commit**

```bash
git add lib/parser/session-aggregator.ts types/session.ts
git commit -m "feat: extract skills, agents, MCP tools, and files from JSONL"
```

---

## Task 3: Store Enriched Tool Data & Update Indexer

Add a new column `enriched_tools` to sessions and update the indexer to store it.

**Files:**

- Modify: `lib/db/schema.ts` (add column + migration)
- Modify: `lib/parser/indexer.ts` (update INSERT/UPDATE statements)
- Modify: `types/session.ts` (add field to Session interface)

**Step 1: Add column to schema**

In `schema.ts`, add `enriched_tools TEXT DEFAULT '{}'` after `model_usage` in the CREATE TABLE statement (line 35):

```sql
      model_usage TEXT DEFAULT '{}',
      enriched_tools TEXT DEFAULT '{}',
```

Add migration for existing databases:

```typescript
const migrations = [
  "ALTER TABLE sessions ADD COLUMN tool_usage TEXT DEFAULT '{}'",
  "ALTER TABLE sessions ADD COLUMN model_usage TEXT DEFAULT '{}'",
  "ALTER TABLE sessions ADD COLUMN enriched_tools TEXT DEFAULT '{}'",
];
```

**Step 2: Update Session type in `types/session.ts`**

Add to the `Session` interface after `model_usage`:

```typescript
enriched_tools: string; // JSON-encoded EnrichedToolData
```

**Step 3: Update indexer's UPDATE statement**

In `indexer.ts`, modify the `updateSession` prepared statement (around line 268) to include `enriched_tools`:

```typescript
const updateSession = db.prepare(`
    UPDATE sessions SET
      message_count = ?,
      tool_call_count = ?,
      input_tokens = ?,
      output_tokens = ?,
      cache_read_tokens = ?,
      total_cost = ?,
      tool_usage = ?,
      model_usage = ?,
      enriched_tools = ?
    WHERE id = ?
  `);
```

And update the `updateSession.run()` call to include the new field:

```typescript
updateSession.run(
  stats.messageCount,
  stats.toolCallCount,
  stats.inputTokens,
  stats.outputTokens,
  stats.cacheReadTokens,
  stats.totalCost,
  JSON.stringify(stats.toolUsage),
  JSON.stringify(stats.modelUsage),
  JSON.stringify(stats.enrichedTools),
  sess.id,
);
```

**Step 4: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors

Run: `bun run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add lib/db/schema.ts lib/parser/indexer.ts types/session.ts
git commit -m "feat: store enriched tool data in sessions table"
```

---

## Task 4: Categorized Tool Display in Session Sidebar

Replace the flat `ToolUsageChart` with a categorized display showing Skills, Agents, MCP Tools, and a collapsible "All Tools" section.

**Files:**

- Create: `components/sessions/CategorizedTools.tsx`
- Modify: `components/sessions/SessionSidebar.tsx`

**Step 1: Create `CategorizedTools.tsx`**

This component receives parsed `EnrichedToolData` and renders categorized sections:

```tsx
"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Bot,
  Plug,
  Wrench,
} from "lucide-react";
import type { EnrichedToolData } from "@/types/session";

function Section({
  icon: Icon,
  title,
  count,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Icon size={12} />
        <span className="flex-1 text-left">{title}</span>
        <span className="tabular-nums text-[10px]">{count}</span>
      </button>
      {open && <div className="pl-5 space-y-0.5 mt-0.5">{children}</div>}
    </div>
  );
}

function ToolRow({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-foreground/70 truncate">{name}</span>
      <span className="tabular-nums text-muted-foreground ml-2">{count}</span>
    </div>
  );
}

export function CategorizedTools({ data }: { data: EnrichedToolData }) {
  const totalSkillCalls = data.skills.reduce((s, e) => s + e.count, 0);
  const totalMcpCalls = Object.values(data.mcpTools).reduce((s, c) => s + c, 0);
  const totalCoreCalls = Object.values(data.coreTools).reduce(
    (s, c) => s + c,
    0,
  );
  const totalOtherCalls = Object.values(data.otherTools).reduce(
    (s, c) => s + c,
    0,
  );

  return (
    <div className="space-y-1.5">
      <Section icon={Sparkles} title="Skills" count={totalSkillCalls}>
        {data.skills
          .sort((a, b) => b.count - a.count)
          .map((s) => (
            <ToolRow key={s.name} name={s.name} count={s.count} />
          ))}
      </Section>

      <Section icon={Bot} title="Agents" count={data.agents.length}>
        {data.agents.map((a, i) => (
          <div key={i} className="text-[11px] py-0.5">
            <span className="text-foreground/70">{a.type}</span>
            {a.description && (
              <span className="text-muted-foreground ml-1">
                — {a.description}
              </span>
            )}
          </div>
        ))}
      </Section>

      <Section icon={Plug} title="MCP Tools" count={totalMcpCalls}>
        {Object.entries(data.mcpTools)
          .sort(([, a], [, b]) => b - a)
          .map(([server, count]) => (
            <ToolRow key={server} name={server} count={count} />
          ))}
      </Section>

      <Section icon={Wrench} title="Other Tools" count={totalOtherCalls}>
        {Object.entries(data.otherTools)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => (
            <ToolRow key={name} name={name} count={count} />
          ))}
      </Section>

      <Section
        icon={Wrench}
        title="Core Tools"
        count={totalCoreCalls}
        defaultOpen={false}
      >
        {Object.entries(data.coreTools)
          .sort(([, a], [, b]) => b - a)
          .map(([name, count]) => (
            <ToolRow key={name} name={name} count={count} />
          ))}
      </Section>
    </div>
  );
}
```

**Step 2: Update `SessionSidebar.tsx`**

Replace the existing tool usage section (lines 105-115) with the new component. Import `CategorizedTools` and `EnrichedToolData`:

```typescript
import { CategorizedTools } from "./CategorizedTools";
import type { EnrichedToolData } from "@/types/session";
```

Parse the new field alongside existing ones:

```typescript
const enrichedTools = parseJsonField<EnrichedToolData>(session.enriched_tools, {
  skills: [],
  agents: [],
  mcpTools: {},
  coreTools: {},
  otherTools: {},
  filesModified: [],
});
```

Replace the `{toolEntries.length > 0 && ...}` block with:

```tsx
{
  session.tool_call_count > 0 && (
    <>
      <Separator />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Tools ({session.tool_call_count})
        </div>
        {enrichedTools.skills.length > 0 ||
        enrichedTools.agents.length > 0 ||
        Object.keys(enrichedTools.mcpTools).length > 0 ? (
          <CategorizedTools data={enrichedTools} />
        ) : (
          <ToolUsageChart data={toolEntries} />
        )}
      </div>
    </>
  );
}
```

This falls back to the old `ToolUsageChart` for sessions that were indexed before the enrichment was added.

**Step 3: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors

Run: `bun run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add components/sessions/CategorizedTools.tsx components/sessions/SessionSidebar.tsx
git commit -m "feat: categorized tool display with skills, agents, MCP sections"
```

---

## Task 5: Project Drill-Down on Analytics Page

Add a project selector to the analytics page that filters all charts by project. Since the analytics API currently queries `daily_stats` (which has no project dimension), we need to add a session-based alternative query path.

**Files:**

- Modify: `app/api/analytics/route.ts` (add `projectId` filter)
- Modify: `hooks/useAnalytics.ts` (pass `projectId`)
- Modify: `app/analytics/page.tsx` (add project selector)
- Modify: `app/api/projects/route.ts` (no change needed — already returns all projects)

**Step 1: Update analytics API to support project filtering**

In `app/api/analytics/route.ts`, add a `projectId` param. When present, compute daily stats from sessions table instead of daily_stats:

```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "2025-01-01";
  const to = searchParams.get("to") || new Date().toISOString().split("T")[0];
  const projectId = searchParams.get("projectId");

  const db = getDb();

  let daily, totals, previousTotals;

  if (projectId) {
    // Project-filtered: compute from sessions table
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
        COALESCE(SUM(total_cost), 0) as total_cost
      FROM sessions
      WHERE project_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
      )
      .all(projectId, from, to);

    totals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens
      FROM sessions
      WHERE project_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
    `,
      )
      .get(projectId, from, to);

    // Previous period
    const dayRange = Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const prevFrom = format(subDays(new Date(from), dayRange), "yyyy-MM-dd");
    const prevTo = format(subDays(new Date(from), 1), "yyyy-MM-dd");

    previousTotals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COUNT(*) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens
      FROM sessions
      WHERE project_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?
    `,
      )
      .get(projectId, prevFrom, prevTo);
  } else {
    // Existing global queries (unchanged)
    daily = db
      .prepare(
        `
      SELECT date, message_count, session_count, tool_call_count,
             input_tokens, output_tokens, total_cost
      FROM daily_stats
      WHERE date >= ? AND date <= ?
      ORDER BY date ASC
    `,
      )
      .all(from, to);

    totals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COALESCE(SUM(session_count), 0) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens
      FROM daily_stats
      WHERE date >= ? AND date <= ?
    `,
      )
      .get(from, to);

    const dayRange = Math.ceil(
      (new Date(to).getTime() - new Date(from).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const prevFrom = format(subDays(new Date(from), dayRange), "yyyy-MM-dd");
    const prevTo = format(subDays(new Date(from), 1), "yyyy-MM-dd");

    previousTotals = db
      .prepare(
        `
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(message_count), 0) as total_messages,
        COALESCE(SUM(session_count), 0) as total_sessions,
        COALESCE(SUM(tool_call_count), 0) as total_tool_calls,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens
      FROM daily_stats
      WHERE date >= ? AND date <= ?
    `,
      )
      .get(prevFrom, prevTo);
  }

  const weeklyAgg = db
    .prepare(
      `
    SELECT
      strftime('%Y-W%W', ${projectId ? "created_at" : "date"}) as week,
      ${projectId ? "COALESCE(SUM(total_cost), 0)" : "SUM(total_cost)"} as total_cost,
      ${projectId ? "COALESCE(SUM(message_count), 0)" : "SUM(message_count)"} as total_messages,
      ${projectId ? "COUNT(*)" : "SUM(session_count)"} as total_sessions
    FROM ${projectId ? "sessions" : "daily_stats"}
    ${projectId ? "WHERE project_id = ? AND DATE(created_at) >= ? AND DATE(created_at) <= ?" : "WHERE date >= ? AND date <= ?"}
    GROUP BY week
    ORDER BY week ASC
  `,
    )
    .all(...(projectId ? [projectId, from, to] : [from, to]));

  return NextResponse.json({
    daily,
    totals,
    previousTotals,
    weekly: weeklyAgg,
  });
}
```

**Step 2: Update `useAnalytics` hook**

In `hooks/useAnalytics.ts`, add optional `projectId` parameter:

```typescript
export function useAnalytics(from: string, to: string, projectId?: string) {
  return useQuery({
    queryKey: ["analytics", from, to, projectId],
    queryFn: async (): Promise<AnalyticsData> => {
      const params = new URLSearchParams({ from, to });
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/analytics?${params}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });
}
```

**Step 3: Add project selector to analytics page**

Create a new hook to fetch projects, and add a dropdown to the analytics page. In `hooks/useAnalytics.ts`, add:

```typescript
import type { Project } from "@/types/session";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });
}
```

In `app/analytics/page.tsx`, add state and selector:

```typescript
import {
  useAnalytics,
  useProjectCosts,
  useProjects,
} from "@/hooks/useAnalytics";

// Inside the component:
const [selectedProject, setSelectedProject] = useState<string | undefined>();
const { data: projects } = useProjects();
const { data, isLoading } = useAnalytics(from, today, selectedProject);
```

Add a project dropdown next to the date range buttons:

```tsx
<div className="flex items-center gap-3">
  <select
    className="h-7 text-xs px-2 bg-card border border-border/50 rounded-md text-foreground"
    value={selectedProject || ""}
    onChange={(e) => setSelectedProject(e.target.value || undefined)}
  >
    <option value="">All Projects</option>
    {projects?.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
      </option>
    ))}
  </select>
  <div className="flex items-center gap-1">
    {/* existing date range buttons */}
  </div>
</div>
```

**Step 4: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors

Run: `bun run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add app/api/analytics/route.ts hooks/useAnalytics.ts app/analytics/page.tsx
git commit -m "feat: add project filter drill-down to analytics page"
```

---

## Task 6: Dedicated Project Detail Page

Add a new `/projects/[id]` page that shows per-project analytics: cost timeline, token usage, model breakdown, and session list.

**Files:**

- Create: `app/projects/[id]/page.tsx`
- Create: `app/api/projects/[id]/route.ts`
- Modify: `components/layout/Sidebar.tsx` (add Projects nav item)
- Create: `app/projects/page.tsx` (project list page)

**Step 1: Create project detail API**

Create `app/api/projects/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = getDb();

  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sessions = db
    .prepare(
      `
    SELECT id, slug, first_prompt, summary, message_count, tool_call_count,
           input_tokens, output_tokens, total_cost, created_at, modified_at, git_branch
    FROM sessions
    WHERE project_id = ?
    ORDER BY modified_at DESC
  `,
    )
    .all(id);

  const modelBreakdown = db
    .prepare(
      `
    SELECT model_usage FROM sessions WHERE project_id = ? AND model_usage != '{}'
  `,
    )
    .all(id) as { model_usage: string }[];

  // Aggregate model usage across all sessions
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

  return NextResponse.json({ project, sessions, models });
}
```

**Step 2: Create project list page `app/projects/page.tsx`**

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderOpen } from "lucide-react";
import type { Project } from "@/types/session";

export default function ProjectsPage() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        {projects?.length || 0} projects
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {projects?.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="card-hover-glow cursor-pointer bg-card">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 mb-2">
                  <FolderOpen
                    size={14}
                    className="text-muted-foreground mt-0.5"
                  />
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                  <span>{p.session_count} sessions</span>
                  <span>{formatTokens(p.total_tokens)} tokens</span>
                  <span className="ml-auto tabular-nums">
                    {formatCost(p.total_cost)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**Step 3: Create project detail page `app/projects/[id]/page.tsx`**

This page shows project-specific KPIs, a cost timeline (reusing CostChart filtered by project), model breakdown, and session list. It reuses existing components where possible:

```tsx
"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAnalytics } from "@/hooks/useAnalytics";
import { CostChart } from "@/components/analytics/CostChart";
import { TokenChart } from "@/components/analytics/TokenChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { SessionCard } from "@/components/sessions/SessionCard";
import { subDays, format } from "date-fns";
import type { Session, Project } from "@/types/session";

const ranges = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 365 },
];

interface ProjectDetail {
  project: Project;
  sessions: Session[];
  models: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cost: number;
      sessions: number;
    }
  >;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeDays, setActiveDays] = useState(30);
  const today = format(new Date(), "yyyy-MM-dd");
  const from = format(subDays(new Date(), activeDays), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["project-detail", id],
    queryFn: async (): Promise<ProjectDetail> => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Project not found");
      return res.json();
    },
  });

  const { data: analytics } = useAnalytics(from, today, id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-sm text-muted-foreground text-center py-12">
        Project not found
      </div>
    );
  }

  const { project, sessions, models } = data;
  const modelEntries = Object.entries(models).sort(
    ([, a], [, b]) => b.cost - a.cost,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/projects">
          <Button variant="ghost" size="sm" className="h-7">
            <ArrowLeft size={14} />
          </Button>
        </Link>
        <div>
          <h2 className="text-sm font-medium">{project.name}</h2>
          <p className="text-xs text-muted-foreground font-mono">
            {project.path}
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Cost", value: formatCost(project.total_cost) },
          { label: "Sessions", value: String(project.session_count) },
          { label: "Tokens", value: formatTokens(project.total_tokens) },
          { label: "Models", value: String(modelEntries.length) },
        ].map(({ label, value }) => (
          <Card key={label} className="bg-card/80">
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
              </div>
              <div className="text-lg font-medium tabular-nums mt-1">
                {value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Date range + charts */}
      <div className="flex items-center gap-1 justify-end">
        {ranges.map(({ label, days }) => (
          <Button
            key={days}
            variant={activeDays === days ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs px-2.5"
            onClick={() => setActiveDays(days)}
          >
            {label}
          </Button>
        ))}
      </div>

      {analytics && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <CostChart data={analytics.daily} />
          <TokenChart data={analytics.daily} />
        </div>
      )}

      {/* Model breakdown */}
      {modelEntries.length > 0 && (
        <Card className="bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-section-title">Model Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {modelEntries.map(([model, stats]) => (
                <div
                  key={model}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="font-mono text-[11px] text-foreground/80 truncate">
                    {model}
                  </span>
                  <div className="flex gap-4 text-muted-foreground">
                    <span>
                      {formatTokens(stats.inputTokens + stats.outputTokens)} tok
                    </span>
                    <span className="tabular-nums">
                      {formatCost(stats.cost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sessions list */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Sessions ({sessions.length})
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sessions.slice(0, 20).map((s) => (
            <SessionCard key={s.id} session={s as Session} />
          ))}
        </div>
        {sessions.length > 20 && (
          <div className="text-xs text-muted-foreground text-center mt-3">
            Showing 20 of {sessions.length} sessions
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 4: Add Projects to sidebar navigation**

In `components/layout/Sidebar.tsx`, add a nav item after Analytics:

```typescript
import {
  LayoutDashboard,
  History,
  DollarSign,
  Activity,
  GitBranch,
  Terminal,
  FolderOpen,
} from "lucide-react";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard", shortcut: "1" },
  { href: "/sessions", icon: History, label: "Sessions", shortcut: "2" },
  { href: "/analytics", icon: DollarSign, label: "Analytics", shortcut: "3" },
  { href: "/projects", icon: FolderOpen, label: "Projects", shortcut: "4" },
  { href: "/live", icon: Activity, label: "Live", shortcut: "5" },
  { href: "/agents", icon: GitBranch, label: "Agents", shortcut: "6" },
  { href: "/console", icon: Terminal, label: "Console", shortcut: "7" },
];
```

**Step 5: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors

Run: `bun run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add app/projects/ app/api/projects/ components/layout/Sidebar.tsx hooks/useAnalytics.ts
git commit -m "feat: add dedicated project pages with cost, token, and model analytics"
```

---

## Task 7: Auto-Generated Session Summaries

Extract a structured summary from JSONL at index time. The summary captures: what was worked on, key files, key actions, and outcome — without any LLM call.

**Files:**

- Create: `lib/parser/summary-generator.ts`
- Modify: `lib/parser/session-aggregator.ts` (call summary generator)
- Modify: `lib/parser/indexer.ts` (store summary)
- Modify: `lib/db/schema.ts` (summary column already exists)

**Step 1: Create `lib/parser/summary-generator.ts`**

This module scans JSONL messages to extract a short textual summary:

```typescript
import type { JsonlMessage } from "./jsonl";

/**
 * Generates an auto-summary from parsed JSONL messages.
 * Extracts: first prompt topic, key files modified, main actions, errors.
 * Returns a 1-3 sentence summary string.
 */
export function generateAutoSummary(messages: JsonlMessage[]): string | null {
  const humanMessages: string[] = [];
  const filesModified = new Set<string>();
  const commandsRun: string[] = [];
  let hadErrors = false;

  for (const msg of messages) {
    if (!msg.message) continue;
    const { role, content } = msg.message;

    // Collect human messages for topic extraction
    if (role === "user" && content) {
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .filter((b) => b.type === "text")
                .map((b) => b.text)
                .join(" ")
            : "";
      if (text.trim()) humanMessages.push(text.slice(0, 200));
    }

    // Extract files and commands from tool calls
    if (role === "assistant" && Array.isArray(content)) {
      for (const block of content) {
        if (block.type !== "tool_use") continue;
        const input = block.input as Record<string, unknown> | undefined;
        if (!input) continue;

        if (
          (block.name === "Write" || block.name === "Edit") &&
          input.file_path
        ) {
          const fp = String(input.file_path);
          // Shorten to relative-ish path
          const short = fp.split("/").slice(-3).join("/");
          filesModified.add(short);
        }

        if (block.name === "Bash" && input.command) {
          const cmd = String(input.command).split("\n")[0].slice(0, 80);
          if (
            !cmd.startsWith("cat ") &&
            !cmd.startsWith("ls ") &&
            !cmd.startsWith("echo ")
          )
            commandsRun.push(cmd);
        }
      }
    }

    // Detect errors in tool results
    if (role === "user" && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "tool_result" && typeof block.text === "string") {
          if (
            block.text.includes("Error") ||
            block.text.includes("FAIL") ||
            block.text.includes("error:")
          )
            hadErrors = true;
        }
      }
    }
  }

  if (humanMessages.length === 0) return null;

  // Build summary
  const parts: string[] = [];

  // Topic from first human message
  const firstMsg = humanMessages[0].slice(0, 120).replace(/\n/g, " ").trim();
  parts.push(firstMsg);

  // Files modified
  const filesList = [...filesModified];
  if (filesList.length > 0) {
    const shown = filesList.slice(0, 4);
    const more = filesList.length > 4 ? ` +${filesList.length - 4} more` : "";
    parts.push(`Files: ${shown.join(", ")}${more}`);
  }

  // Notable commands (just count)
  if (commandsRun.length > 0) {
    parts.push(`${commandsRun.length} commands run`);
  }

  if (hadErrors) {
    parts.push("(encountered errors)");
  }

  return parts.join(" | ");
}
```

**Step 2: Integrate into `session-aggregator.ts`**

Import and call the generator. At top:

```typescript
import { generateAutoSummary } from "./summary-generator";
```

After the main `for` loop (before building enrichedTools), add:

```typescript
const autoSummary = generateAutoSummary(messages);
```

Update the return to use it:

```typescript
    autoSummary,
```

**Step 3: Store summary in indexer**

In `lib/parser/indexer.ts`, update the `updateSession` prepared statement to also set `summary`:

```sql
    UPDATE sessions SET
      message_count = ?,
      tool_call_count = ?,
      input_tokens = ?,
      output_tokens = ?,
      cache_read_tokens = ?,
      total_cost = ?,
      tool_usage = ?,
      model_usage = ?,
      enriched_tools = ?,
      summary = ?
    WHERE id = ?
```

And the `.run()` call:

```typescript
updateSession.run(
  stats.messageCount,
  stats.toolCallCount,
  stats.inputTokens,
  stats.outputTokens,
  stats.cacheReadTokens,
  stats.totalCost,
  JSON.stringify(stats.toolUsage),
  JSON.stringify(stats.modelUsage),
  JSON.stringify(stats.enrichedTools),
  stats.autoSummary,
  sess.id,
);
```

**Step 4: Display summary in SessionCard**

In `components/sessions/SessionCard.tsx`, prefer `summary` over `first_prompt`:

Replace line 32:

```tsx
<p className="line-clamp-2 text-sm mb-3 text-foreground/80 leading-relaxed">
  {session.summary || session.first_prompt || "No prompt recorded"}
</p>
```

Also display summary in the session detail page header (`app/sessions/[id]/page.tsx`). Replace lines 75-79:

```tsx
{
  (session.summary || session.first_prompt) && (
    <p className="text-xs text-muted-foreground line-clamp-2 max-w-lg">
      {session.summary || session.first_prompt}
    </p>
  );
}
```

**Step 5: Verify**

Run: `bunx tsc --noEmit`
Expected: No errors

Run: `bun run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add lib/parser/summary-generator.ts lib/parser/session-aggregator.ts lib/parser/indexer.ts components/sessions/SessionCard.tsx app/sessions/\[id\]/page.tsx
git commit -m "feat: auto-generate session summaries from JSONL content at index time"
```

---

## Task 8: Final Verification & Cleanup

**Step 1: Full type check and build**

Run: `bunx tsc --noEmit`
Run: `bun run build`

Both should pass.

**Step 2: End-to-end manual test**

1. Delete `~/.claude/dashboard.db`
2. Start dev server: `bun dev`
3. Trigger re-index
4. Verify:
   - Analytics page: Token chart shows real data
   - Analytics page: Project dropdown filters all charts
   - Session detail: Sidebar shows categorized tools (Skills, Agents, MCP, etc.)
   - Session cards: Show auto-generated summaries
   - Projects page: Lists all projects with costs
   - Project detail: Shows per-project charts, model breakdown, session list
5. Re-index again: should be near-instant (mtime skip from previous task)

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: final verification of dashboard enhancements"
```
