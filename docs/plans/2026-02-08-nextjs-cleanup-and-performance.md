# Next.js Cleanup & Performance Optimization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up the codebase by splitting god-components, fixing API route performance issues (N+1 queries, missing caching, unbounded results), and applying Next.js best practices (modularity, lazy loading).

**Architecture:** Extract inline sub-components from 1000+ line pages into standalone files. Fix the sessions N+1 query with a single JOIN. Add response caching to filesystem-backed API routes. Lazy-load heavy chart/canvas libraries. Use Zustand selectors to reduce re-renders.

**Tech Stack:** Next.js 15 App Router, React Query, Zustand, better-sqlite3, Recharts, @xyflow/react

---

## Phase 1: API Route Performance (High Impact, Backend)

### Task 1: Fix N+1 query in sessions groupByProject

The `GET /api/sessions?groupByProject=true` endpoint runs 1 query per project to get children. With 100 projects, that's 100+ queries.

**Files:**

- Modify: `app/api/sessions/route.ts:87-118`

**Step 1: Write the failing test**

```typescript
// __tests__/api/sessions-group.test.ts
import { describe, it, expect } from "vitest";

describe("GET /api/sessions?groupByProject=true", () => {
  it("returns grouped sessions without N+1 queries", async () => {
    const res = await fetch(
      "http://localhost:3000/api/sessions?groupByProject=true",
    );
    const data = await res.json();
    expect(res.ok).toBe(true);
    expect(data.grouped).toBeDefined();
    expect(Array.isArray(data.grouped)).toBe(true);
    // Each project should have a sessions array
    for (const group of data.grouped) {
      expect(Array.isArray(group.sessions)).toBe(true);
      expect(group.sessions.length).toBeLessThanOrEqual(10);
    }
  });
});
```

**Step 2: Run test to confirm current behavior works**

Run: `bun test __tests__/api/sessions-group.test.ts`
Expected: PASS (current behavior is correct, just slow)

**Step 3: Replace N+1 with single query + JS grouping**

Replace lines 87-118 in `app/api/sessions/route.ts`:

```typescript
if (groupByProject) {
  // Single query: projects with aggregate stats
  const projects = db
    .prepare(
      `
      SELECT p.*,
        COUNT(s.id) as session_count,
        COALESCE(SUM(s.total_cost), 0) as total_cost,
        COALESCE(SUM(s.input_tokens + s.output_tokens), 0) as total_tokens
      FROM projects p
      LEFT JOIN sessions s ON s.project_id = p.id AND s.message_count > 0
      GROUP BY p.id
      ORDER BY p.last_activity_at DESC
      LIMIT 200
    `,
    )
    .all() as Array<Record<string, unknown>>;

  // Single query: top 10 sessions per project using window function
  const projectIds = projects.map((p) => p.id);
  let allSessions: Array<Record<string, unknown>> = [];
  if (projectIds.length > 0) {
    const placeholders = projectIds.map(() => "?").join(",");
    allSessions = db
      .prepare(
        `
        SELECT * FROM (
          SELECT s.*,
            ROW_NUMBER() OVER (PARTITION BY s.project_id ORDER BY s.${sortColumn} ${direction}) as rn
          FROM sessions s
          WHERE s.project_id IN (${placeholders}) AND s.message_count > 0
        ) sub
        WHERE rn <= 10
      `,
      )
      .all(...projectIds) as Array<Record<string, unknown>>;
  }

  // Group sessions by project in JS
  const sessionsByProject = new Map<unknown, Array<Record<string, unknown>>>();
  for (const s of allSessions) {
    const list = sessionsByProject.get(s.project_id) || [];
    list.push(s);
    sessionsByProject.set(s.project_id, list);
  }

  const grouped = projects.map((project) => ({
    ...project,
    sessions: sessionsByProject.get(project.id) || [],
  }));

  const countQuery = `SELECT COUNT(*) as count FROM sessions${whereClause}`;
  const { count } = db.prepare(countQuery).get(...params) as { count: number };

  return jsonWithCache({ grouped, total: count }, "list");
}
```

**Step 4: Run test to verify it still passes**

Run: `bun test __tests__/api/sessions-group.test.ts`
Expected: PASS

**Step 5: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 6: Commit**

```bash
git add app/api/sessions/route.ts __tests__/api/sessions-group.test.ts
git commit -m "perf: fix N+1 query in sessions groupByProject with window function"
```

---

### Task 2: Add caching headers to filesystem-backed API routes

Several routes read from disk on every request (agents, plans, skills, hierarchy) with no caching. Add the existing `jsonWithCache` helper.

**Files:**

- Modify: `app/api/agents/route.ts` — wrap GET response with `jsonWithCache(..., "stats")`
- Modify: `app/api/agents/[name]/route.ts` — wrap GET with `jsonWithCache(..., "detail")`
- Modify: `app/api/agents/hierarchy/route.ts` — wrap GET with `jsonWithCache(..., "stats")`
- Modify: `app/api/plans/route.ts` — wrap GET with `jsonWithCache(..., "stats")`
- Modify: `app/api/plans/[name]/route.ts` — wrap GET with `jsonWithCache(..., "detail")`
- Modify: `app/api/analytics/filter-options/route.ts` — wrap GET with `jsonWithCache(..., "stats")`

**Step 1: For each route, replace `NextResponse.json(data)` with `jsonWithCache(data, profile)`**

Pattern for each file:

```typescript
// Before:
return NextResponse.json(agents);

// After:
import { jsonWithCache } from "@/lib/api/cache-headers";
return jsonWithCache(agents, "stats");
```

Use `"stats"` profile (60s max-age, 120s stale-while-revalidate) for list endpoints.
Use `"detail"` profile (10s max-age, 30s stale-while-revalidate) for individual items.

**Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: Clean

**Step 3: Commit**

```bash
git add app/api/agents/route.ts app/api/agents/\[name\]/route.ts app/api/agents/hierarchy/route.ts app/api/plans/route.ts app/api/plans/\[name\]/route.ts app/api/analytics/filter-options/route.ts
git commit -m "perf: add cache headers to filesystem-backed API routes"
```

---

### Task 3: Add LIMIT to unbounded project query and add error handling wrapper

**Files:**

- Modify: `app/api/analytics/tools/route.ts` — add LIMIT to tool queries
- Modify: `app/api/analytics/filter-options/route.ts` — add LIMIT to DISTINCT queries

**Step 1: In `analytics/tools/route.ts`, wrap the GET handler in try-catch and cap tool results**

Add at the top of GET handler:

```typescript
try {
  // ... existing logic
} catch (err) {
  console.error("Analytics tools error:", err);
  return NextResponse.json(
    { error: "Failed to fetch tool analytics" },
    { status: 500 },
  );
}
```

For the tools query, ensure LIMIT is applied (cap at 500 tools).

**Step 2: In `analytics/filter-options/route.ts`, add LIMIT 200 to DISTINCT queries**

Each `SELECT DISTINCT model FROM sessions` should get `LIMIT 200`.

**Step 3: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add app/api/analytics/tools/route.ts app/api/analytics/filter-options/route.ts
git commit -m "perf: add LIMIT to unbounded queries, error handling in analytics"
```

---

## Phase 2: Split God Components (High Impact, Frontend)

### Task 4: Extract inline sub-components from analytics/tools page (1093 lines)

The page has 5 inline component definitions (`SummaryBox`, `ToolRow`, `TotalsFooter`, `GroupedTable`, `GroupSection`) that should be standalone files.

**Files:**

- Create: `components/analytics/tools/SummaryBox.tsx`
- Create: `components/analytics/tools/ToolRow.tsx`
- Create: `components/analytics/tools/TotalsFooter.tsx`
- Create: `components/analytics/tools/GroupedTable.tsx`
- Create: `components/analytics/tools/GroupSection.tsx`
- Modify: `app/analytics/tools/page.tsx` — remove inline definitions, import from new files

**Step 1: Extract each function component to its own file**

For each inline component (starting at line 857):

1. Read the function body from the page
2. Create the new file with proper imports
3. Export the component

Example for `SummaryBox`:

```typescript
// components/analytics/tools/SummaryBox.tsx
interface SummaryBoxProps {
  label: string;
  value: string;
  sub?: string;
}

export function SummaryBox({ label, value, sub }: SummaryBoxProps) {
  // ... body from page.tsx:857-887
}
```

**Step 2: Update page.tsx to import extracted components**

```typescript
import { SummaryBox } from "@/components/analytics/tools/SummaryBox";
import { ToolRow } from "@/components/analytics/tools/ToolRow";
import { TotalsFooter } from "@/components/analytics/tools/TotalsFooter";
import { GroupedTable } from "@/components/analytics/tools/GroupedTable";
import { GroupSection } from "@/components/analytics/tools/GroupSection";
```

Remove the 5 inline function definitions.

**Step 3: Type check and verify**

Run: `npx tsc --noEmit`
Expected: Clean — all props should match since we're just moving code.

**Step 4: Commit**

```bash
git add components/analytics/tools/ app/analytics/tools/page.tsx
git commit -m "refactor: extract 5 inline components from analytics/tools page"
```

---

### Task 5: Extract GenericTable and panel components from explore page (773 lines)

**Files:**

- Create: `components/analytics/explore/GenericTable.tsx` (~130 lines, reusable)
- Create: `components/analytics/explore/ModelsPanel.tsx`
- Create: `components/analytics/explore/CostDistributionPanel.tsx`
- Modify: `app/analytics/explore/[panel]/page.tsx` — import from new files

**Step 1: Extract `GenericTable<T>` (line 99) to standalone file**

This is a generic, reusable table component that takes typed column definitions. It deserves its own file.

```typescript
// components/analytics/explore/GenericTable.tsx
"use client";
import {
  type ColumnDef,
  SortableHeader,
} from "@/components/analytics/ExploreTableLayout";
import { TablePagination } from "@/components/ui/table-pagination";
// ... extract full component from page.tsx:99-~200
```

**Step 2: Extract `ModelsPanel` (line 528) and `CostDistributionPanel` (line 609)**

Each is a self-contained panel component with its own data fetching.

**Step 3: Update page.tsx to import**

**Step 4: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add components/analytics/explore/ app/analytics/explore/\[panel\]/page.tsx
git commit -m "refactor: extract GenericTable and panel components from explore page"
```

---

### Task 6: Extract computation logic from analytics page (943 lines)

The main analytics page has date math, KPI calculations, comparison logic, and chart data transforms all inline.

**Files:**

- Create: `lib/analytics/date-utils.ts` — date range helpers, granularity calculation, period labels
- Create: `lib/analytics/kpi.ts` — KPI delta calculation, formatting
- Modify: `app/analytics/page.tsx` — import from new modules

**Step 1: Extract date utilities**

```typescript
// lib/analytics/date-utils.ts
import {
  startOfDay,
  endOfDay,
  subDays,
  format,
  differenceInDays,
} from "date-fns";

export function getDefaultDateRange(): { from: Date; to: Date } {
  return {
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  };
}

export function getGranularity(daysBetween: number): "hour" | "day" {
  return daysBetween > 7 ? "day" : "hour";
}

export function getCompareRange(
  from: Date,
  to: Date,
): { from: Date; to: Date } {
  const days = differenceInDays(to, from);
  return {
    from: startOfDay(subDays(from, days + 1)),
    to: endOfDay(subDays(from, 1)),
  };
}

export function getPeriodLabels(
  from: Date,
  to: Date,
  compareFrom: Date,
  compareTo: Date,
) {
  return {
    a: `${format(from, "MMM d")} – ${format(to, "MMM d")}`,
    b: `${format(compareFrom, "MMM d")} – ${format(compareTo, "MMM d")}`,
  };
}
```

**Step 2: Extract KPI computation**

```typescript
// lib/analytics/kpi.ts
export function computeDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return ((current - previous) / previous) * 100;
}
```

**Step 3: Update analytics page to import from new modules**

Replace inline computation with:

```typescript
import {
  getDefaultDateRange,
  getGranularity,
  getCompareRange,
  getPeriodLabels,
} from "@/lib/analytics/date-utils";
import { computeDelta } from "@/lib/analytics/kpi";
```

**Step 4: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add lib/analytics/ app/analytics/page.tsx
git commit -m "refactor: extract analytics date/KPI logic to lib/analytics/"
```

---

## Phase 3: Lazy Loading & Bundle Size (Medium Impact)

### Task 7: Lazy-load heavy chart components

Recharts and ReactFlow are large libraries loaded eagerly. Wrap them in `next/dynamic`.

**Files:**

- Modify: `app/analytics/page.tsx` — dynamic import chart components
- Modify: `components/agents/workspace/AgentsWorkspace.tsx` — dynamic import WorkspaceCanvas

**Step 1: Add dynamic imports for chart components in analytics page**

At the top of `app/analytics/page.tsx`, replace direct imports with dynamic:

```typescript
import dynamic from "next/dynamic";

const CostChart = dynamic(
  () => import("@/components/analytics/CostChart").then((m) => m.CostChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const TokenChart = dynamic(
  () => import("@/components/analytics/TokenChart").then((m) => m.TokenChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const ActivityChart = dynamic(
  () => import("@/components/analytics/ActivityChart").then((m) => m.ActivityChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
```

**Step 2: Dynamic import WorkspaceCanvas (contains ReactFlow)**

In `AgentsWorkspace.tsx`:

```typescript
import dynamic from "next/dynamic";

const WorkspaceCanvas = dynamic(
  () => import("./WorkspaceCanvas").then((m) => m.WorkspaceCanvas),
  { ssr: false, loading: () => <Skeleton className="flex-1" /> }
);
```

Remove the direct `import { WorkspaceCanvas } from "./WorkspaceCanvas"`.

**Step 3: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add app/analytics/page.tsx components/agents/workspace/AgentsWorkspace.tsx
git commit -m "perf: lazy-load Recharts and ReactFlow components"
```

---

### Task 8: Add Zustand selectors to reduce re-renders

Components subscribe to full store state but only use a slice. Use selectors.

**Files:**

- Modify: `components/agents/workspace/WorkspaceCanvas.tsx` — use selector
- Modify: `components/agents/workspace/InventorySidebar.tsx` — use selector
- Modify: `components/agents/workspace/DetailPanel.tsx` — use selector

**Step 1: Replace full store destructuring with selectors**

```typescript
// Before (re-renders on ANY store change):
const { canvasMode, chainSequence, addToChain } = useWorkspaceStore();

// After (only re-renders when these specific values change):
const canvasMode = useWorkspaceStore((s) => s.canvasMode);
const chainSequence = useWorkspaceStore((s) => s.chainSequence);
const addToChain = useWorkspaceStore((s) => s.addToChain);
```

Apply this pattern to all `useWorkspaceStore()` and `useConsoleLayoutStore()` calls that destructure a small subset.

**Step 2: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add components/agents/workspace/ stores/
git commit -m "perf: use Zustand selectors to reduce unnecessary re-renders"
```

---

## Phase 4: Modularity Cleanup (Lower Priority)

### Task 9: Extract keyboard/swarm logic from home page (488 lines)

The home page (`app/page.tsx`) has 3 useEffect blocks and swarm session management mixed into the page component.

**Files:**

- Create: `hooks/useSwarmSession.ts` — swarm modal event listener + start handler
- Modify: `app/page.tsx` — import and use new hook

**Step 1: Extract swarm session logic to hook**

```typescript
// hooks/useSwarmSession.ts
import { useState, useEffect, useCallback } from "react";
import type { SwarmConfig } from "@/types/swarm";

export function useSwarmSession(
  wsRef: React.RefObject<WebSocket | null>,
  activeId: string | null,
) {
  const [swarmModalOpen, setSwarmModalOpen] = useState(false);

  useEffect(() => {
    const handler = () => setSwarmModalOpen(true);
    window.addEventListener("console:open-swarm-modal", handler);
    return () =>
      window.removeEventListener("console:open-swarm-modal", handler);
  }, []);

  const handleStartSwarm = useCallback(
    (config: SwarmConfig, mode: "use-context" | "fresh" = "use-context") => {
      if (!wsRef.current) return;
      if (mode === "use-context" && activeId) {
        wsRef.current.send(
          JSON.stringify({
            type: "start-swarm-from-session",
            consoleSessionId: activeId,
            config,
          }),
        );
      } else {
        wsRef.current.send(JSON.stringify({ type: "create-swarm", config }));
      }
      setSwarmModalOpen(false);
    },
    [activeId, wsRef],
  );

  return { swarmModalOpen, setSwarmModalOpen, handleStartSwarm };
}
```

**Step 2: Update page.tsx to use the hook**

Replace inline state + useEffect + callback with:

```typescript
const { swarmModalOpen, setSwarmModalOpen, handleStartSwarm } = useSwarmSession(
  wsRef,
  activeId,
);
```

**Step 3: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add hooks/useSwarmSession.ts app/page.tsx
git commit -m "refactor: extract swarm session logic from home page to hook"
```

---

### Task 10: Extract date/filter logic from usage page (371 lines)

**Files:**

- Modify: `app/usage/page.tsx` — reuse `lib/analytics/date-utils.ts` from Task 6
- The date range/period calculation duplicated in the usage page should use the shared module

**Step 1: Replace inline date calculations with imports from `lib/analytics/date-utils.ts`**

The usage page has its own date period calculation (lines 51-67) that duplicates what we extracted in Task 6. Replace with shared imports.

**Step 2: Type check and commit**

Run: `npx tsc --noEmit`

```bash
git add app/usage/page.tsx
git commit -m "refactor: reuse shared date-utils in usage page"
```

---

## Verification Checklist

After all tasks:

1. `npx tsc --noEmit` — clean
2. `bun test` — all tests pass
3. `bun run lint` — no new errors (pre-existing ones are fine)
4. Load `/analytics` — charts render, no console errors
5. Load `/analytics/tools` — table renders correctly
6. Load `/analytics/explore/models` — table + pagination work
7. Load `/agents` — canvas renders, workspace features work
8. Load `/` (home) — console + swarm features work
9. Network tab: verify Cache-Control headers on `/api/agents`, `/api/plans`
10. Network tab: verify `/api/sessions?groupByProject=true` is faster (single round-trip vs N+1)

---

## Impact Summary

| Area                    | Before                              | After                                    |
| ----------------------- | ----------------------------------- | ---------------------------------------- |
| Sessions groupByProject | N+1 queries (100+ for 100 projects) | 2 queries total                          |
| Filesystem API routes   | No caching, disk read every request | 60s cache + stale-while-revalidate       |
| analytics/tools page    | 1093 lines, 5 inline components     | ~250 lines + 5 focused component files   |
| analytics/explore page  | 773 lines, 3 inline components      | ~300 lines + 3 component files           |
| analytics page          | 943 lines, inline date/KPI logic    | ~700 lines + shared lib modules          |
| Chart bundle            | Loaded eagerly on all routes        | Lazy-loaded, ~100KB less on initial load |
| ReactFlow bundle        | Loaded eagerly on agents page       | Lazy-loaded with skeleton fallback       |
| Zustand re-renders      | Full-store subscriptions            | Targeted selectors                       |
