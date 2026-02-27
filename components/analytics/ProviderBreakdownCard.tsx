"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type {
  ProviderBreakdownRow,
  ProviderDailyRow,
} from "@/hooks/useAnalytics";
import {
  getSessionProvider,
  getAllSessionProviders,
} from "@/lib/providers/session-registry";

const tooltipStyle = chartTooltipStyle;

interface ProviderBreakdownCardProps {
  byProvider: ProviderBreakdownRow[];
  daily: ProviderDailyRow[];
  compareByProvider?: ProviderBreakdownRow[];
  compareLabels?: [string, string];
}

type View = "breakdown" | "daily";

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

export function ProviderBreakdownCard({
  byProvider,
  daily,
  compareByProvider,
  compareLabels,
}: ProviderBreakdownCardProps) {
  const [view, setView] = useState<View>("breakdown");
  const compareEnabled = !!compareByProvider?.length;

  const chartData = byProvider.map((r) => ({
    provider: getSessionProvider(r.provider)?.label ?? r.provider,
    cost: r.totalCost,
    rawProvider: r.provider,
    sessionCount: r.sessionCount,
    messageCount: r.messageCount,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens || 0,
    cacheWriteTokens: r.cacheWriteTokens || 0,
  }));

  const compareMap = useMemo(() => {
    if (!compareByProvider?.length) return null;
    const map = new Map<string, ProviderBreakdownRow>();
    for (const row of compareByProvider) map.set(row.provider, row);
    return map;
  }, [compareByProvider]);

  const summaryRows = useMemo(() => {
    if (!compareMap) {
      return byProvider.map((row) => ({
        provider: row.provider,
        totalCost: row.totalCost,
        sessionCount: row.sessionCount,
        compareCost: undefined as number | undefined,
        compareSessionCount: undefined as number | undefined,
      }));
    }

    const primaryMap = new Map<string, ProviderBreakdownRow>();
    for (const row of byProvider) primaryMap.set(row.provider, row);
    const providerIds = new Set<string>([
      ...primaryMap.keys(),
      ...compareMap.keys(),
    ]);

    return Array.from(providerIds)
      .map((provider) => {
        const current = primaryMap.get(provider);
        const compare = compareMap.get(provider);
        return {
          provider,
          totalCost: current?.totalCost ?? 0,
          sessionCount: current?.sessionCount ?? 0,
          compareCost: compare?.totalCost ?? 0,
          compareSessionCount: compare?.sessionCount ?? 0,
        };
      })
      .sort(
        (a, b) =>
          Math.max(b.totalCost, b.compareCost ?? 0) -
          Math.max(a.totalCost, a.compareCost ?? 0),
      );
  }, [byProvider, compareMap]);

  const currentTotals = useMemo(
    () =>
      byProvider.reduce(
        (acc, row) => {
          acc.totalCost += row.totalCost;
          acc.sessionCount += row.sessionCount;
          return acc;
        },
        { totalCost: 0, sessionCount: 0 },
      ),
    [byProvider],
  );
  const compareTotals = useMemo(
    () =>
      (compareByProvider ?? []).reduce(
        (acc, row) => {
          acc.totalCost += row.totalCost;
          acc.sessionCount += row.sessionCount;
          return acc;
        },
        { totalCost: 0, sessionCount: 0 },
      ),
    [compareByProvider],
  );
  const totalDelta = compareEnabled
    ? pctChange(currentTotals.totalCost, compareTotals.totalCost)
    : null;
  const periodALabel = compareLabels?.[0] ?? "Primary";
  const periodBLabel = compareLabels?.[1] ?? "Comparison";

  if (byProvider.length === 0) return null;

  const activeProviderIds = new Set<string>(byProvider.map((row) => row.provider));
  for (const day of daily) {
    for (const key of Object.keys(day)) {
      if (key.endsWith("_cost")) {
        activeProviderIds.add(key.slice(0, -5));
      }
    }
  }

  const providerDefs = getAllSessionProviders().filter((provider) =>
    activeProviderIds.has(provider.id),
  );
  const sessionProviders =
    providerDefs.length > 0 ? providerDefs : getAllSessionProviders();

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-section-title">Cost by Provider</CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant={view === "breakdown" ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setView("breakdown")}
            >
              Breakdown
            </Button>
            <Button
              variant={view === "daily" ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setView("daily")}
            >
              Daily
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {compareEnabled && (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <div className="grid gap-2 text-xs sm:grid-cols-3 sm:items-end">
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate" title={periodALabel}>
                  {periodALabel}
                </div>
                <div className="tabular-nums text-sm font-semibold text-foreground">
                  {formatCost(currentTotals.totalCost)}
                </div>
                <div className="tabular-nums text-[11px] text-muted-foreground">
                  {currentTotals.sessionCount.toLocaleString()} sessions
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate" title={periodBLabel}>
                  {periodBLabel}
                </div>
                <div className="tabular-nums text-sm font-semibold text-foreground">
                  {formatCost(compareTotals.totalCost)}
                </div>
                <div className="tabular-nums text-[11px] text-muted-foreground">
                  {compareTotals.sessionCount.toLocaleString()} sessions
                </div>
              </div>
              {totalDelta !== null && (
                <div className="space-y-0.5 text-left sm:text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Cost delta
                  </div>
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 tabular-nums text-sm font-semibold",
                      Math.abs(totalDelta) < 0.1
                        ? "text-muted-foreground"
                        : totalDelta > 0
                          ? "text-destructive"
                          : "text-success",
                    )}
                  >
                    {Math.abs(totalDelta) < 0.1 ? (
                      <Minus size={10} />
                    ) : totalDelta > 0 ? (
                      <TrendingUp size={10} />
                    ) : (
                      <TrendingDown size={10} />
                    )}
                    {totalDelta > 0 ? "+" : ""}
                    {totalDelta.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "breakdown" ? (
          <>
            <ResponsiveContainer
              width="100%"
              height={Math.max(80, chartData.length * 40)}
            >
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 0, right: 8 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={chartGridStroke}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  tick={chartTickStyle}
                  tickFormatter={(v: number) => formatCost(v)}
                />
                <YAxis
                  type="category"
                  dataKey="provider"
                  tick={chartTickStyle}
                  width={85}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    const color =
                      getSessionProvider(d.rawProvider)?.chartColor ?? "#888";
                    return (
                      <div style={tooltipStyle} className="px-3 py-2 space-y-1">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ background: color }}
                          />
                          {d.provider}
                        </div>
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                          <span>Cost</span>
                          <span className="text-right tabular-nums font-medium text-foreground">
                            {formatCost(d.cost)}
                          </span>
                          <span>Sessions</span>
                          <span className="text-right tabular-nums">
                            {d.sessionCount}
                          </span>
                          <span>Messages</span>
                          <span className="text-right tabular-nums">
                            {d.messageCount.toLocaleString()}
                          </span>
                          <span>Input</span>
                          <span className="text-right tabular-nums">
                            {formatTokens(d.inputTokens)}
                          </span>
                          <span>Output</span>
                          <span className="text-right tabular-nums">
                            {formatTokens(d.outputTokens)}
                          </span>
                          <span>Cache R/W</span>
                          <span className="text-right tabular-nums">
                            {formatTokens(d.cacheReadTokens || 0)} /{" "}
                            {formatTokens(d.cacheWriteTokens || 0)}
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.provider}
                      fill={
                        getSessionProvider(entry.rawProvider)?.chartColor ??
                        "#888"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Summary row */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {summaryRows.map((row) => {
                const def = getSessionProvider(row.provider);
                const delta =
                  compareEnabled && row.compareCost !== undefined
                    ? pctChange(row.totalCost, row.compareCost)
                    : null;
                return (
                  <span key={row.provider} className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: def?.chartColor ?? "#888" }}
                    />
                    <span>{def?.label ?? row.provider}:</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCost(row.totalCost)}
                    </span>
                    {compareEnabled && row.compareCost !== undefined && (
                      <span className="tabular-nums text-muted-foreground">
                        ({formatCost(row.compareCost)})
                      </span>
                    )}
                    {delta !== null && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-0.5 tabular-nums text-xs",
                          Math.abs(delta) < 0.1
                            ? "text-muted-foreground"
                            : delta > 0
                              ? "text-destructive"
                              : "text-success",
                        )}
                      >
                        {Math.abs(delta) < 0.1 ? (
                          <Minus size={9} />
                        ) : delta > 0 ? (
                          <TrendingUp size={9} />
                        ) : (
                          <TrendingDown size={9} />
                        )}
                        {delta > 0 ? "+" : ""}
                        {delta.toFixed(1)}%
                      </span>
                    )}
                    <span className="text-muted-foreground/60">
                      ({row.sessionCount}
                      {compareEnabled && row.compareSessionCount !== undefined
                        ? ` / ${row.compareSessionCount}`
                        : ""}
                      )
                    </span>
                  </span>
                );
              })}
            </div>
          </>
        ) : daily.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-8">
            No daily data for this range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
              <XAxis
                dataKey="date"
                tick={chartTickStyle}
                tickFormatter={(v: string) =>
                  format(new Date(v + "T00:00"), "MMM d")
                }
                interval="preserveStartEnd"
              />
              <YAxis
                tick={chartTickStyle}
                tickFormatter={(v: number) => formatCost(v)}
                width={50}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload;
                  let total = 0;
                  for (const sp of sessionProviders) {
                    total += (d?.[`${sp.id}_cost`] as number) || 0;
                  }
                  return (
                    <div style={tooltipStyle} className="px-3 py-2 space-y-1">
                      <div className="font-medium text-foreground">
                        {label
                          ? format(new Date(label + "T00:00"), "MMM d, yyyy")
                          : ""}
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                        {sessionProviders.map((sp) => (
                          <span
                            key={sp.id}
                            className="contents"
                          >
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ background: sp.chartColor }}
                              />
                              {sp.label}
                            </span>
                            <span className="text-right tabular-nums">
                              {formatCost(
                                (d?.[`${sp.id}_cost`] as number) || 0,
                              )}
                              <span className="text-muted-foreground/60 ml-1">
                                ({(d?.[`${sp.id}_sessions`] as number) || 0})
                              </span>
                            </span>
                          </span>
                        ))}
                        <span className="font-medium text-foreground">
                          Total
                        </span>
                        <span className="text-right tabular-nums font-medium text-foreground">
                          {formatCost(total)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              {sessionProviders.map((sp) => (
                <Area
                  key={sp.id}
                  type="monotone"
                  dataKey={`${sp.id}_cost`}
                  stackId="1"
                  stroke={sp.chartColor}
                  fill={sp.chartColor}
                  fillOpacity={0.4}
                  strokeWidth={1.5}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
