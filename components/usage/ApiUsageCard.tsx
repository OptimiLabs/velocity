"use client";

import { useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTokens, formatCost } from "@/lib/cost/calculator";
import { useAnalytics, useModelUsage } from "@/hooks/useAnalytics";
import {
  DollarSign,
  Layers,
  MessageSquare,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { KPICard } from "@/components/layout/KPICard";
import { ModelBreakdownTable } from "@/components/usage/ModelBreakdownTable";
import {
  format,
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
} from "date-fns";
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
import { useQuery } from "@tanstack/react-query";
import type { ClaudeSettings } from "@/lib/claude-settings";

interface AlertThreshold {
  label: string;
  spent: number;
  limit: number;
  pct: number;
}

function AlertBar({ alert }: { alert: AlertThreshold }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          {alert.pct >= 80 && (
            <AlertTriangle size={11} className="text-destructive shrink-0" />
          )}
          {alert.label}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {formatCost(alert.spent)} / {formatCost(alert.limit)}{" "}
          <span
            className={cn(
              "font-medium",
              alert.pct >= 80
                ? "text-destructive"
                : alert.pct >= 50
                  ? "text-yellow-500 dark:text-yellow-400"
                  : "text-chart-3",
            )}
          >
            {alert.pct}%
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            alert.pct >= 80
              ? "bg-destructive"
              : alert.pct >= 50
                ? "bg-yellow-500 dark:bg-yellow-400"
                : "bg-chart-3",
          )}
          style={{ width: `${Math.min(alert.pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function useSettings() {
  return useQuery({
    queryKey: ["api-usage-settings"],
    queryFn: async (): Promise<ClaudeSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function ApiUsageCard({ headerLeft }: { headerLeft?: ReactNode }) {
  const { data: settings } = useSettings();

  const now = useMemo(() => new Date(), []);
  const todayStart = useMemo(() => startOfDay(now), [now]);
  const monthStart = useMemo(() => startOfMonth(now), [now]);

  // Month-range analytics (covers today, this week, and this month)
  // Filter to billing_plan = 'api' so subscription-era sessions don't pollute cost projections
  const monthFrom = format(monthStart, "yyyy-MM-dd");
  const monthTo = format(now, "yyyy-MM-dd");
  const apiFilter = useMemo(() => ({ billingPlan: "api" }), []);

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics(
    monthFrom,
    monthTo,
    apiFilter,
  );
  const { data: modelData, isLoading: modelsLoading } = useModelUsage(
    monthFrom,
    monthTo,
    apiFilter,
  );

  const isLoading = analyticsLoading || modelsLoading;

  const totals = analyticsData?.totals;
  const prev = analyticsData?.previousTotals;
  const daily = useMemo(() => analyticsData?.daily ?? [], [analyticsData?.daily]);
  const models = useMemo(() => modelData?.models ?? [], [modelData?.models]);

  // Compute today / this week / this month costs from daily breakdown
  const { todayCost, weekCost, monthCost, yesterdayCost, prevWeekCost } =
    useMemo(() => {
      const todayStr = format(todayStart, "yyyy-MM-dd");
      const weekStartStr = format(
        startOfWeek(todayStart, { weekStartsOn: 0 }),
        "yyyy-MM-dd",
      );
      const yesterdayStr = format(subDays(todayStart, 1), "yyyy-MM-dd");

      let todayCost = 0;
      let weekCost = 0;
      let monthCost = 0;
      let yesterdayCost = 0;

      for (const d of daily) {
        const dateStr = d.date.slice(0, 10);
        monthCost += d.total_cost;
        if (dateStr === todayStr) todayCost += d.total_cost;
        if (dateStr === yesterdayStr) yesterdayCost += d.total_cost;
        if (dateStr >= weekStartStr) weekCost += d.total_cost;
      }

      // Previous week cost — use previousTotals as approximation
      // (previousTotals covers the same-length period before monthFrom)
      const prevWeekCost = prev?.total_cost
        ? (prev.total_cost / Math.max(daily.length, 1)) * 7
        : 0;

      return { todayCost, weekCost, monthCost, yesterdayCost, prevWeekCost };
    }, [daily, todayStart, prev]);

  // Spending alerts
  const alerts = useMemo(() => {
    const result: AlertThreshold[] = [];
    if (settings?.statuslineDailyAlert && settings.statuslineDailyAlert > 0) {
      const pct = Math.round(
        (todayCost / settings.statuslineDailyAlert) * 100,
      );
      result.push({
        label: "Daily Limit",
        spent: todayCost,
        limit: settings.statuslineDailyAlert,
        pct,
      });
    }
    if (
      settings?.statuslineWeeklyAlert &&
      settings.statuslineWeeklyAlert > 0
    ) {
      const pct = Math.round(
        (weekCost / settings.statuslineWeeklyAlert) * 100,
      );
      result.push({
        label: "Weekly Limit",
        spent: weekCost,
        limit: settings.statuslineWeeklyAlert,
        pct,
      });
    }
    if (
      settings?.statuslineMonthlyAlert &&
      settings.statuslineMonthlyAlert > 0
    ) {
      const pct = Math.round(
        (monthCost / settings.statuslineMonthlyAlert) * 100,
      );
      result.push({
        label: "Monthly Limit",
        spent: monthCost,
        limit: settings.statuslineMonthlyAlert,
        pct,
      });
    }
    return result;
  }, [settings, todayCost, weekCost, monthCost]);

  // Projections and burn rate
  const { projectedMonthly, dailyBurnRate, burnTrend } = useMemo(() => {
    if (daily.length === 0) return { projectedMonthly: 0, dailyBurnRate: 0, burnTrend: undefined as number | undefined };

    // Days elapsed so far this month (at least 1)
    const dayOfMonth = Math.max(now.getDate(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dailyAvg = monthCost / dayOfMonth;
    const projected = dailyAvg * daysInMonth;

    // Burn rate: average $/day over the last 7 days of data
    const last7 = daily.slice(-7);
    const last7Cost = last7.reduce((s, d) => s + d.total_cost, 0);
    const burnRate = last7.length > 0 ? last7Cost / last7.length : 0;

    // Burn trend: compare last 7 days avg to the 7 days before that
    let trend: number | undefined;
    if (daily.length >= 14) {
      const prev7 = daily.slice(-14, -7);
      const prev7Cost = prev7.reduce((s, d) => s + d.total_cost, 0);
      const prev7Avg = prev7Cost / prev7.length;
      if (prev7Avg > 0) {
        trend = ((burnRate - prev7Avg) / prev7Avg) * 100;
      }
    }

    return { projectedMonthly: projected, dailyBurnRate: burnRate, burnTrend: trend };
  }, [daily, monthCost, now]);

  // KPIs
  const kpis = useMemo(() => {
    if (!totals) return [];

    const avgPerSession =
      totals.total_sessions > 0
        ? totals.total_cost / totals.total_sessions
        : 0;
    const prevAvg =
      prev && prev.total_sessions > 0
        ? prev.total_cost / prev.total_sessions
        : undefined;

    return [
      {
        key: "today",
        label: "Today",
        icon: DollarSign,
        value: formatCost(todayCost),
        current: todayCost,
        previous: yesterdayCost || undefined,
        color: "text-chart-1",
        invertTrend: true,
      },
      {
        key: "week",
        label: "This Week",
        icon: DollarSign,
        value: formatCost(weekCost),
        current: weekCost,
        previous: prevWeekCost || undefined,
        color: "text-chart-2",
        invertTrend: true,
      },
      {
        key: "month",
        label: "This Month",
        icon: DollarSign,
        value: formatCost(monthCost),
        current: monthCost,
        previous: prev?.total_cost,
        color: "text-chart-4",
        invertTrend: true,
      },
      {
        key: "projected",
        label: "Projected",
        icon: TrendingUp,
        value: formatCost(projectedMonthly),
        current: projectedMonthly,
        previous: undefined,
        color: "text-chart-5",
        invertTrend: true,
        subtitle: `${formatCost(dailyBurnRate)}/day avg`,
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
        key: "avgSession",
        label: "Avg $/Session",
        icon: TrendingUp,
        value: formatCost(avgPerSession),
        current: avgPerSession,
        previous: prevAvg,
        color: "text-chart-5",
        invertTrend: true,
      },
    ];
  }, [totals, prev, todayCost, weekCost, monthCost, yesterdayCost, prevWeekCost, projectedMonthly, dailyBurnRate]);

  // Daily cost chart (last 30 days)
  const chartData = useMemo(() => {
    return daily.map((d) => ({
      date: format(new Date(d.date), "MMM d"),
      fullLabel: format(new Date(d.date), "EEE MMM d"),
      cost: d.total_cost,
    }));
  }, [daily]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {headerLeft && (
          <div className="flex items-center">{headerLeft}</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        {headerLeft && <div className="flex items-center">{headerLeft}</div>}
        <div className="flex items-center gap-3 text-sm ml-auto">
          <span className="text-muted-foreground">
            {format(monthStart, "MMM d")} – {format(now, "MMM d, yyyy")}
          </span>
          {dailyBurnRate > 0 && (
            <>
              <span className="text-border">|</span>
              <span className="text-muted-foreground">
                Burn{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {formatCost(dailyBurnRate)}/day
                </span>
                {burnTrend !== undefined && Math.abs(burnTrend) >= 1 && (
                  <span
                    className={cn(
                      "ml-1 tabular-nums text-xs",
                      burnTrend > 0
                        ? "text-destructive"
                        : "text-success",
                    )}
                  >
                    {burnTrend > 0 ? "+" : ""}
                    {burnTrend.toFixed(0)}%
                  </span>
                )}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Spending alert bars */}
      {alerts.length > 0 && (
        <Card className="bg-card">
          <CardContent className="px-5 py-4 space-y-3">
            {alerts.map((alert) => (
              <AlertBar key={alert.label} alert={alert} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
        {kpis.map((kpi, i) => {
            const pctChange =
              kpi.previous && kpi.previous > 0
                ? ((kpi.current - kpi.previous) / kpi.previous) * 100
                : undefined;

            return (
              <KPICard
                key={kpi.key}
                label={kpi.label}
                icon={kpi.icon}
                value={kpi.value}
                color={kpi.color}
                subtitle={"subtitle" in kpi ? (kpi.subtitle as string) : undefined}
                trend={
                  pctChange !== undefined
                    ? { pctChange, invertTrend: kpi.invertTrend }
                    : undefined
                }
                animationDelay={i * 50}
              />
            );
          },
        )}
      </div>

      {/* Daily Cost Chart + Token Totals — 2-col grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Daily cost chart */}
        {chartData.length > 0 && (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-section-title">
                Daily Cost (This Month)
              </CardTitle>
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
                      dataKey="date"
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
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(v: any) => [formatCost(Number(v ?? 0)), "Cost"]}
                      labelFormatter={(_label, payload) =>
                        payload?.[0]?.payload?.fullLabel ?? _label
                      }
                    />
                    <Bar
                      dataKey="cost"
                      fill={chartColors.chart1}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Token breakdown summary */}
        {totals && (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-section-title">
                Token Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    label: "Input Tokens",
                    icon: ArrowDownToLine,
                    value: totals.total_input_tokens,
                    prev: prev?.total_input_tokens,
                    color: "text-chart-2",
                    barColor: "bg-chart-2",
                  },
                  {
                    label: "Output Tokens",
                    icon: ArrowUpFromLine,
                    value: totals.total_output_tokens,
                    prev: prev?.total_output_tokens,
                    color: "text-chart-4",
                    barColor: "bg-chart-4",
                  },
                  {
                    label: "Cache Read",
                    icon: BookOpen,
                    value: totals.total_cache_read_tokens,
                    prev: prev?.total_cache_read_tokens,
                    color: "text-chart-3",
                    barColor: "bg-chart-3",
                  },
                ].map((item) => {
                  const totalTokens =
                    totals.total_input_tokens +
                    totals.total_output_tokens +
                    totals.total_cache_read_tokens;
                  const pct =
                    totalTokens > 0
                      ? Math.round((item.value / totalTokens) * 100)
                      : 0;
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Icon size={11} className={cn(item.color, "shrink-0")} />
                          {item.label}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatTokens(item.value)} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            item.barColor,
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Model Breakdown Table */}
      <ModelBreakdownTable data={models} />

      {/* Empty state */}
      {totals && totals.total_sessions === 0 && (
        <Card className="bg-card">
          <CardContent className="py-12 text-center">
            <DollarSign
              size={32}
              className="mx-auto text-muted-foreground/40 mb-3"
            />
            <p className="text-sm text-muted-foreground">
              No API usage this month
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Usage tracking starts when you make your first API call.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="text-micro text-muted-foreground text-center">
        Costs estimated from local session logs using published API pricing.
        Trends compare to the previous period.
        {alerts.length === 0 && (
          <span>
            {" "}Configure spending alerts in{" "}
            <a
              href="/settings"
              className="text-muted-foreground underline hover:text-foreground transition-colors"
            >
              Settings
            </a>
            .
          </span>
        )}
      </p>
    </div>
  );
}
