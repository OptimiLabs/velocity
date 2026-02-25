"use client";

import { useMemo } from "react";
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
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import type { ToolUsageRow, CategorySummaryRow } from "@/hooks/useAnalytics";

const categoryChartColors: Record<string, string> = {
  core: chartColors.chart1,
  mcp: chartColors.chart2,
  skill: chartColors.chart4,
  agent: chartColors.chart3,
  other: chartColors.chart5,
};

const categoryDotColors: Record<string, string> = {
  core: "bg-chart-1",
  mcp: "bg-chart-2",
  skill: "bg-chart-4",
  agent: "bg-chart-3",
  other: "bg-chart-5",
};

function formatToolName(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    return parts.length >= 3 ? parts.slice(2).join("/") : name;
  }
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

interface Props {
  tools: ToolUsageRow[];
  categories: CategorySummaryRow[];
  compareTools?: ToolUsageRow[];
  compareCategories?: CategorySummaryRow[];
}

export function ToolUsageCard({ tools, categories, compareTools, compareCategories }: Props) {
  const categoryList = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    const catMap = new Map<string, CategorySummaryRow>();
    for (const t of tools) {
      const group = t.group || t.category;
      const existing = catMap.get(group);
      if (existing) {
        existing.totalCalls += t.totalCalls;
        existing.totalTokens += t.totalTokens;
        existing.estimatedCost += t.estimatedCost;
        existing.toolCount += 1;
      } else {
        catMap.set(group, {
          group,
          category: t.category,
          totalCalls: t.totalCalls,
          totalTokens: t.totalTokens,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          estimatedCost: t.estimatedCost,
          toolCount: 1,
        });
      }
    }
    return Array.from(catMap.values()).sort(
      (a, b) => b.totalCalls - a.totalCalls,
    );
  }, [tools, categories]);

  const chartData = useMemo(
    () =>
      categoryList.map((c) => ({
        group: c.group,
        totalCalls: c.totalCalls,
        category: c.category,
      })),
    [categoryList],
  );

  const toolsByCategory = useMemo(() => {
    const grouped = new Map<string, ToolUsageRow[]>();
    for (const t of tools) {
      const cat = t.group || t.category;
      if (!grouped.has(cat)) grouped.set(cat, []);
      grouped.get(cat)!.push(t);
    }
    for (const [key, list] of grouped) {
      grouped.set(
        key,
        list.sort((a, b) => b.totalCalls - a.totalCalls).slice(0, 5),
      );
    }
    return Array.from(grouped.entries()).sort(
      (a, b) =>
        b[1].reduce((s, t) => s + t.totalCalls, 0) -
        a[1].reduce((s, t) => s + t.totalCalls, 0),
    );
  }, [tools]);

  const compareCategoryMap = useMemo(() => {
    if (!compareCategories && !compareTools) return null;
    const map = new Map<string, CategorySummaryRow>();
    if (compareCategories && compareCategories.length > 0) {
      for (const c of compareCategories) map.set(c.group, c);
    } else if (compareTools) {
      for (const t of compareTools) {
        const group = t.group || t.category;
        const existing = map.get(group);
        if (existing) {
          existing.totalCalls += t.totalCalls;
          existing.totalTokens += t.totalTokens;
          existing.estimatedCost += t.estimatedCost;
          existing.toolCount += 1;
        } else {
          map.set(group, {
            group,
            category: t.category,
            totalCalls: t.totalCalls,
            totalTokens: t.totalTokens,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            estimatedCost: t.estimatedCost,
            toolCount: 1,
          });
        }
      }
    }
    return map;
  }, [compareCategories, compareTools]);

  const compareToolMap = useMemo(() => {
    if (!compareTools) return null;
    const map = new Map<string, ToolUsageRow>();
    for (const t of compareTools) map.set(t.name, t);
    return map;
  }, [compareTools]);

  if (tools.length === 0) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">
          Tool Calls by Category
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top section: bar chart (left) + category summary (right) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Bar chart */}
          <div className="md:col-span-2">
            {chartData.length > 0 && (
              <ResponsiveContainer
                width="100%"
                height={Math.max(140, chartData.length * 36)}
              >
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={chartGridStroke}
                    opacity={0.3}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={chartTickStyle}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="group"
                    tick={chartTickStyle}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => [
                      `${Number(v ?? 0).toLocaleString()} calls`,
                      "Total Calls",
                    ]}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    labelFormatter={(label: any) => String(label)}
                  />
                  <Bar
                    dataKey="totalCalls"
                    radius={[0, 4, 4, 0]}
                    barSize={20}
                    fill={chartColors.chart2}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    shape={(props: any) => {
                      const cat = props?.payload?.category || "other";
                      const color =
                        categoryChartColors[cat] || categoryChartColors.other;
                      const { x, y, width, height } = props;
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
            )}
          </div>

          {/* Category summary dots */}
          <div className="md:col-span-1 space-y-1.5 overflow-y-auto max-h-[200px]">
            {categoryList.map((c) => {
              const cmpCat = compareCategoryMap?.get(c.group);
              const delta = cmpCat
                ? pctChange(c.totalCalls, cmpCat.totalCalls)
                : null;
              return (
                <div key={c.group} className="flex items-center gap-2 text-xs">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${categoryDotColors[c.category] || categoryDotColors.other}`}
                  />
                  <span className="font-medium truncate flex-1 min-w-0">
                    {c.group}
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {c.totalCalls.toLocaleString()}
                  </span>
                  {delta !== null && (
                    <span
                      className={`tabular-nums text-[10px] shrink-0 ${
                        Math.abs(delta) < 0.1
                          ? "text-muted-foreground"
                          : delta > 0
                            ? "text-success"
                            : "text-destructive"
                      }`}
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(0)}%
                    </span>
                  )}
                  <span className="tabular-nums text-muted-foreground/60 shrink-0">
                    {fmtCost(c.estimatedCost)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Separator */}
        <div className="h-px bg-border/50" />

        {/* Tools grouped by category */}
        <div className="space-y-3">
          {toolsByCategory.map(([category, catTools]) => {
            const catKey = catTools[0]?.category || "other";
            return (
              <div key={category} className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${categoryDotColors[catKey] || categoryDotColors.other}`}
                  />
                  {category}
                </div>
                {catTools.map((t) => {
                  const cmpTool = compareToolMap?.get(t.name);
                  const delta = cmpTool
                    ? pctChange(t.totalCalls, cmpTool.totalCalls)
                    : null;
                  return (
                    <div
                      key={t.name}
                      className="flex items-center gap-2 text-xs pl-3.5"
                      title={`${t.name}: ${t.totalCalls.toLocaleString()} calls · ${fmtTokens(t.totalTokens)} tokens · ${fmtCost(t.estimatedCost)}`}
                    >
                      <span className="font-mono text-muted-foreground truncate flex-1 min-w-0 text-[11px]">
                        {formatToolName(t.name)}
                      </span>
                      <span className="tabular-nums shrink-0">
                        {t.totalCalls.toLocaleString()}
                      </span>
                      {delta !== null && (
                        <span
                          className={`tabular-nums text-[10px] shrink-0 ${
                            Math.abs(delta) < 0.1
                              ? "text-muted-foreground"
                              : delta > 0
                                ? "text-success"
                                : "text-destructive"
                          }`}
                        >
                          {delta > 0 ? "+" : ""}
                          {delta.toFixed(0)}%
                        </span>
                      )}
                      <span className="tabular-nums text-muted-foreground/60 shrink-0">
                        {fmtCost(t.estimatedCost)}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
