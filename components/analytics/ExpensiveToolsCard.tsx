"use client";

import { useState, useMemo, Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import type { ToolUsageRow, CategorySummaryRow } from "@/hooks/useAnalytics";

const BUILTIN_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "NotebookEdit",
  "TodoRead",
  "TodoWrite",
  "Bash",
  "WebFetch",
  "WebSearch",
]);

const categoryColors: Record<string, string> = {
  core: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  mcp: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  skill: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  other: "bg-chart-5/20 text-chart-5 border-chart-5/30",
};

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

interface ExpensiveToolsCardProps {
  data: ToolUsageRow[];
  compareData?: ToolUsageRow[];
  byRole?: {
    standalone: { tools: ToolUsageRow[]; categories: CategorySummaryRow[] };
    subagent: { tools: ToolUsageRow[]; categories: CategorySummaryRow[] };
  };
}

function ToolRoleSubRow({
  label,
  row,
  color,
}: {
  label: string;
  row: ToolUsageRow | undefined;
  color: string;
}) {
  if (!row) return null;
  const avgCost = row.totalCalls > 0 ? row.estimatedCost / row.totalCalls : 0;
  return (
    <tr className="border-b border-border/60">
      <td className="py-1.5 pl-6 pr-3 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", color)} />
          {label}
        </span>
      </td>
      <td className="text-right py-1.5 px-3 text-muted-foreground tabular-nums text-xs">
        {row.totalCalls.toLocaleString()}
      </td>
      <td
        className="text-right py-1.5 px-3 text-muted-foreground tabular-nums text-xs"
        colSpan={6}
      />
      <td className="text-right py-1.5 px-3 text-muted-foreground tabular-nums text-xs">
        {formatCost(avgCost)}
      </td>
      <td className="text-right py-1.5 px-3 text-muted-foreground tabular-nums text-xs">
        {formatCost(row.estimatedCost)}
      </td>
    </tr>
  );
}

export function ExpensiveToolsCard({
  data,
  compareData,
  byRole,
}: ExpensiveToolsCardProps) {
  const [sortMode, setSortMode] = useState<"total" | "avg">("total");
  const [hideBuiltins, setHideBuiltins] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const ranked = useMemo(() => {
    let filtered = data.filter((t) => t.totalCalls > 0);
    if (hideBuiltins) {
      filtered = filtered.filter((t) => !BUILTIN_TOOLS.has(t.name));
    }
    return filtered
      .map((t) => ({
        ...t,
        avgCost: t.estimatedCost / t.totalCalls,
        avgTokens: t.totalTokens / t.totalCalls,
        cacheRate:
          t.totalTokens > 0 ? (t.cacheReadTokens / t.totalTokens) * 100 : 0,
      }))
      .sort((a, b) =>
        sortMode === "total"
          ? b.estimatedCost - a.estimatedCost
          : b.avgCost - a.avgCost,
      )
      .slice(0, 15);
  }, [data, sortMode, hideBuiltins]);

  const compareMap = useMemo(() => {
    if (!compareData) return null;
    const map = new Map<string, ToolUsageRow>();
    for (const t of compareData) map.set(t.name, t);
    return map;
  }, [compareData]);

  const standaloneToolMap = useMemo(() => {
    if (!byRole) return new Map<string, ToolUsageRow>();
    return new Map(byRole.standalone.tools.map((t) => [t.name, t]));
  }, [byRole]);

  const subagentToolMap = useMemo(() => {
    if (!byRole) return new Map<string, ToolUsageRow>();
    return new Map(byRole.subagent.tools.map((t) => [t.name, t]));
  }, [byRole]);

  function toggleTool(name: string) {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (ranked.length === 0) return null;

  const hasBreakdown = !!byRole;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-section-title">Expensive Tools</CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant={hideBuiltins ? "default" : "ghost"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setHideBuiltins(!hideBuiltins)}
            >
              Hide builtins
            </Button>
            <div className="flex items-center rounded-md border border-border/50 overflow-hidden">
              <button
                className={`h-6 text-xs px-2 transition-colors ${sortMode === "total" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                onClick={() => setSortMode("total")}
              >
                Total
              </button>
              <button
                className={`h-6 text-xs px-2 transition-colors ${sortMode === "avg" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                onClick={() => setSortMode("avg")}
              >
                Avg/call
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="table-readable w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Tool</th>
                <th className="text-right py-2 px-3 font-medium">Calls</th>
                <th className="text-right py-2 px-3 font-medium">
                  Total Tokens
                </th>
                <th className="text-right py-2 px-3 font-medium">Input</th>
                <th className="text-right py-2 px-3 font-medium">Output</th>
                <th className="text-right py-2 px-3 font-medium">Cache Read</th>
                <th className="text-right py-2 px-3 font-medium">Cache %</th>
                <th className="text-right py-2 px-3 font-medium">Errors</th>
                <th className="text-right py-2 px-3 font-medium">Avg Cost</th>
                <th className="text-right py-2 px-3 font-medium">Total Cost</th>
                {compareMap && (
                  <th className="text-right py-2 px-3 font-medium">
                    Prev Cost
                  </th>
                )}
                {compareMap && (
                  <th className="text-right py-2 pl-3 font-medium">Change</th>
                )}
              </tr>
            </thead>
            <tbody>
              {ranked.map((tool) => {
                const cmpRow = compareMap?.get(tool.name);
                const delta = cmpRow
                  ? pctChange(tool.estimatedCost, cmpRow.estimatedCost)
                  : null;
                const isExpanded = expandedTools.has(tool.name);

                return (
                  <Fragment key={tool.name}>
                    <tr
                      className={cn(
                        "border-b border-border/30 transition-colors",
                        hasBreakdown
                          ? "cursor-pointer hover:bg-muted/30"
                          : "hover:bg-muted/30",
                      )}
                      onClick={
                        hasBreakdown ? () => toggleTool(tool.name) : undefined
                      }
                    >
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-1.5">
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
                          <span className="font-mono text-foreground font-medium">
                            {tool.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-micro px-1 py-0 leading-tight ${categoryColors[tool.category] || categoryColors.other}`}
                          >
                            {tool.category}
                          </Badge>
                        </div>
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                        {tool.totalCalls.toLocaleString()}
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                        {formatTokens(tool.totalTokens)}
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                        {formatTokens(tool.inputTokens)}
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                        {formatTokens(tool.outputTokens)}
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                        {formatTokens(tool.cacheReadTokens)}
                      </td>
                      <td className="text-right py-2 px-3 tabular-nums">
                        <span
                          className={
                            tool.cacheRate > 50
                              ? "text-emerald-400"
                              : tool.cacheRate > 20
                                ? "text-yellow-400"
                                : "text-muted-foreground"
                          }
                        >
                          {tool.cacheRate.toFixed(0)}%
                        </span>
                      </td>
                      <td
                        className={cn(
                          "text-right py-2 px-3 tabular-nums",
                          (tool.errorCount ?? 0) > 0
                            ? "text-destructive"
                            : "text-muted-foreground/40 dark:text-foreground/40",
                        )}
                        title={
                          (tool.errorCount ?? 0) > 0
                            ? `${tool.errorCount}/${tool.totalCalls} (${((tool.errorCount ?? 0) / tool.totalCalls * 100).toFixed(1)}%)`
                            : "No errors"
                        }
                      >
                        {(tool.errorCount ?? 0) > 0 ? tool.errorCount : "–"}
                      </td>
                      <td
                        className={`text-right py-2 px-3 tabular-nums ${sortMode === "avg" ? "font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        {formatCost(tool.avgCost)}
                      </td>
                      <td
                        className={`text-right py-2 px-3 tabular-nums ${sortMode === "total" ? "font-medium text-foreground" : "text-muted-foreground"}`}
                      >
                        {formatCost(tool.estimatedCost)}
                      </td>
                      {compareMap && (
                        <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                          {cmpRow ? formatCost(cmpRow.estimatedCost) : "—"}
                        </td>
                      )}
                      {compareMap && (
                        <td className="text-right py-2 pl-3 tabular-nums">
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
                                <Minus size={10} />
                              ) : delta > 0 ? (
                                <TrendingUp size={10} />
                              ) : (
                                <TrendingDown size={10} />
                              )}
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      )}
                    </tr>
                    {isExpanded && hasBreakdown && (
                      <>
                        <ToolRoleSubRow
                          key={`${tool.name}-standalone`}
                          label="Standalone"
                          row={standaloneToolMap.get(tool.name)}
                          color="bg-chart-2"
                        />
                        <ToolRoleSubRow
                          key={`${tool.name}-subagent`}
                          label="Subagent"
                          row={subagentToolMap.get(tool.name)}
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
