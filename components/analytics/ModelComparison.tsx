"use client";

import { useState, useMemo, Fragment } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import type { ModelUsageRow } from "@/hooks/useAnalytics";

type MetricKey =
  | "cost"
  | "inputTokens"
  | "outputTokens"
  | "cacheReadTokens"
  | "sessionCount";

function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function formatMetricValue(key: MetricKey, value: number): string {
  if (key === "cost") return formatCost(value);
  if (key === "sessionCount") return value.toLocaleString();
  return formatTokens(value);
}

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

function Delta({
  current,
  previous,
  invert,
}: {
  current: number;
  previous: number;
  invert?: boolean;
}) {
  const pct = pctChange(current, previous);
  if (Math.abs(pct) < 0.1) {
    return (
      <span className="text-micro text-muted-foreground flex items-center justify-end gap-0.5">
        <Minus size={8} />
        0%
      </span>
    );
  }
  const isUp = pct > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <span
      className={cn(
        "text-micro flex items-center justify-end gap-0.5",
        isGood ? "text-success" : "text-destructive",
      )}
    >
      {isUp ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
      {isUp ? "+" : ""}
      {pct.toFixed(0)}%
    </span>
  );
}

const tooltipStyle = chartTooltipStyle;

interface ModelComparisonProps {
  models: ModelUsageRow[];
  compareModels?: ModelUsageRow[];
  periodA: string;
  periodB?: string;
  byRole?: {
    standalone: ModelUsageRow[];
    subagent: ModelUsageRow[];
  };
}

function cacheRate(row: ModelUsageRow) {
  const totalInput =
    row.inputTokens + row.cacheReadTokens + (row.cacheWriteTokens || 0);
  return totalInput > 0 ? (row.cacheReadTokens / totalInput) * 100 : 0;
}

function RoleSubRow({
  label,
  row,
  color,
}: {
  label: string;
  row: ModelUsageRow | undefined;
  color: string;
}) {
  if (!row) return null;
  const cr = cacheRate(row);
  return (
    <tr className="border-b border-border/20">
      <td className="py-1.5 pl-6 pr-3 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", color)} />
          {label}
        </span>
      </td>
      <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground text-xs">
        {formatCost(row.cost)}
      </td>
      <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground text-xs">
        {row.sessionCount}
      </td>
      <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground text-xs">
        {formatTokens(row.inputTokens)}
      </td>
      <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground text-xs">
        {formatTokens(row.outputTokens)}
      </td>
      <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground text-xs">
        {formatTokens(row.cacheReadTokens)}
      </td>
      <td className="text-right py-1.5 pl-3 tabular-nums text-muted-foreground text-xs">
        {cr.toFixed(1)}%
      </td>
    </tr>
  );
}

export function ModelComparison({
  models,
  compareModels,
  periodA,
  periodB,
  byRole,
}: ModelComparisonProps) {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("cost");
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const comparing = !!compareModels;

  const compareMap = useMemo(() => {
    if (!compareModels) return new Map<string, ModelUsageRow>();
    return new Map(compareModels.map((m) => [m.model, m]));
  }, [compareModels]);

  const standaloneMap = useMemo(() => {
    if (!byRole) return new Map<string, ModelUsageRow>();
    return new Map(byRole.standalone.map((m) => [m.model, m]));
  }, [byRole]);

  const subagentMap = useMemo(() => {
    if (!byRole) return new Map<string, ModelUsageRow>();
    return new Map(byRole.subagent.map((m) => [m.model, m]));
  }, [byRole]);

  // All unique models across both periods, sorted by current period metric
  const allModels = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const m of models) {
      seen.add(m.model);
      result.push(m.model);
    }
    if (compareModels) {
      for (const m of compareModels) {
        if (!seen.has(m.model)) {
          seen.add(m.model);
          result.push(m.model);
        }
      }
    }
    return result;
  }, [models, compareModels]);

  const modelMap = useMemo(
    () => new Map(models.map((m) => [m.model, m])),
    [models],
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const chartData = useMemo(() => {
    return allModels
      .map((model) => {
        const curr = modelMap.get(model);
        const prev = compareMap.get(model);
        return {
          model: shortModel(model),
          current: curr?.[activeMetric] ?? 0,
          ...(comparing ? { previous: prev?.[activeMetric] ?? 0 } : {}),
        };
      })
      .sort((a, b) =>
        sortDir === "desc" ? b.current - a.current : a.current - b.current,
      );
  }, [allModels, modelMap, compareMap, activeMetric, comparing, sortDir]);

  function cycleSortColumn(key: MetricKey) {
    if (activeMetric === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setActiveMetric(key);
      setSortDir("desc");
    }
  }

  function toggleModel(model: string) {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Model Comparison</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ResponsiveContainer
          width="100%"
          height={Math.max(120, chartData.length * (comparing ? 50 : 40))}
        >
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ left: 10, right: 10 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartGridStroke}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={chartTickStyle}
              tickFormatter={(v: number) => formatMetricValue(activeMetric, v)}
            />
            <YAxis
              dataKey="model"
              type="category"
              tick={chartTickStyle}
              width={100}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => [
                formatMetricValue(activeMetric, Number(v ?? 0)),
                name === "current" ? periodA : (periodB ?? "Previous"),
              ]}
            />
            <Bar
              dataKey="current"
              name={periodA}
              fill={chartColors.chart1}
              radius={[0, 3, 3, 0]}
              opacity={0.85}
              barSize={comparing ? 16 : undefined}
            />
            {comparing && (
              <Bar
                dataKey="previous"
                name={periodB ?? "Previous"}
                fill={chartColors.chart4}
                radius={[0, 3, 3, 0]}
                opacity={0.5}
                barSize={16}
              />
            )}
            {comparing && (
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }} />
            )}
          </BarChart>
        </ResponsiveContainer>

        <div className="overflow-x-auto">
          <table className="table-readable w-full text-sm">
            <thead>
              <tr className="border-b border-border/30">
                <th className="text-left py-2 pr-3 text-muted-foreground font-medium">
                  Model
                </th>
                {(
                  [
                    { key: "cost" as MetricKey, label: "Cost", last: false },
                    {
                      key: "sessionCount" as MetricKey,
                      label: "Sessions",
                      last: false,
                    },
                    {
                      key: "inputTokens" as MetricKey,
                      label: "Input",
                      last: false,
                    },
                    {
                      key: "outputTokens" as MetricKey,
                      label: "Output",
                      last: false,
                    },
                    {
                      key: "cacheReadTokens" as MetricKey,
                      label: "Cache Read",
                      last: false,
                    },
                  ] as const
                ).map(({ key, label }) => (
                  <th
                    key={key}
                    className={cn(
                      "text-right py-2 px-3 font-medium cursor-pointer select-none transition-colors hover:text-foreground",
                      activeMetric === key
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                    onClick={() => cycleSortColumn(key)}
                  >
                    <span className="inline-flex items-center justify-end gap-0.5">
                      {label}
                      {activeMetric === key &&
                        (sortDir === "desc" ? (
                          <ArrowDown size={10} className="text-primary" />
                        ) : (
                          <ArrowUp size={10} className="text-primary" />
                        ))}
                    </span>
                  </th>
                ))}
                <th className="text-right py-2 pl-3 text-muted-foreground font-medium">
                  Cache %
                </th>
              </tr>
            </thead>
            <tbody>
              {allModels
                .sort((a, b) => {
                  const va = modelMap.get(a)?.[activeMetric] ?? 0;
                  const vb = modelMap.get(b)?.[activeMetric] ?? 0;
                  return sortDir === "desc" ? vb - va : va - vb;
                })
                .map((model) => {
                  const row = modelMap.get(model);
                  const comp = compareMap.get(model);
                  const cr = row ? cacheRate(row) : 0;
                  const compCr = comp ? cacheRate(comp) : 0;
                  const isExpanded = expandedModels.has(model);
                  const hasBreakdown = !!byRole;
                  return (
                    <Fragment key={model}>
                      <tr
                        className={cn(
                          "border-b border-border/30",
                          hasBreakdown &&
                            "cursor-pointer hover:bg-muted/30 transition-colors",
                        )}
                        onClick={
                          hasBreakdown ? () => toggleModel(model) : undefined
                        }
                      >
                        <td className="py-2 pr-3 font-mono text-foreground font-medium">
                          <span className="flex items-center gap-1">
                            {hasBreakdown &&
                              (isExpanded ? (
                                <ChevronDown
                                  size={14}
                                  className="text-muted-foreground shrink-0"
                                />
                              ) : (
                                <ChevronRight
                                  size={14}
                                  className="text-muted-foreground shrink-0"
                                />
                              ))}
                            {shortModel(model)}
                          </span>
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <div className="text-foreground">
                            {formatCost(row?.cost ?? 0)}
                          </div>
                          {comp && (
                            <Delta
                              current={row?.cost ?? 0}
                              previous={comp.cost}
                              invert
                            />
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <div className="text-foreground">
                            {row?.sessionCount ?? 0}
                          </div>
                          {comp && (
                            <Delta
                              current={row?.sessionCount ?? 0}
                              previous={comp.sessionCount}
                            />
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <div className="text-foreground">
                            {formatTokens(row?.inputTokens ?? 0)}
                          </div>
                          {comp && (
                            <Delta
                              current={row?.inputTokens ?? 0}
                              previous={comp.inputTokens}
                            />
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <div className="text-foreground">
                            {formatTokens(row?.outputTokens ?? 0)}
                          </div>
                          {comp && (
                            <Delta
                              current={row?.outputTokens ?? 0}
                              previous={comp.outputTokens}
                            />
                          )}
                        </td>
                        <td className="text-right py-2 px-3 tabular-nums">
                          <div className="text-foreground">
                            {formatTokens(row?.cacheReadTokens ?? 0)}
                          </div>
                          {comp && (
                            <Delta
                              current={row?.cacheReadTokens ?? 0}
                              previous={comp.cacheReadTokens}
                            />
                          )}
                        </td>
                        <td className="text-right py-2 pl-3 tabular-nums">
                          <div className="text-foreground">
                            {cr.toFixed(1)}%
                          </div>
                          {comp && <Delta current={cr} previous={compCr} />}
                        </td>
                      </tr>
                      {isExpanded && hasBreakdown && (
                        <>
                          <RoleSubRow
                            key={`${model}-standalone`}
                            label="Standalone"
                            row={standaloneMap.get(model)}
                            color="bg-chart-2"
                          />
                          <RoleSubRow
                            key={`${model}-subagent`}
                            label="Subagent"
                            row={subagentMap.get(model)}
                            color="bg-chart-3"
                          />
                        </>
                      )}
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
