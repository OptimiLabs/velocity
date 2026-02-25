"use client";

import { useState, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { format } from "date-fns";
import type {
  RoleBreakdownRow,
  AgentTypeRow,
  RoleDailyRow,
} from "@/hooks/useAnalytics";

const roleColors: Record<string, string> = {
  subagent: chartColors.chart3,
  standalone: chartColors.chart2,
};

const roleLabels: Record<string, string> = {
  subagent: "Subagent",
  standalone: "Standalone",
};

const tooltipStyle = chartTooltipStyle;

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

interface RoleBreakdownCardProps {
  byRole: RoleBreakdownRow[];
  daily: RoleDailyRow[];
  compareByRole?: RoleBreakdownRow[];
}

type View = "breakdown" | "daily";

export function RoleBreakdownCard({
  byRole,
  daily,
  compareByRole,
}: RoleBreakdownCardProps) {
  const [view, setView] = useState<View>("breakdown");

  const chartData = byRole.map((r) => ({
    role: roleLabels[r.role] || r.role,
    cost: r.totalCost,
    rawRole: r.role,
    sessionCount: r.sessionCount,
    messageCount: r.messageCount,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cacheReadTokens: r.cacheReadTokens,
  }));

  const compareMap = useMemo(() => {
    if (!compareByRole) return null;
    const map = new Map<string, RoleBreakdownRow>();
    for (const r of compareByRole) map.set(r.role, r);
    return map;
  }, [compareByRole]);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-section-title">Cost by Role</CardTitle>
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
        {view === "breakdown" ? (
          <>
            {/* Horizontal bar chart */}
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
                  dataKey="role"
                  tick={chartTickStyle}
                  width={85}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    const totalTokens =
                      d.inputTokens + d.outputTokens + d.cacheReadTokens;
                    const cachePct =
                      totalTokens > 0
                        ? ((d.cacheReadTokens / totalTokens) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <div style={tooltipStyle} className="px-3 py-2 space-y-1">
                        <div className="font-medium text-foreground flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{
                              background:
                                roleColors[d.rawRole] || chartColors.chart5,
                            }}
                          />
                          {d.role}
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
                          <span>Cache</span>
                          <span className="text-right tabular-nums">
                            {formatTokens(d.cacheReadTokens)} ({cachePct}%)
                          </span>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((entry) => (
                    <Cell
                      key={entry.role}
                      fill={roleColors[entry.rawRole] || chartColors.chart5}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Summary row */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {byRole.map((r) => {
                const cmpRow = compareMap?.get(r.role);
                const delta = cmpRow
                  ? pctChange(r.totalCost, cmpRow.totalCost)
                  : null;

                return (
                  <span key={r.role} className="flex items-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: roleColors[r.role] || chartColors.chart5,
                      }}
                    />
                    <span>{roleLabels[r.role] || r.role}:</span>
                    <span className="tabular-nums font-medium text-foreground">
                      {formatCost(r.totalCost)}
                    </span>
                    {cmpRow && (
                      <span className="text-muted-foreground tabular-nums">
                        ({formatCost(cmpRow.totalCost)})
                      </span>
                    )}
                    {delta !== null && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 text-xs",
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
                      ({r.sessionCount})
                    </span>
                  </span>
                );
              })}
            </div>
          </>
        ) : (
          /* Daily stacked area chart */
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={daily}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={chartGridStroke}
                />
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
                  const total =
                    (d?.standalone_cost || 0) + (d?.subagent_cost || 0);
                  return (
                    <div style={tooltipStyle} className="px-3 py-2 space-y-1">
                      <div className="font-medium text-foreground">
                        {label
                          ? format(new Date(label + "T00:00"), "MMM d, yyyy")
                          : ""}
                      </div>
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ background: chartColors.chart2 }}
                          />
                          Standalone
                        </span>
                        <span className="text-right tabular-nums">
                          {formatCost(d?.standalone_cost || 0)}
                          <span className="text-muted-foreground/60 ml-1">
                            ({d?.standalone_sessions || 0})
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ background: chartColors.chart3 }}
                          />
                          Subagent
                        </span>
                        <span className="text-right tabular-nums">
                          {formatCost(d?.subagent_cost || 0)}
                          <span className="text-muted-foreground/60 ml-1">
                            ({d?.subagent_sessions || 0})
                          </span>
                        </span>
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
              <Area
                type="monotone"
                dataKey="standalone_cost"
                stackId="1"
                stroke={chartColors.chart2}
                fill={chartColors.chart2}
                fillOpacity={0.4}
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="subagent_cost"
                stackId="1"
                stroke={chartColors.chart3}
                fill={chartColors.chart3}
                fillOpacity={0.4}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}

      </CardContent>
    </Card>
  );
}

export function SubagentTypeCard({
  byAgentType,
  compareByAgentType,
  compareLabels,
}: {
  byAgentType: AgentTypeRow[];
  compareByAgentType?: AgentTypeRow[];
  compareLabels?: [string, string];
}) {
  const compareMap = useMemo(() => {
    if (!compareByAgentType) return null;
    const map = new Map<string, AgentTypeRow>();
    for (const r of compareByAgentType) map.set(r.type, r);
    return map;
  }, [compareByAgentType]);
  const currentMap = useMemo(
    () => new Map(byAgentType.map((row) => [row.type, row])),
    [byAgentType],
  );
  const mergedRows = useMemo(() => {
    if (!compareMap) return byAgentType;
    const types = new Set<string>([...currentMap.keys(), ...compareMap.keys()]);
    return Array.from(types)
      .map((type) => {
        const current = currentMap.get(type);
        return (
          current ?? {
            type,
            sessionCount: 0,
            totalCost: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          }
        );
      })
      .sort((a, b) => {
        const aCompare = compareMap.get(a.type)?.totalCost ?? 0;
        const bCompare = compareMap.get(b.type)?.totalCost ?? 0;
        return Math.max(b.totalCost, bCompare) - Math.max(a.totalCost, aCompare);
      });
  }, [byAgentType, compareMap, currentMap]);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">
          Subagent Type Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        {compareMap && (
          <p className="mb-2 text-[10px] text-muted-foreground">
            Change values are calculated as{" "}
            <span className="text-foreground">
              {compareLabels?.[0] ?? "Primary"}
            </span>
            {" "}relative to{" "}
            <span className="text-foreground">
              {compareLabels?.[1] ?? "Comparison"}
            </span>.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="table-readable w-full">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="text-left py-1.5 pr-3 font-medium">
                  Agent Type
                </th>
                <th className="text-right py-1.5 px-2 font-medium">
                  Sessions
                </th>
                <th className="text-right py-1.5 px-2 font-medium">Cost</th>
                {compareMap && (
                  <th className="text-right py-1.5 px-2 font-medium">
                    Change
                  </th>
                )}
                <th className="text-right py-1.5 px-2 font-medium">
                  Input
                </th>
                <th className="text-right py-1.5 px-2 font-medium">
                  Output
                </th>
                <th className="text-right py-1.5 px-2 font-medium">
                  Cache Read
                </th>
                <th className="text-right py-1.5 pl-2 font-medium">
                  Cache %
                </th>
              </tr>
            </thead>
            <tbody>
              {mergedRows.map((at) => {
                const totalIn =
                  at.inputTokens +
                  at.cacheReadTokens +
                  (at.cacheWriteTokens || 0);
                const cr =
                  totalIn > 0 ? (at.cacheReadTokens / totalIn) * 100 : 0;
                const cmpRow = compareMap?.get(at.type);
                const delta = cmpRow
                  ? pctChange(at.totalCost, cmpRow.totalCost)
                  : null;
                return (
                  <tr
                    key={at.type}
                    className="border-b border-border/60 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-1.5 pr-3 font-mono text-foreground font-medium">
                      {at.type}
                    </td>
                    <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                      {at.sessionCount}
                    </td>
                    <td className="text-right py-1.5 px-2 tabular-nums font-medium">
                      {formatCost(at.totalCost)}
                    </td>
                    {compareMap && (
                      <td className="text-right py-1.5 px-2 tabular-nums">
                        {delta !== null ? (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-xs",
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
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                    )}
                    <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                      {formatTokens(at.inputTokens)}
                    </td>
                    <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                      {formatTokens(at.outputTokens)}
                    </td>
                    <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                      {formatTokens(at.cacheReadTokens)}
                    </td>
                    <td className="text-right py-1.5 pl-2 tabular-nums text-muted-foreground">
                      {cr.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
