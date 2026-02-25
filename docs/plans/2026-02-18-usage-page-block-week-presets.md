# Usage Page: Block + Week Presets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the arbitrary time presets (Last 1h, 4h, etc.) on the new JSONL-based usage page with Claude-aligned presets: "This Block" and "This Week", plus keep custom datetime range and longer presets (7d, 30d).

**Architecture:** The usage page already has `UsageDashboard` consuming `from`/`to` ISO strings. We need to compute block and week boundaries using the same logic as `BlockUsageCard` and `WeekUsageCard` — namely `useBlockUsage` (which derives block start from settings + reset minutes) and week bounds from either live Anthropic data or local settings. The page will default to "This Block" and show a live countdown when available.

**Tech Stack:** React, TanStack Query, date-fns, existing hooks (`useBlockUsage`, `useRealUsage`, settings API)

---

## Background: How Block/Week Boundaries Work

### Block
- `resetMinutes` from settings (default: 300 = 5 hours)
- Block start = `now - resetMinutes` (unless `blockStartOverride` is set in settings)
- The `/api/statusline` endpoint computes this server-side
- `useBlockUsage()` returns `block.startedAt` and `block.resetsAt`
- Live Anthropic data (`useRealUsage`) provides a "Current session" section with `resetsAt`

### Week
- `WeekUsageCard` has `computeWeekBounds(weekStartDay, weekStartHour)` — uses settings
- Prefers live Anthropic week section (`resetsAt` → derive start as `resetsAt - 7 days`)
- Settings: `statuslineWeekStartDay` (0=Sun), `statuslineWeekStartHour` (0-23)

### Key Files
- `hooks/useAnalytics.ts` — `useBlockUsage()`, `useRealUsage()`, `useAnalytics()`, `useModelUsage()`
- `components/usage/BlockUsageCard.tsx` — block boundary derivation pattern
- `components/usage/WeekUsageCard.tsx` — `computeWeekBounds()` function, `useWeekSettings()`
- `app/usage/page.tsx` — current page with arbitrary presets
- `components/usage/UsageDashboard.tsx` — dashboard component (no changes needed)

---

## Task 1: Extract `computeWeekBounds` to a shared utility

The `computeWeekBounds` function currently lives inside `WeekUsageCard.tsx`. We need it in `page.tsx` too.

**Files:**
- Modify: `components/usage/WeekUsageCard.tsx` (remove function, import from new location)
- Create: `lib/usage/time-bounds.ts`

**Step 1: Create the shared utility**

Create `lib/usage/time-bounds.ts`:

```ts
import { startOfDay, subDays, addDays, format } from "date-fns";

export function computeWeekBounds(weekStartDay: number, weekStartHour: number) {
  const now = new Date();
  const daysAgo = (now.getDay() - weekStartDay + 7) % 7;
  const candidate = startOfDay(subDays(now, daysAgo));
  candidate.setHours(weekStartHour);
  if (candidate > now) {
    candidate.setDate(candidate.getDate() - 7);
  }
  const weekStart = candidate;
  const nextReset = addDays(weekStart, 7);
  return {
    weekFrom: format(weekStart, "yyyy-MM-dd"),
    weekTo: format(nextReset, "yyyy-MM-dd"),
    weekStartDate: weekStart,
    weekEndDate: nextReset,
    nextResetDate: nextReset,
  };
}
```

**Step 2: Update `WeekUsageCard.tsx` to import from shared utility**

Replace the local `computeWeekBounds` function with:
```ts
import { computeWeekBounds } from "@/lib/usage/time-bounds";
```

Delete the local `computeWeekBounds` function (lines 128-146 of `WeekUsageCard.tsx`).

**Step 3: Verify no type errors**

Run: `bunx tsc --noEmit 2>&1 | grep -E 'usage|time-bounds'`
Expected: No errors from our files

**Step 4: Commit**

```bash
git add lib/usage/time-bounds.ts components/usage/WeekUsageCard.tsx
git commit -m "refactor: extract computeWeekBounds to shared utility"
```

---

## Task 2: Add `useWeekSettings` hook export

`useWeekSettings()` is currently a local function inside `WeekUsageCard.tsx`. We need it in the page too.

**Files:**
- Modify: `components/usage/WeekUsageCard.tsx` (export the hook or move to `hooks/useAnalytics.ts`)

**Step 1: Move `useWeekSettings` to `hooks/useAnalytics.ts`**

Add to the bottom of `hooks/useAnalytics.ts`:

```ts
export interface WeekSettings {
  statuslineWeekStartDay?: number;
  statuslineWeekStartHour?: number;
  statuslineWeeklyBudget?: number;
  statuslineWeeklyTokenBudget?: number;
  statuslinePlan?: string;
  statuslineResetMinutes?: number;
}

export function useWeekSettings() {
  return useQuery({
    queryKey: ["week-settings"],
    queryFn: async (): Promise<WeekSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    staleTime: 30_000,
  });
}
```

**Step 2: Update `WeekUsageCard.tsx` imports**

Remove the local `WeekSettings` interface and `useWeekSettings` function. Import from hooks:

```ts
import {
  useAnalytics,
  useModelUsage,
  useUpdateBlockSettings,
  useRealUsage,
  useWeekSettings,       // <-- add
  type WeekSettings,      // <-- add (if needed for typing)
  PLAN_BUDGETS,
  // ... rest of existing imports
} from "@/hooks/useAnalytics";
```

**Step 3: Verify no type errors**

Run: `bunx tsc --noEmit 2>&1 | grep -E 'usage|WeekSettings'`
Expected: No errors

**Step 4: Commit**

```bash
git add hooks/useAnalytics.ts components/usage/WeekUsageCard.tsx
git commit -m "refactor: move useWeekSettings to shared hooks"
```

---

## Task 3: Rewrite `app/usage/page.tsx` with Block + Week presets

Replace "Last 1h, 4h, 24h, 7d, 30d" with "This Block, This Week, Last 7d, Last 30d, Custom".

**Files:**
- Modify: `app/usage/page.tsx`

**Step 1: Rewrite the page**

Key changes:
- Import `useBlockUsage`, `useRealUsage`, `useWeekSettings` from hooks
- Import `computeWeekBounds` from the shared utility
- Define presets as `"block" | "week" | "7d" | "30d" | "custom"`
- Default to `"block"`
- For "block": derive `from`/`to` from `useBlockUsage().data.block.startedAt/resetsAt`
- For "week": derive from live Anthropic week section or `computeWeekBounds()`
- Show block reset countdown when block preset is active
- Show week range label when week preset is active
- Keep datetime-local inputs for custom, but hide them unless "Custom" is selected or user clicks a datetime input
- Keep "Usage derived from local JSONL session files" note

The page should render:

```
[This Block] [This Week] [Last 7d] [Last 30d] [Custom]
Block: 2:15 PM – 7:15 PM · Resets in 2h 34m          (shown when block active)
From: [____] To: [____]                                 (shown when custom active)
─────────────────────────────────────────────────────
Usage derived from local JSONL session files

<UsageDashboard from={from} to={to} />
```

```tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { UsageDashboard } from "@/components/usage/UsageDashboard";
import { useBlockUsage, useRealUsage, useWeekSettings } from "@/hooks/useAnalytics";
import { computeWeekBounds } from "@/lib/usage/time-bounds";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Preset = "block" | "week" | "7d" | "30d" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "block", label: "This Block" },
  { id: "week", label: "This Week" },
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "custom", label: "Custom" },
];

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ResetCountdown({ resetsAt }: { resetsAt: string }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = new Date(resetsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("resetting..."); return; }
      const hours = Math.floor(diff / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      setRemaining(hours > 0 ? `${hours}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetsAt]);
  return <span className="tabular-nums">{remaining}</span>;
}

export default function UsagePage() {
  const [activePreset, setActivePreset] = useState<Preset>("block");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Block data
  const { data: realUsage } = useRealUsage();
  const liveBlockResetsAt = useMemo(() => {
    if (!realUsage?.sections?.length) return undefined;
    return realUsage.sections[0]?.resetsAt ?? undefined;
  }, [realUsage]);
  const { data: blockData } = useBlockUsage(undefined, liveBlockResetsAt, true);

  // Week data
  const { data: weekSettings } = useWeekSettings();
  const weekBounds = useMemo(() => {
    // Prefer live Anthropic week section
    const weekSection = realUsage?.sections?.find(
      (s) => s.label.toLowerCase().includes("week"),
    );
    if (weekSection?.resetsAt) {
      const end = new Date(weekSection.resetsAt);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        startDate: start,
        endDate: end,
      };
    }
    // Fallback to local settings
    const day = weekSettings?.statuslineWeekStartDay ?? 0;
    const hour = weekSettings?.statuslineWeekStartHour ?? 0;
    const bounds = computeWeekBounds(day, hour);
    return {
      from: bounds.weekFrom,
      to: bounds.weekTo,
      startDate: bounds.weekStartDate,
      endDate: bounds.weekEndDate,
    };
  }, [realUsage, weekSettings]);

  // Compute from/to based on active preset
  const { from, to } = useMemo(() => {
    switch (activePreset) {
      case "block": {
        const blockFrom = blockData?.block.startedAt
          ?? new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
        const blockTo = blockData?.block.resetsAt ?? new Date().toISOString();
        return { from: blockFrom, to: blockTo };
      }
      case "week":
        return { from: weekBounds.from, to: weekBounds.to };
      case "7d": {
        const now = new Date();
        return {
          from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: now.toISOString(),
        };
      }
      case "30d": {
        const now = new Date();
        return {
          from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: now.toISOString(),
        };
      }
      case "custom":
        return {
          from: customFrom
            ? new Date(customFrom).toISOString()
            : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          to: customTo ? new Date(customTo).toISOString() : new Date().toISOString(),
        };
    }
  }, [activePreset, blockData, weekBounds, customFrom, customTo]);

  const displayFrom = customFrom || toLocalDatetime(new Date(from));
  const displayTo = customTo || toLocalDatetime(new Date(to));

  return (
    <PageContainer>
      <div className="space-y-3">
        {/* Preset buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => setActivePreset(preset.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activePreset === preset.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Block context line */}
        {activePreset === "block" && blockData?.block.startedAt && blockData?.block.resetsAt && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Block{" "}
              <span className="text-foreground tabular-nums">
                {format(new Date(blockData.block.startedAt), "h:mm a")}
              </span>
              {" – "}
              <span className="text-foreground tabular-nums">
                {format(new Date(blockData.block.resetsAt), "h:mm a")}
              </span>
            </span>
            <span className="text-border">·</span>
            <span>
              Resets in{" "}
              <span className="text-foreground font-medium">
                <ResetCountdown resetsAt={blockData.block.resetsAt} />
              </span>
            </span>
          </div>
        )}

        {/* Week context line */}
        {activePreset === "week" && (
          <div className="text-xs text-muted-foreground">
            <span className="text-foreground tabular-nums">
              {format(weekBounds.startDate, "EEE MMM d, h:mm a")}
            </span>
            {" – "}
            <span className="text-foreground tabular-nums">
              {format(weekBounds.endDate, "EEE MMM d, h:mm a")}
            </span>
          </div>
        )}

        {/* Custom datetime inputs (only when custom preset active) */}
        {activePreset === "custom" && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              From
              <input
                type="datetime-local"
                value={displayFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-card text-foreground text-xs font-mono"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              To
              <input
                type="datetime-local"
                value={displayTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 px-2 rounded-md border border-border bg-card text-foreground text-xs font-mono"
              />
            </label>
          </div>
        )}

        <p className="text-micro text-muted-foreground">
          Usage derived from local JSONL session files
        </p>
      </div>

      <UsageDashboard from={from} to={to} />
    </PageContainer>
  );
}
```

**Step 2: Verify no type errors**

Run: `bunx tsc --noEmit 2>&1 | grep usage`
Expected: No errors from `app/usage/page.tsx`

**Step 3: Manual verification**

1. Open `/usage` → should default to "This Block" with block time range and countdown
2. Click "This Week" → should show week range, KPIs update
3. Click "Last 7d" / "Last 30d" → standard time ranges
4. Click "Custom" → datetime-local inputs appear
5. All presets should update the dashboard data correctly

**Step 4: Commit**

```bash
git add app/usage/page.tsx
git commit -m "feat: replace usage presets with This Block / This Week"
```

---

## Task 4: Run linting and type-check

**Step 1: Type check**

Run: `bunx tsc --noEmit`
Expected: Only pre-existing marketplace errors (3 known errors in `app/api/marketplace/`)

**Step 2: Lint**

Run: `bunx next lint`
Expected: No errors in modified files

**Step 3: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: lint and type errors from usage page refactor"
```

---

## Summary of All Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/usage/time-bounds.ts` | Create | Shared `computeWeekBounds()` utility |
| `hooks/useAnalytics.ts` | Modify | Add exported `useWeekSettings()` hook + `WeekSettings` interface |
| `components/usage/WeekUsageCard.tsx` | Modify | Import shared `computeWeekBounds` and `useWeekSettings` instead of local copies |
| `app/usage/page.tsx` | Modify | Replace arbitrary presets with Block/Week/7d/30d/Custom, add block countdown and week range display |

**No backend changes.** All data comes from existing APIs.
