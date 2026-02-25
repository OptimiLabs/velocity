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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import type { ToolUsageRow, CategorySummaryRow } from "@/hooks/useAnalytics";

const categoryColors: Record<string, string> = {
  core: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  mcp: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  skill: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  agent: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  other: "bg-chart-5/20 text-chart-5 border-chart-5/30",
};

const categoryChartColors: Record<string, string> = {
  core: chartColors.chart1,
  mcp: chartColors.chart2,
  skill: chartColors.chart4,
  agent: chartColors.chart3,
  other: chartColors.chart5,
};

function formatToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    return parts.length >= 3 ? parts.slice(2).join("/") : name;
  }
  // Task:Explore → Explore, Skill:superpowers:writing-plans → superpowers:writing-plans
  if (name.startsWith("Task:") || name.startsWith("Skill:")) {
    return name.slice(name.indexOf(":") + 1);
  }
  return name;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(3)}`;
  return "$0";
}

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

/** Compact token cell — shows value or dim dash if zero */
function TokenCell({ value, title }: { value: number; title?: string }) {
  if (!value)
    return (
      <td className="py-1.5 px-2 text-right tabular-nums text-text-tertiary">
        –
      </td>
    );
  return (
    <td
      className="py-1.5 px-2 text-right tabular-nums text-muted-foreground"
      title={title || `${value.toLocaleString()} tokens`}
    >
      {fmtTokens(value)}
    </td>
  );
}

interface Props {
  data: ToolUsageRow[];
  categories?: CategorySummaryRow[];
  compareData?: ToolUsageRow[];
}

export function ToolAnalyticsCard({ data, categories, compareData }: Props) {
  const compareMap = useMemo(() => {
    if (!compareData) return null;
    const map = new Map<string, ToolUsageRow>();
    for (const t of compareData) map.set(t.name, t);
    return map;
  }, [compareData]);

  // Build categories from data if not provided (backwards compat)
  const categoryList = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    const catMap = new Map<string, CategorySummaryRow>();
    for (const t of data) {
      const group = t.group || t.category;
      const existing = catMap.get(group);
      if (existing) {
        existing.totalCalls += t.totalCalls;
        existing.totalTokens += t.totalTokens;
        existing.inputTokens += t.inputTokens || 0;
        existing.outputTokens += t.outputTokens || 0;
        existing.cacheReadTokens += t.cacheReadTokens || 0;
        existing.cacheWriteTokens += t.cacheWriteTokens || 0;
        existing.estimatedCost += t.estimatedCost;
        existing.toolCount += 1;
      } else {
        catMap.set(group, {
          group,
          category: t.category,
          totalCalls: t.totalCalls,
          totalTokens: t.totalTokens,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          cacheReadTokens: t.cacheReadTokens || 0,
          cacheWriteTokens: t.cacheWriteTokens || 0,
          estimatedCost: t.estimatedCost,
          toolCount: 1,
        });
      }
    }
    return Array.from(catMap.values()).sort(
      (a, b) => b.totalCalls - a.totalCalls,
    );
  }, [data, categories]);

  // Group tools by group name, sorted by group total calls desc
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        group: string;
        category: string;
        totalCalls: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
        estimatedCost: number;
        errorCount: number;
        sessionCount: number;
        tools: ToolUsageRow[];
      }
    >();
    for (const t of data) {
      const groupName = t.group || t.category;
      const existing = map.get(groupName);
      if (existing) {
        existing.totalCalls += t.totalCalls;
        existing.inputTokens += t.inputTokens || 0;
        existing.outputTokens += t.outputTokens || 0;
        existing.cacheReadTokens += t.cacheReadTokens || 0;
        existing.cacheWriteTokens += t.cacheWriteTokens || 0;
        existing.estimatedCost += t.estimatedCost;
        existing.errorCount += t.errorCount ?? 0;
        existing.sessionCount = Math.max(existing.sessionCount, t.sessionCount);
        existing.tools.push(t);
      } else {
        map.set(groupName, {
          group: groupName,
          category: t.category,
          totalCalls: t.totalCalls,
          inputTokens: t.inputTokens || 0,
          outputTokens: t.outputTokens || 0,
          cacheReadTokens: t.cacheReadTokens || 0,
          cacheWriteTokens: t.cacheWriteTokens || 0,
          estimatedCost: t.estimatedCost,
          errorCount: t.errorCount ?? 0,
          sessionCount: t.sessionCount,
          tools: [t],
        });
      }
    }
    // Sort tools within each group
    for (const g of map.values()) {
      g.tools.sort((a, b) => b.totalCalls - a.totalCalls);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCalls - a.totalCalls);
  }, [data]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  if (data.length === 0) return null;

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  // Chart data: per-group totals
  const chartData = categoryList.map((c) => ({
    group: c.group,
    totalCalls: c.totalCalls,
    category: c.category,
  }));

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Tool Usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Category summary cards */}
        <div className="flex flex-wrap gap-2">
          {categoryList.map((c) => (
            <div
              key={c.group}
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${categoryColors[c.category] || categoryColors.other}`}
              title={`${c.group}: ${c.totalCalls.toLocaleString()} calls · In: ${c.inputTokens.toLocaleString()} · Out: ${c.outputTokens.toLocaleString()} · Cache↓: ${c.cacheReadTokens.toLocaleString()} · Cache↑: ${c.cacheWriteTokens.toLocaleString()} · ${fmtCost(c.estimatedCost)}`}
            >
              <span className="font-medium">{c.group}</span>
              <span className="tabular-nums opacity-80">
                {c.totalCalls.toLocaleString()} calls
              </span>
              <span className="opacity-50">&middot;</span>
              <span className="tabular-nums opacity-60">
                {fmtTokens(c.totalTokens)} tok
              </span>
              <span className="opacity-50">&middot;</span>
              <span className="tabular-nums opacity-60">
                {fmtCost(c.estimatedCost)}
              </span>
            </div>
          ))}
        </div>

        {/* Per-group bar chart */}
        <ResponsiveContainer
          width="100%"
          height={Math.max(140, chartData.length * 36)}
        >
          <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartGridStroke}
              opacity={0.3}
              horizontal={false}
            />
            <XAxis type="number" tick={chartTickStyle} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="group"
              tick={chartTickStyle}
              width={120}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(v: number | string | undefined) => [
                `${Number(v ?? 0).toLocaleString()} calls`,
                "Total Calls",
              ]}
              labelFormatter={(label: unknown) => String(label)}
            />
            <Bar
              dataKey="totalCalls"
              radius={[0, 4, 4, 0]}
              barSize={20}
               
              fill={chartColors.chart2}
              // Use per-category colors via Cell
              shape={(props: {
                payload?: { category?: string };
                x?: number;
                y?: number;
                width?: number;
                height?: number;
              }) => {
                const cat = props.payload?.category || "other";
                const color =
                  categoryChartColors[cat] || categoryChartColors.other;
                const x = props.x ?? 0;
                const y = props.y ?? 0;
                const width = props.width ?? 0;
                const height = props.height ?? 0;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={color}
                    rx={4}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>

        {/* Grouped table */}
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="table-readable w-full min-w-[900px] text-sm">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-1.5 pr-2 font-medium">Tool</th>
                <th className="text-left py-1.5 px-2 font-medium">Category</th>
                <th className="text-right py-1.5 px-2 font-medium">Calls</th>
                <th
                  className="text-right py-1.5 px-2 font-medium"
                  title="Input tokens"
                >
                  Input
                </th>
                <th
                  className="text-right py-1.5 px-2 font-medium"
                  title="Output tokens"
                >
                  Output
                </th>
                <th
                  className="text-right py-1.5 px-2 font-medium"
                  title="Cache read tokens (prompt caching hits)"
                >
                  Cache&nbsp;R
                </th>
                <th
                  className="text-right py-1.5 px-2 font-medium"
                  title="Cache write tokens (prompt caching creation)"
                >
                  Cache&nbsp;W
                </th>
                <th className="text-right py-1.5 px-2 font-medium">Cost</th>
                <th className="text-right py-1.5 px-2 font-medium">Errors</th>
                {compareMap && (
                  <th className="text-right py-1.5 px-2 font-medium">Prev Cost</th>
                )}
                {compareMap && (
                  <th className="text-right py-1.5 px-2 font-medium">Change</th>
                )}
                <th className="text-right py-1.5 pl-2 font-medium">Sessions</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => {
                const isCollapsed = collapsed.has(g.group);
                return (
                  <GroupRows
                    key={g.group}
                    group={g.group}
                    totalCalls={g.totalCalls}
                    inputTokens={g.inputTokens}
                    outputTokens={g.outputTokens}
                    cacheReadTokens={g.cacheReadTokens}
                    cacheWriteTokens={g.cacheWriteTokens}
                    estimatedCost={g.estimatedCost}
                    errorCount={g.errorCount}
                    sessionCount={g.sessionCount}
                    tools={g.tools}
                    isCollapsed={isCollapsed}
                    onToggle={() => toggleGroup(g.group)}
                    compareMap={compareMap}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupRows({
  group,
  totalCalls,
  inputTokens,
  outputTokens,
  cacheReadTokens,
  cacheWriteTokens,
  estimatedCost,
  errorCount,
  sessionCount,
  tools,
  isCollapsed,
  onToggle,
  compareMap,
}: {
  group: string;
  totalCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCost: number;
  errorCount: number;
  sessionCount: number;
  tools: ToolUsageRow[];
  isCollapsed: boolean;
  onToggle: () => void;
  compareMap: Map<string, ToolUsageRow> | null;
}) {
  return (
    <>
      {/* Group header row */}
      <tr
        className="border-b border-border cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <td className="py-1.5 pr-2 font-medium text-xs" colSpan={2}>
          <span className="inline-block w-3.5 text-muted-foreground text-micro mr-0.5">
            {isCollapsed ? "▸" : "▾"}
          </span>
          {group}
          <span className="ml-1.5 text-muted-foreground font-normal text-micro">
            ({tools.length})
          </span>
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums font-medium">
          {totalCalls.toLocaleString()}
        </td>
        <TokenCell
          value={inputTokens}
          title={`Input: ${inputTokens.toLocaleString()}`}
        />
        <TokenCell
          value={outputTokens}
          title={`Output: ${outputTokens.toLocaleString()}`}
        />
        <TokenCell
          value={cacheReadTokens}
          title={`Cache read: ${cacheReadTokens.toLocaleString()}`}
        />
        <TokenCell
          value={cacheWriteTokens}
          title={`Cache write: ${cacheWriteTokens.toLocaleString()}`}
        />
        <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
          {fmtCost(estimatedCost)}
        </td>
        <td
          className={cn(
            "py-1.5 px-2 text-right tabular-nums",
            errorCount > 0 ? "text-destructive" : "text-text-quaternary",
          )}
        >
          {errorCount > 0 ? errorCount.toLocaleString() : "–"}
        </td>
        {compareMap && (
          <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground" />
        )}
        {compareMap && (
          <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground" />
        )}
        <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
          {sessionCount.toLocaleString()}
        </td>
      </tr>
      {/* Individual tool rows */}
      {!isCollapsed &&
        tools.map((t) => {
          const cmpRow = compareMap?.get(t.name);
          const delta = cmpRow
            ? pctChange(t.estimatedCost, cmpRow.estimatedCost)
            : null;

          return (
            <tr key={t.name} className="border-b border-border/60">
              <td
                className="py-1.5 pl-6 pr-2 font-mono text-muted-foreground truncate max-w-[180px]"
                title={t.name}
              >
                {formatToolName(t.name)}
              </td>
              <td className="py-1.5 px-2">
                <Badge
                  variant="outline"
                  className={`text-micro px-1.5 py-0 ${categoryColors[t.category] || ""}`}
                >
                  {t.category}
                </Badge>
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums">
                {t.totalCalls.toLocaleString()}
              </td>
              <TokenCell
                value={t.inputTokens || 0}
                title={`Input: ${(t.inputTokens || 0).toLocaleString()}`}
              />
              <TokenCell
                value={t.outputTokens || 0}
                title={`Output: ${(t.outputTokens || 0).toLocaleString()}`}
              />
              <TokenCell
                value={t.cacheReadTokens || 0}
                title={`Cache read: ${(t.cacheReadTokens || 0).toLocaleString()}`}
              />
              <TokenCell
                value={t.cacheWriteTokens || 0}
                title={`Cache write: ${(t.cacheWriteTokens || 0).toLocaleString()}`}
              />
              <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                {fmtCost(t.estimatedCost)}
              </td>
              <td
                className={cn(
                  "py-1.5 px-2 text-right tabular-nums",
                  (t.errorCount ?? 0) > 0
                    ? "text-destructive"
                    : "text-text-quaternary",
                )}
                title={
                  (t.errorCount ?? 0) > 0
                    ? `${t.errorCount}/${t.totalCalls} (${(((t.errorCount ?? 0) / t.totalCalls) * 100).toFixed(1)}%)`
                    : "No errors"
                }
              >
                {(t.errorCount ?? 0) > 0 ? t.errorCount : "–"}
              </td>
              {compareMap && (
                <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                  {cmpRow ? fmtCost(cmpRow.estimatedCost) : "—"}
                </td>
              )}
              {compareMap && (
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {delta !== null ? (
                    <span
                      className={cn(
                        "flex items-center justify-end gap-1",
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
                    "—"
                  )}
                </td>
              )}
              <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
                {t.sessionCount.toLocaleString()}
              </td>
            </tr>
          );
        })}
    </>
  );
}
