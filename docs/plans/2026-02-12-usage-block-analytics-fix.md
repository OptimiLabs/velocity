# Usage Block Analytics — Scope & Timezone Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the Block Usage page so Today, Block, and Model Usage sections display consistent, correctly-scoped data.

**Architecture:** The `/api/statusline` endpoint returns block, daily, and model data — but "Today" uses UTC dates while "Model Usage" uses the block time window, creating confusing mismatches. We fix the timezone, add a per-scope model breakdown, remove All Time (available in Calendar view), and display clear block time ranges.

**Tech Stack:** Next.js API route (better-sqlite3), React component (BlockUsageCard), TanStack Query types

---

## Bugs Being Fixed

| Bug                                   | Root Cause                                                       | Impact                        |
| ------------------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| Model Usage sessions > Today sessions | Model Usage queries block window; Today queries UTC date         | Numbers contradict each other |
| Today undercounts sessions            | `DATE('now')` is UTC — PST user loses sessions before 4 PM local | Missing ~16h of "today"       |
| Per-model sessions sum > total        | Multi-model sessions counted once per model, no explanation      | Confusing                     |

## Files Overview

| File                                  | Action                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `app/api/statusline/route.ts`         | Fix timezone, add daily models, drop `allTime`, add block end time |
| `hooks/useAnalytics.ts`               | Update `BlockUsageData` type                                       |
| `components/usage/BlockUsageCard.tsx` | Remove All Time card, add Today model breakdown, show block range  |

---

### Task 1: Fix Today Query Timezone in API

**Files:**

- Modify: `app/api/statusline/route.ts:77-100`

**Step 1: Fix the `daily` SQL query to use local time**

Replace:

```typescript
const daily = db
  .prepare(
    `
    SELECT
      COUNT(DISTINCT id) as session_count,
      COALESCE(SUM(message_count), 0) as message_count,
      COALESCE(SUM(total_cost), 0) as total_cost,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens
    FROM sessions
    WHERE DATE(created_at) = DATE('now')
    `,
  )
  .get() as { ... };
```

With:

```typescript
const daily = db
  .prepare(
    `
    SELECT
      COUNT(DISTINCT id) as session_count,
      COALESCE(SUM(message_count), 0) as message_count,
      COALESCE(SUM(total_cost), 0) as total_cost,
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
      COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens
    FROM sessions
    WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
    `,
  )
  .get() as { ... };
```

**Step 2: Verify the fix works**

Run: `curl http://localhost:3000/api/statusline | jq '.daily'`
Expected: `session_count` should now include sessions from the full local calendar day, not just since midnight UTC.

**Step 3: Commit**

```bash
git add app/api/statusline/route.ts
git commit -m "fix: use local timezone for Today query in block usage"
```

---

### Task 2: Add Today Model Breakdown to API

**Files:**

- Modify: `app/api/statusline/route.ts:103-143`

**Step 1: Add a `dailyModels` query after the existing `blockModels` query**

After the `blockModels` processing loop (after line ~143), add:

```typescript
// Per-model breakdown for today (local time)
const dailyModelRows = db
  .prepare(
    `
    SELECT model_usage
    FROM sessions
    WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')
      AND model_usage != '{}'
  `,
  )
  .all() as { model_usage: string }[];

const dailyModelMap = new Map<
  string,
  {
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  }
>();
for (const row of dailyModelRows) {
  try {
    const usage = JSON.parse(row.model_usage) as Record<
      string,
      {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        input_tokens?: number;
        output_tokens?: number;
        cache_read_tokens?: number;
      }
    >;
    for (const [model, tokens] of Object.entries(usage)) {
      const existing = dailyModelMap.get(model) ?? {
        sessions: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
      };
      existing.sessions += 1;
      existing.inputTokens += tokens.inputTokens ?? tokens.input_tokens ?? 0;
      existing.outputTokens += tokens.outputTokens ?? tokens.output_tokens ?? 0;
      existing.cacheReadTokens +=
        tokens.cacheReadTokens ?? tokens.cache_read_tokens ?? 0;
      dailyModelMap.set(model, existing);
    }
  } catch {}
}

const dailyModels = [...dailyModelMap.entries()]
  .map(([model, data]) => ({ model, ...data }))
  .sort((a, b) => b.outputTokens - a.outputTokens);
```

**Step 2: Include `dailyModels` in the JSON response**

In the `NextResponse.json(...)` call, add `dailyModels` alongside `models`:

```typescript
return NextResponse.json({
  block: { ... },
  models,          // block-scoped (existing)
  dailyModels,     // today-scoped (new)
  topSessions,
  daily: { ... },
  // ... rest unchanged
});
```

**Step 3: Remove the `allTime` query and response field**

Delete the `allTime` query block (lines ~172-194) and remove `allTime` from the response object. The All Time data is available in the Calendar view and not needed here.

**Step 4: Verify**

Run: `curl http://localhost:3000/api/statusline | jq '.dailyModels'`
Expected: Array of model objects with sessions/tokens scoped to today (local time). The sum of `dailyModels[*].sessions` should be >= `daily.sessions` (because multi-model sessions are counted per model).

**Step 5: Commit**

```bash
git add app/api/statusline/route.ts
git commit -m "feat: add today model breakdown, remove allTime from block usage API"
```

---

### Task 3: Update BlockUsageData TypeScript Type

**Files:**

- Modify: `hooks/useAnalytics.ts:497-536`

**Step 1: Add `dailyModels` and remove `allTime` from the interface**

```typescript
export interface BlockUsageData {
  block: {
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cost: number;
    startedAt: string | null;
    resetsAt: string | null;
  };
  models: BlockModelUsage[]; // block-scoped
  dailyModels: BlockModelUsage[]; // today-scoped (NEW)
  topSessions: BlockSession[];
  daily: {
    sessions: number;
    messages: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
  // allTime removed — available in Calendar view
  blockBudget: number;
  tokenBudget: number;
  plan: string | null;
  extraCredits: number;
  alertAt: number | null;
  resetMinutes: number;
  blockStartOverride: string | null;
  updatedAt: string;
}
```

**Step 2: Run type check**

Run: `bunx tsc --noEmit`
Expected: Type errors in `BlockUsageCard.tsx` where `data.allTime` is referenced. This is expected — we fix it in Task 4.

**Step 3: Commit**

```bash
git add hooks/useAnalytics.ts
git commit -m "chore: update BlockUsageData type — add dailyModels, remove allTime"
```

---

### Task 4: Update BlockUsageCard UI

**Files:**

- Modify: `components/usage/BlockUsageCard.tsx:511-616`

This task has multiple sub-steps to reshape the card layout.

**Step 1: Show block time range in the header**

In the block header section (~line 187-208), the block start time and reset countdown are already shown. Enhance by also showing the block end time explicitly. Find the `Started` span and update to show a range:

Replace the started/resets display with a unified block range:

```tsx
{
  data.block.startedAt && data.block.resetsAt && (
    <>
      <span className="text-border">|</span>
      <span className="text-muted-foreground">
        Block{" "}
        <span className="text-foreground tabular-nums">
          {format(new Date(data.block.startedAt), "h:mm a")}
        </span>
        {" – "}
        <span className="text-foreground tabular-nums">
          {format(new Date(data.block.resetsAt), "h:mm a")}
        </span>
        {data.blockStartOverride && (
          <span className="text-muted-foreground/50 ml-1">(pinned)</span>
        )}
      </span>
      <span className="text-border">|</span>
      <span className="text-muted-foreground">
        Resets in{" "}
        <span className="text-foreground font-medium">
          <ResetCountdown resetsAt={data.block.resetsAt} />
        </span>
      </span>
    </>
  );
}
```

This replaces the separate "Started" and "Resets in" displays.

**Step 2: Remove the All Time card**

Replace the Today + All Time 2-col grid (lines ~511-566) with just the Today card:

```tsx
{
  /* Today totals */
}
<Card className="bg-card">
  <CardHeader className="pb-1.5">
    <div className="flex items-center justify-between">
      <CardTitle className="text-section-title">Today</CardTitle>
      {data.updatedAt && (
        <span className="text-micro text-muted-foreground/50 tabular-nums">
          as of {format(new Date(data.updatedAt), "h:mm a")}
        </span>
      )}
    </div>
  </CardHeader>
  <CardContent>
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
      <div>
        <div className="text-muted-foreground">Sessions</div>
        <div className="text-lg font-semibold tabular-nums">
          {data.daily.sessions.toLocaleString()}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground">
          {isMaxPlan ? "API-equiv" : "Est. Cost"}
        </div>
        <div
          className={cn(
            "text-lg font-semibold tabular-nums",
            isMaxPlan && "text-muted-foreground",
          )}
        >
          {formatCost(data.daily.cost)}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground flex items-center gap-1">
          <ArrowDownToLine size={10} /> Input
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatTokens(data.daily.inputTokens)}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground flex items-center gap-1">
          <ArrowUpFromLine size={10} /> Output
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatTokens(data.daily.outputTokens)}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground flex items-center gap-1">
          <BookOpen size={10} /> Cache Read
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatTokens(data.daily.cacheReadTokens)}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground flex items-center gap-1">
          <Layers size={10} /> Cache Write
        </div>
        <div className="text-sm font-semibold tabular-nums">
          {formatTokens(data.daily.cacheWriteTokens)}
        </div>
      </div>
    </div>
  </CardContent>
</Card>;
```

**Step 3: Add Today Model Breakdown**

After the Today card, add a Today model breakdown (using `data.dailyModels`). Render it in a 2-col grid alongside the today card, or below it. Use the same model rendering pattern as the existing "Model Usage" card but with today's data:

```tsx
{
  /* Today + Today Models — 2 col grid */
}
<div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
  {/* Today summary card (from Step 2 above) */}

  {/* Today model breakdown */}
  {data.dailyModels.length > 0 && (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Today by Model</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.dailyModels.map((m) => {
            const mTotal = m.inputTokens + m.outputTokens + m.cacheReadTokens;
            const allModelsTotal = data.dailyModels.reduce(
              (s, x) => s + x.inputTokens + x.outputTokens + x.cacheReadTokens,
              0,
            );
            const pct =
              allModelsTotal > 0
                ? Math.round((mTotal / allModelsTotal) * 100)
                : 0;
            return (
              <div key={m.model} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{shortenModel(m.model)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatTokens(mTotal)} · {m.sessions} session
                    {m.sessions !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex gap-4 text-meta">
                  <span>In: {formatTokens(m.inputTokens)}</span>
                  <span>Out: {formatTokens(m.outputTokens)}</span>
                  <span>Cache: {formatTokens(m.cacheReadTokens)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  )}
</div>;
```

**Step 4: Label existing Model Usage as "Block Models"**

In the existing Model Usage card (~line 573), change the title from "Model Usage" to "Block Models":

```tsx
<CardTitle className="text-section-title">Block Models</CardTitle>
```

**Step 5: Run type check and dev server**

Run: `bunx tsc --noEmit && bun dev`
Expected: No type errors. The Block Usage page should now show:

1. Block KPI cards (block-scoped)
2. Today summary + Today by Model (side by side)
3. Block Models + Sessions in Block (side by side)

**Step 6: Commit**

```bash
git add components/usage/BlockUsageCard.tsx
git commit -m "feat: restructure block usage — today models, block range, remove all time"
```

---

### Task 5: Final Verification & Cleanup

**Step 1: Run linter and type check**

Run: `bunx tsc --noEmit`
Expected: Clean pass.

**Step 2: Run tests**

Run: `bun test`
Expected: All tests pass.

**Step 3: Manual verification checklist**

Open the Usage page in the browser and verify:

- [ ] "Today" card shows sessions from midnight local time (not UTC)
- [ ] "Today by Model" shows per-model breakdown matching Today's total scope
- [ ] "Block Models" is clearly labeled and shows block-window data
- [ ] Block header shows time range like "Block 2:25 PM – 7:25 PM"
- [ ] Reset countdown still works
- [ ] "All Time" card is gone (users use Calendar view for this)
- [ ] Per-model session counts (which sum > total) are visually distinguishable from total sessions
- [ ] No `allTime` TypeScript errors anywhere

**Step 4: Commit final cleanup if needed**

```bash
git add -A
git commit -m "chore: cleanup after block usage restructure"
```
