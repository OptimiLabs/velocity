"use client";

import { useState, useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTokens, formatCost, getModelTier, TIER_LABELS, TIER_COLORS, type ModelTier } from "@/lib/cost/calculator";
import {
  useAnalytics,
  useModelUsage,
  useUpdateBlockSettings,
  useWeekSettings,
  useRealUsage,
  PLAN_BUDGETS,
  PLAN_TOKEN_BUDGETS,
  PLAN_WEEKLY_BUDGETS,
  PLAN_WEEKLY_TOKEN_BUDGETS,
  PLAN_LABELS,
  MAX_PLANS,
  TIER_TOKEN_BUDGETS,
} from "@/hooks/useAnalytics";
import { useSessions } from "@/hooks/useSessions";
import {
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  BookMarked,
  Layers,
  MessageSquare,
  Wrench,
  Settings2,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import Link from "next/link";
import { KPICard } from "@/components/layout/KPICard";
import { format } from "date-fns";
import { computeWeekBounds } from "@/lib/usage/time-bounds";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function shortenModel(model: string): string {
  if (model.includes("opus-4-6")) return "Opus 4.6";
  if (model.includes("opus-4-5")) return "Opus 4.5";
  if (model.includes("opus-4-1")) return "Opus 4.1";
  if (model.includes("opus-4")) return "Opus 4";
  if (model.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (model.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (model.includes("sonnet-4")) return "Sonnet 4";
  if (model.includes("3-5-sonnet")) return "Sonnet 3.5";
  if (model.includes("haiku-4-5")) return "Haiku 4.5";
  if (model.includes("3-5-haiku")) return "Haiku 3.5";
  if (model.includes("3-haiku")) return "Haiku 3";
  if (model.includes("3-opus")) return "Opus 3";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

function shortenPath(p: string | null): string {
  if (!p) return "";
  return p
    .replace(/^\/Users\/[^/]+\//, "~/")
    .split("/")
    .slice(-2)
    .join("/");
}

export function WeekUsageCard({ headerLeft }: { headerLeft?: ReactNode }) {
  const { data: settings, isLoading: settingsLoading } = useWeekSettings();
  const { data: realUsage } = useRealUsage();
  const updateSettings = useUpdateBlockSettings();
  const [showConfig, setShowConfig] = useState(false);

  const weekStartDay = settings?.statuslineWeekStartDay ?? 0;
  const weekStartHour = settings?.statuslineWeekStartHour ?? 0;
  const resetMinutes = settings?.statuslineResetMinutes ?? 300;
  const plan = settings?.statuslinePlan ?? null;
  const isMaxPlan = plan ? MAX_PLANS.has(plan) : false;

  // Blocks per week — only used as ultimate fallback for budget
  const blocksPerWeek = useMemo(
    () => ((24 * 60) / resetMinutes) * 7,
    [resetMinutes],
  );

  // Derive week bounds from Anthropic's live "Current week" section
  const liveWeekSection = useMemo(() => {
    if (!realUsage?.sections?.length) return null;
    return realUsage.sections.find((s) => s.label.toLowerCase().includes("week")) ?? null;
  }, [realUsage]);

  // Week bounds: prefer live Anthropic timestamps, fallback to local computation
  const { weekFrom, weekTo, weekStartDate, weekEndDate, nextResetDate, isLive } = useMemo(() => {
    if (liveWeekSection?.resetsAt) {
      const end = new Date(liveWeekSection.resetsAt);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        weekFrom: start.toISOString(),
        weekTo: end.toISOString(),
        weekStartDate: start,
        weekEndDate: end,
        nextResetDate: end,
        isLive: true,
      };
    }
    const fallback = computeWeekBounds(weekStartDay, weekStartHour);
    return {
      ...fallback,
      weekEndDate: fallback.weekEndDate ?? new Date(),
      isLive: false,
    };
  }, [liveWeekSection, weekStartDay, weekStartHour]);

  // Previous week for comparison (useAnalytics computes this automatically via previousTotals)
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics(
    weekFrom,
    weekTo,
  );
  const { data: hourlyData } = useAnalytics(
    weekFrom,
    weekTo,
    {},
    true,
    "hour",
  );
  const { data: modelData, isLoading: modelsLoading } = useModelUsage(
    weekFrom,
    weekTo,
  );
  const { data: topSessionsData } = useSessions({
    sortBy: "cost",
    sortDir: "DESC",
    limit: 10,
    dateFrom: weekFrom,
    dateTo: weekTo,
  });

  const isLoading = settingsLoading || analyticsLoading || modelsLoading;

  const totals = analyticsData?.totals;
  const prev = analyticsData?.previousTotals;
  const topSessions = topSessionsData?.sessions ?? [];
  const models = useMemo(() => modelData?.models ?? [], [modelData?.models]);

  // Budget computation — week-first: user override → direct weekly constant → block × blocksPerWeek fallback
  const weeklyBudgetInfo = useMemo(() => {
    if (!totals) return null;
    if (isMaxPlan) {
      const budget =
        (settings?.statuslineWeeklyTokenBudget ?? 0) > 0
          ? settings!.statuslineWeeklyTokenBudget!
          : plan && PLAN_WEEKLY_TOKEN_BUDGETS[plan]
            ? PLAN_WEEKLY_TOKEN_BUDGETS[plan]
            : plan
              ? Math.round((PLAN_TOKEN_BUDGETS[plan] ?? 0) * blocksPerWeek)
              : 0;
      if (budget <= 0) return null;
      const used = totals.total_output_tokens;
      const pct = Math.min(Math.round((used / budget) * 100), 100);
      return { type: "token" as const, budget, used, pct };
    }
    const budget =
      (settings?.statuslineWeeklyBudget ?? 0) > 0
        ? settings!.statuslineWeeklyBudget!
        : plan && PLAN_WEEKLY_BUDGETS[plan]
          ? PLAN_WEEKLY_BUDGETS[plan]
          : plan
            ? Math.round((PLAN_BUDGETS[plan] ?? 0) * blocksPerWeek * 100) / 100
            : 0;
    if (budget <= 0) return null;
    const used = totals.total_cost;
    const pct = Math.min(Math.round((used / budget) * 100), 100);
    return { type: "dollar" as const, budget, used, pct };
  }, [totals, isMaxPlan, settings, plan, blocksPerWeek]);

  // Per-tier weekly breakdown for Max plans
  const weeklyTierBreakdown = useMemo(() => {
    if (!isMaxPlan || !plan || models.length === 0) return null;
    const tierBudgets = TIER_TOKEN_BUDGETS[plan];
    if (!tierBudgets) return null;

    // Weekly token budget per tier: direct weekly constant ÷ tier count, or per-block × blocksPerWeek
    const tierMap = new Map<ModelTier, number>();
    for (const m of models) {
      const tier = getModelTier(m.model);
      if (tier === "other") continue;
      tierMap.set(tier, (tierMap.get(tier) ?? 0) + m.outputTokens);
    }

    const tiers: { tier: ModelTier; used: number; budget: number; pct: number }[] = [];
    for (const tier of ["opus", "sonnet", "haiku"] as ModelTier[]) {
      const perBlockBudget = tierBudgets[tier] ?? 0;
      if (perBlockBudget <= 0) continue;
      // Each tier has its own independent limit, so scale per-block to weekly
      const weekBudget = Math.round(perBlockBudget * blocksPerWeek);
      const used = tierMap.get(tier) ?? 0;
      const pct = Math.min(Math.round((used / weekBudget) * 100), 100);
      tiers.push({ tier, used, budget: weekBudget, pct });
    }

    return tiers;
  }, [isMaxPlan, plan, models, blocksPerWeek]);

  // KPIs
  const kpis = useMemo(() => {
    if (!totals) return [];
    return [
      {
        key: "cost",
        label: "Total Cost",
        icon: DollarSign,
        value: formatCost(totals.total_cost),
        current: totals.total_cost,
        previous: prev?.total_cost,
        color: "text-chart-1",
        invertTrend: true,
      },
      {
        key: "input",
        label: "Input Tokens",
        icon: ArrowDownToLine,
        value: formatTokens(totals.total_input_tokens),
        current: totals.total_input_tokens,
        previous: prev?.total_input_tokens,
        color: "text-chart-2",
        invertTrend: false,
      },
      {
        key: "output",
        label: "Output Tokens",
        icon: ArrowUpFromLine,
        value: formatTokens(totals.total_output_tokens),
        current: totals.total_output_tokens,
        previous: prev?.total_output_tokens,
        color: "text-chart-4",
        invertTrend: false,
      },
      {
        key: "cacheRead",
        label: "Cache Read",
        icon: BookOpen,
        value: formatTokens(totals.total_cache_read_tokens),
        current: totals.total_cache_read_tokens,
        previous: prev?.total_cache_read_tokens || undefined,
        color: "text-chart-3",
        invertTrend: false,
      },
      {
        key: "cacheWrite",
        label: "Cache Write",
        icon: BookMarked,
        value: formatTokens(totals.total_cache_write_tokens),
        current: totals.total_cache_write_tokens,
        previous: prev?.total_cache_write_tokens || undefined,
        color: "text-chart-5",
        invertTrend: false,
      },
      {
        key: "sessions",
        label: "Sessions",
        icon: Layers,
        value: totals.total_sessions.toLocaleString(),
        current: totals.total_sessions,
        previous: prev?.total_sessions,
        color: "text-chart-3",
        invertTrend: false,
      },
      {
        key: "messages",
        label: "Messages",
        icon: MessageSquare,
        value: totals.total_messages.toLocaleString(),
        current: totals.total_messages,
        previous: prev?.total_messages,
        color: "text-chart-2",
        invertTrend: false,
      },
      {
        key: "toolCalls",
        label: "Tool Calls",
        icon: Wrench,
        value: totals.total_tool_calls.toLocaleString(),
        current: totals.total_tool_calls,
        previous: prev?.total_tool_calls,
        color: "text-chart-4",
        invertTrend: false,
      },
    ];
  }, [totals, prev]);

  // Hourly chart data
  const chartData = useMemo(() => {
    if (!hourlyData?.daily) return [];
    return hourlyData.daily.map((d) => ({
      hour: format(new Date(d.date), "EEE ha").toLowerCase(),
      fullLabel: format(new Date(d.date), "EEE MMM d, h:mm a"),
      cost: d.total_cost,
    }));
  }, [hourlyData]);

  // Week display range — show times when using live data
  const weekRangeLabel = useMemo(() => {
    if (isLive) {
      return `${format(weekStartDate, "EEE MMM d, h:mm a")} – ${format(weekEndDate, "EEE MMM d, h:mm a")}`;
    }
    return `${format(weekStartDate, "EEE MMM d")} – ${format(new Date(), "EEE MMM d")}`;
  }, [weekStartDate, weekEndDate, isLive]);

  // Reset label with time
  const resetLabel = useMemo(
    () => format(nextResetDate, "EEE MMM d, h:mm a"),
    [nextResetDate],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {headerLeft && <div className="flex items-center">{headerLeft}</div>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: tabs (left) + week range + reset time + config (right) */}
      <div className="flex items-center justify-between">
        {headerLeft && <div className="flex items-center">{headerLeft}</div>}
        <div className="flex items-center gap-3 text-sm ml-auto">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {isLive ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 dark:bg-green-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 dark:bg-green-400" />
              </span>
            ) : (
              <CalendarDays size={13} className="text-chart-3" />
            )}
            <span className="text-foreground font-medium">
              {weekRangeLabel}
            </span>
          </span>
          <span className="text-border">|</span>
          {liveWeekSection?.percentUsed != null && (
            <>
              <span className="text-muted-foreground">
                Anthropic:{" "}
                <span className={cn(
                  "font-medium tabular-nums",
                  liveWeekSection.percentUsed >= 80 ? "text-destructive"
                    : liveWeekSection.percentUsed >= 50 ? "text-yellow-500 dark:text-yellow-400"
                    : "text-chart-3",
                )}>
                  {liveWeekSection.percentUsed}% used
                </span>
              </span>
              <span className="text-border">|</span>
            </>
          )}
          <span className="text-muted-foreground">
            Resets{" "}
            <span className="text-foreground font-medium tabular-nums">
              {resetLabel}
            </span>
          </span>
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 size={12} />
            Configure
          </button>
        </div>
      </div>

      {/* Config modal */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Week Settings</DialogTitle>
            <DialogDescription>
              Configure week boundaries and budget tracking. Block time windows are synced automatically from Anthropic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Live week timestamps from Anthropic */}
            {isLive && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Week Window (from Anthropic)
                </label>
                <div className="rounded-md bg-muted/50 border border-border px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Start</span>
                    <span className="font-medium tabular-nums">
                      {format(weekStartDate, "EEE MMM d, h:mm a")}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Resets</span>
                    <span className="font-medium tabular-nums">
                      {format(nextResetDate, "EEE MMM d, h:mm a")}
                    </span>
                  </div>
                  {liveWeekSection?.percentUsed != null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Anthropic Usage</span>
                      <span className={cn(
                        "font-medium tabular-nums",
                        liveWeekSection.percentUsed >= 80 ? "text-destructive"
                          : liveWeekSection.percentUsed >= 50 ? "text-yellow-500 dark:text-yellow-400"
                          : "text-chart-3",
                      )}>
                        {liveWeekSection.percentUsed}%
                      </span>
                    </div>
                  )}
                </div>
                <p className="text-micro text-text-quaternary">
                  Week boundaries synced from Anthropic&apos;s live usage data.
                </p>
              </div>
            )}

            {/* Fallback: manual week start day + hour — shown only when no live data */}
            {!isLive && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Week Starts On
                </label>
                <div className="flex gap-2">
                  <Select
                    value={String(weekStartDay)}
                    onValueChange={(v) => {
                      updateSettings.mutate({
                        statuslineWeekStartDay: parseInt(v, 10),
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAY_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {label}
                          {i === 0 ? " (default)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(weekStartHour)}
                    onValueChange={(v) => {
                      updateSettings.mutate({
                        statuslineWeekStartHour: parseInt(v, 10),
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => {
                        const period = h < 12 ? "AM" : "PM";
                        const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
                        const label = `${display}:00 ${period}`;
                        return (
                          <SelectItem key={h} value={String(h)}>
                            {label}
                            {h === 0 ? " (default)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-micro text-text-quaternary">
                  Fallback: week resets on {DAY_LABELS[weekStartDay]} at{" "}
                  {(() => {
                    const period = weekStartHour < 12 ? "AM" : "PM";
                    const display = weekStartHour === 0 ? 12 : weekStartHour > 12 ? weekStartHour - 12 : weekStartHour;
                    return `${display}:00 ${period}`;
                  })()}.
                  Live Anthropic data will override this when available.
                </p>
              </div>
            )}

            {isMaxPlan ? (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Weekly Token Budget
                </label>
                <input
                  type="number"
                  min={0}
                  step={10000}
                  defaultValue={settings?.statuslineWeeklyTokenBudget ?? 0}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    if (val !== (settings?.statuslineWeeklyTokenBudget ?? 0)) {
                      updateSettings.mutate({
                        statuslineWeeklyTokenBudget: val,
                      });
                    }
                  }}
                  className="h-8 w-full text-xs px-2.5 bg-card border border-border/50 rounded-md text-foreground tabular-nums"
                  placeholder="e.g. 1500000"
                />
                <p className="text-micro text-text-quaternary">
                  Weekly output token budget. Leave 0 for auto (
                  {formatTokens(PLAN_WEEKLY_TOKEN_BUDGETS[plan ?? ""] ?? 0)}
                  {" "}for {PLAN_LABELS[plan ?? ""] ?? plan}).
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Weekly Budget ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  defaultValue={settings?.statuslineWeeklyBudget ?? 0}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value) || 0;
                    if (val !== (settings?.statuslineWeeklyBudget ?? 0)) {
                      updateSettings.mutate({ statuslineWeeklyBudget: val });
                    }
                  }}
                  className="h-8 w-full text-xs px-2.5 bg-card border border-border/50 rounded-md text-foreground tabular-nums"
                  placeholder="e.g. 200"
                />
                <p className="text-micro text-text-quaternary">
                  Weekly dollar budget. Leave 0 for auto (
                  {formatCost(PLAN_WEEKLY_BUDGETS[plan ?? ""] ?? 0)}
                  {" "}for {PLAN_LABELS[plan ?? ""] ?? plan}).
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Budget progress bar */}
      {weeklyBudgetInfo && (
        <Card className="bg-card">
          <CardContent className="px-5 py-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {weeklyBudgetInfo.type === "token" ? "Weekly Output Limit:" : "Weekly Usage:"}{" "}
                <span
                  className={cn(
                    "text-lg tabular-nums",
                    weeklyBudgetInfo.pct >= 90
                      ? "text-destructive"
                      : weeklyBudgetInfo.pct >= 70
                        ? "text-yellow-500 dark:text-yellow-400"
                        : "text-chart-3",
                  )}
                >
                  {weeklyBudgetInfo.pct}%
                </span>
              </span>
              <span className="text-muted-foreground tabular-nums text-xs">
                {weeklyBudgetInfo.type === "token"
                  ? `${formatTokens(weeklyBudgetInfo.used)} of ${formatTokens(weeklyBudgetInfo.budget)} budget`
                  : `${formatCost(weeklyBudgetInfo.used)} of ${formatCost(weeklyBudgetInfo.budget)} budget`}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  weeklyBudgetInfo.pct >= 90
                    ? "bg-destructive"
                    : weeklyBudgetInfo.pct >= 70
                      ? "bg-yellow-500 dark:bg-yellow-400"
                      : "bg-chart-3",
                )}
                style={{ width: `${weeklyBudgetInfo.pct}%` }}
              />
            </div>

            {/* Per-tier breakdown bars for Max plans */}
            {weeklyTierBreakdown && weeklyTierBreakdown.length > 0 && (
              <div className="space-y-2 pt-1">
                {weeklyTierBreakdown.map(({ tier, used, budget, pct }) => (
                  <div key={tier} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">
                        {TIER_LABELS[tier]}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatTokens(used)} / {formatTokens(budget)}{" "}
                        <span className={cn(
                          "font-medium",
                          pct >= 90 ? "text-destructive"
                            : pct >= 70 ? "text-yellow-500 dark:text-yellow-400"
                            : "text-foreground",
                        )}>
                          {pct}%
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          pct >= 90 ? "bg-destructive"
                            : pct >= 70 ? "bg-yellow-500 dark:bg-yellow-400"
                            : TIER_COLORS[tier],
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(
          (
            { key, label, icon, value, current, previous, color, invertTrend },
            i,
          ) => {
            const pctChange =
              previous && previous > 0
                ? ((current - previous) / previous) * 100
                : undefined;

            return (
              <KPICard
                key={key}
                label={label}
                icon={icon}
                value={value}
                color={color}
                trend={
                  pctChange !== undefined
                    ? { pctChange, invertTrend }
                    : undefined
                }
                animationDelay={i * 50}
              />
            );
          },
        )}
      </div>

      {/* Daily Cost Chart + Model Breakdown — 2-col grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Daily cost chart */}
        {chartData.length > 0 && (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-section-title">Hourly Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartGridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="hour"
                      tick={chartTickStyle}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={chartTickStyle}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(v: number | string | undefined) => [
                        formatCost(Number(v ?? 0)),
                        "Cost",
                      ]}
                      labelFormatter={(_label, payload) =>
                        payload?.[0]?.payload?.fullLabel ?? _label
                      }
                    />
                    <Bar
                      dataKey="cost"
                      fill={chartColors.chart1}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Model breakdown */}
        {models.length > 0 && (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-section-title">Week Models</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {models.map((m) => {
                  const allModelsCost = models.reduce(
                    (s, x) => s + x.cost,
                    0,
                  );
                  const pct =
                    allModelsCost > 0
                      ? Math.round((m.cost / allModelsCost) * 100)
                      : 0;
                  return (
                    <div key={m.model} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {shortenModel(m.model)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatCost(m.cost)} · {m.sessionCount} session
                          {m.sessionCount !== 1 ? "s" : ""}
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
      </div>

      {/* Top sessions */}
      {topSessions.length > 0 && (
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-section-title">
              Top Sessions This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="table-readable w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 pr-3 font-medium">
                      Session
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">Cost</th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      Tokens
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      Messages
                    </th>
                    <th className="text-right py-1.5 pl-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {topSessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/60 hover:bg-muted/30 transition-colors group"
                    >
                      <td className="py-1.5 pr-3 max-w-[200px]">
                        <Link
                          href={`/sessions/${s.id}`}
                          className="flex items-center gap-1.5 text-foreground hover:text-chart-1 transition-colors"
                        >
                          <span className="truncate font-mono text-xs">
                            {s.first_prompt?.slice(0, 50) ||
                              s.slug ||
                              s.id.slice(0, 12)}
                          </span>
                          <ExternalLink
                            size={9}
                            className="opacity-0 group-hover:opacity-50 shrink-0"
                          />
                        </Link>
                        {s.project_path && (
                          <div className="text-micro text-muted-foreground truncate">
                            {shortenPath(s.project_path)}
                          </div>
                        )}
                      </td>
                      <td className="text-right py-1.5 px-2 font-medium text-foreground tabular-nums">
                        {formatCost(s.total_cost)}
                      </td>
                      <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                        {formatTokens(s.input_tokens + s.output_tokens)}
                      </td>
                      <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                        {s.message_count}
                      </td>
                      <td className="text-right py-1.5 pl-2 text-muted-foreground tabular-nums">
                        {format(new Date(s.created_at), "EEE h:mm a")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pt-3 border-t border-border/60 mt-2">
              <Link
                href={`/sessions?tab=sessions&dateFrom=${encodeURIComponent(weekFrom)}&dateTo=${encodeURIComponent(weekTo)}&sortBy=cost&sortDir=DESC`}
                className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                View all week sessions
                <ExternalLink size={10} />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {totals && totals.total_sessions === 0 && (
        <Card className="bg-card">
          <CardContent className="py-12 text-center">
            <CalendarDays
              size={32}
              className="mx-auto text-text-quaternary mb-3"
            />
            <p className="text-sm text-muted-foreground">
              No sessions this week
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Week started {format(weekStartDate, "EEEE, MMM d")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="text-micro text-muted-foreground text-center">
        Tracked from local session logs. Trends compare to the previous week.
      </p>
    </div>
  );
}
