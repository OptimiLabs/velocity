"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  useToolAnalytics,
  useProjects,
  useFilterOptions,
  type AnalyticsFilters,
  type ToolUsageRow,
} from "@/hooks/useAnalytics";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { FilterBar } from "@/components/analytics/FilterBar";
import { TabBar } from "@/components/layout/TabBar";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/date-range-picker";
import { TablePagination } from "@/components/ui/table-pagination";
import {
  SortableHeader,
  type ColumnDef,
} from "@/components/analytics/ExploreTableLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { sortRows, type SortState } from "@/lib/table-sort";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import {
  ArrowLeft,
  Columns3,
  Check,
  Wrench,
  Hash,
  DollarSign,
  Trophy,
  Zap,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import {
  chartColors,
  chartTickStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import { SummaryBox } from "@/components/analytics/tools/SummaryBox";
import { ToolRow, type EnrichedTool, type Col } from "@/components/analytics/tools/ToolRow";
import { TotalsFooter } from "@/components/analytics/tools/TotalsFooter";
import { GroupedTable } from "@/components/analytics/tools/GroupedTable";


// ─── Constants ──────────────────────────────────────────────────────────────

type SplitMode = "category" | "agentType" | "none";

const SPLIT_TABS = [
  { id: "category" as const, label: "By Category" },
  { id: "agentType" as const, label: "By Agent" },
  { id: "none" as const, label: "All Tools" },
];

const categoryColors: Record<string, string> = {
  core: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  mcp: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  agent: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  skill: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  other: "bg-chart-5/20 text-chart-5 border-chart-5/30",
};

const categoryChartColors: Record<string, string> = {
  core: chartColors.chart1,
  mcp: chartColors.chart2,
  agent: chartColors.chart3,
  skill: chartColors.chart4,
  other: chartColors.chart5,
};

const AGENT_TYPE_COLORS = [
  chartColors.chart1,
  chartColors.chart2,
  chartColors.chart3,
  chartColors.chart4,
  chartColors.chart5,
];

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function enrichTools(tools: ToolUsageRow[]): EnrichedTool[] {
  return tools.map((t) => ({
    ...t,
    avgCost: t.totalCalls > 0 ? t.estimatedCost / t.totalCalls : 0,
    cacheRate:
      t.totalTokens > 0 ? (t.cacheReadTokens / t.totalTokens) * 100 : 0,
  }));
}

// ─── Column definitions ─────────────────────────────────────────────────────

const COLUMNS: Col[] = [
  {
    key: "name",
    label: "Tool",
    value: (r) => r.name,
    render: (r) => (
      <span
        className="font-mono text-foreground truncate max-w-[240px] block"
        title={r.name}
      >
        {formatToolName(r.name)}
      </span>
    ),
  },
  {
    key: "category",
    label: "Category",
    value: (r) => r.category,
    render: (r) => (
      <Badge
        variant="outline"
        className={`text-micro px-1 py-0 leading-tight ${categoryColors[r.category] || categoryColors.other}`}
      >
        {r.category}
      </Badge>
    ),
  },
  {
    key: "group",
    label: "Group",
    defaultVisible: false,
    value: (r) => r.group,
    render: (r) => <span className="text-muted-foreground">{r.group}</span>,
  },
  {
    key: "totalCalls",
    label: "Calls",
    align: "right",
    value: (r) => r.totalCalls,
    render: (r) => r.totalCalls.toLocaleString(),
  },
  {
    key: "inputTokens",
    label: "Input Tokens",
    align: "right",
    value: (r) => r.inputTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.inputTokens)}
      </span>
    ),
  },
  {
    key: "outputTokens",
    label: "Output Tokens",
    align: "right",
    value: (r) => r.outputTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.outputTokens)}
      </span>
    ),
  },
  {
    key: "cacheReadTokens",
    label: "Cache Read",
    align: "right",
    defaultVisible: false,
    value: (r) => r.cacheReadTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.cacheReadTokens)}
      </span>
    ),
  },
  {
    key: "cacheWriteTokens",
    label: "Cache Write",
    align: "right",
    defaultVisible: false,
    value: (r) => r.cacheWriteTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.cacheWriteTokens)}
      </span>
    ),
  },
  {
    key: "cacheRate",
    label: "Cache %",
    align: "right",
    value: (r) => r.cacheRate,
    render: (r) => (
      <span
        className={
          r.cacheRate > 50
            ? "text-emerald-400"
            : r.cacheRate > 20
              ? "text-yellow-400"
              : "text-muted-foreground"
        }
      >
        {r.cacheRate.toFixed(0)}%
      </span>
    ),
  },
  {
    key: "avgCost",
    label: "Avg Cost",
    align: "right",
    value: (r) => r.avgCost,
    render: (r) => (
      <span className="text-muted-foreground">{formatCost(r.avgCost)}</span>
    ),
  },
  {
    key: "estimatedCost",
    label: "Total Cost",
    align: "right",
    value: (r) => r.estimatedCost,
    render: (r) => (
      <span className="font-medium text-foreground">
        {formatCost(r.estimatedCost)}
      </span>
    ),
  },
  {
    key: "sessionCount",
    label: "Sessions",
    align: "right",
    value: (r) => r.sessionCount,
    render: (r) => (
      <span className="text-muted-foreground">
        {r.sessionCount.toLocaleString()}
      </span>
    ),
  },
];

const LAYOUT_COLUMNS: ColumnDef[] = COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  defaultVisible: c.defaultVisible,
}));

function defaultVisibleSet(): Set<string> {
  return new Set(
    COLUMNS.filter((c) => c.defaultVisible !== false).map((c) => c.key),
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ToolsAnalyticsPage() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  });
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [splitBy, setSplitBy] = useState<SplitMode>("category");
  const [sort, setSort] = useState<SortState>({
    column: "estimatedCost",
    dir: "desc",
  });
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 200);
  const [visibleColumns, setVisibleColumns] = useState(defaultVisibleSet);
  const [page, setPage] = useState(0);
  const [chartMetric, setChartMetric] = useState<"cost" | "calls">("cost");
  const [colOpen, setColOpen] = useState(false);

  const { from, to } = useMemo(
    () => ({
      from: dateRange.from
        ? format(dateRange.from, "yyyy-MM-dd")
        : format(subDays(new Date(), 30), "yyyy-MM-dd"),
      to: dateRange.to
        ? format(dateRange.to, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
    }),
    [dateRange],
  );

  const { data: projects } = useProjects();
  const { data: filterOptions } = useFilterOptions(
    from,
    to,
    filters.projectId,
    filters.provider,
  );
  const { data: toolData, isLoading } = useToolAnalytics(
    from,
    to,
    filters,
    true,
    false,
    splitBy === "agentType" ? "agentType" : undefined,
  );

  // Enriched tools with search filter
  const allTools = useMemo(
    () => enrichTools(toolData?.tools ?? []),
    [toolData],
  );

  const filteredTools = useMemo(() => {
    if (!debouncedSearch) return allTools;
    const q = debouncedSearch.toLowerCase();
    return allTools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        formatToolName(t.name).toLowerCase().includes(q),
    );
  }, [allTools, debouncedSearch]);

  // Summary stats
  const summary = useMemo(() => {
    const tools = allTools;
    const totalCalls = tools.reduce((s, t) => s + t.totalCalls, 0);
    const totalCost = tools.reduce((s, t) => s + t.estimatedCost, 0);
    const mostUsed = tools.reduce(
      (best, t) => (t.totalCalls > (best?.totalCalls ?? 0) ? t : best),
      null as EnrichedTool | null,
    );
    const mostExpensive = tools.reduce(
      (best, t) => (t.estimatedCost > (best?.estimatedCost ?? 0) ? t : best),
      null as EnrichedTool | null,
    );
    return {
      totalCalls,
      uniqueTools: tools.length,
      totalCost,
      mostUsed: mostUsed ? formatToolName(mostUsed.name) : "—",
      mostExpensive: mostExpensive ? formatToolName(mostExpensive.name) : "—",
    };
  }, [allTools]);

  // Sorted tools for flat view
  const sortedTools = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort?.column);
    if (!col || !sort) return filteredTools;
    return sortRows(filteredTools, sort, (row) => col.value(row));
  }, [filteredTools, sort]);

  // Pagination (flat view only)
  const PAGE_SIZE = 25;
  const totalPages = Math.ceil(sortedTools.length / PAGE_SIZE);
  const pagedTools =
    splitBy === "none"
      ? sortedTools.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
      : sortedTools;

  // Reset page when filters/sort change
  const filterKey = `${sort?.column}:${sort?.dir}:${debouncedSearch}:${splitBy}`;
  const [prevKey, setPrevKey] = useState(filterKey);
  if (filterKey !== prevKey) {
    setPrevKey(filterKey);
    if (page !== 0) setPage(0);
  }

  const toggleColumn = useCallback((key: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Groups for category or agent type view
  const groups = useMemo(() => {
    if (splitBy === "none") return null;

    if (splitBy === "category") {
      // Group filtered tools by group field
      const map = new Map<string, EnrichedTool[]>();
      for (const t of filteredTools) {
        const arr = map.get(t.group) || [];
        arr.push(t);
        map.set(t.group, arr);
      }
      return Array.from(map.entries())
        .map(([name, tools]) => ({
          name,
          tools: sort
            ? sortRows(tools, sort, (row) => {
                const col = COLUMNS.find((c) => c.key === sort.column);
                return col ? col.value(row) : 0;
              })
            : tools,
          totalCalls: tools.reduce((s, t) => s + t.totalCalls, 0),
          totalCost: tools.reduce((s, t) => s + t.estimatedCost, 0),
        }))
        .sort((a, b) => b.totalCost - a.totalCost);
    }

    // splitBy === "agentType" — use splits from API
    if (!toolData?.splits) return null;
    return Object.entries(toolData.splits)
      .map(([name, { tools: splitTools }]) => {
        const enriched = enrichTools(splitTools);
        const filtered = debouncedSearch
          ? enriched.filter(
              (t) =>
                t.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                formatToolName(t.name)
                  .toLowerCase()
                  .includes(debouncedSearch.toLowerCase()),
            )
          : enriched;
        return {
          name,
          tools: sort
            ? sortRows(filtered, sort, (row) => {
                const col = COLUMNS.find((c) => c.key === sort.column);
                return col ? col.value(row) : 0;
              })
            : filtered,
          totalCalls: filtered.reduce((s, t) => s + t.totalCalls, 0),
          totalCost: filtered.reduce((s, t) => s + t.estimatedCost, 0),
        };
      })
      .filter((g) => g.tools.length > 0)
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [splitBy, filteredTools, toolData?.splits, sort, debouncedSearch]);

  // Chart data
  const chartData = useMemo(() => {
    const metric = chartMetric === "cost" ? "estimatedCost" : "totalCalls";

    if (splitBy === "agentType" && toolData?.splits) {
      // Stacked bars: each bar is a tool, segments per agent type
      const topTypes = Object.entries(toolData.splits)
        .sort(
          (a, b) =>
            b[1].tools.reduce((s, t) => s + t.estimatedCost, 0) -
            a[1].tools.reduce((s, t) => s + t.estimatedCost, 0),
        )
        .slice(0, 5)
        .map(([name]) => name);

      // Merge all tools across agent types
      const toolMap = new Map<
        string,
        { name: string; total: number; [key: string]: string | number }
      >();
      for (const [type, { tools }] of Object.entries(toolData.splits)) {
        const effectiveType = topTypes.includes(type) ? type : "Other";
        for (const t of tools) {
          const existing = toolMap.get(t.name) ?? {
            name: formatToolName(t.name),
            total: 0,
          };
          existing[effectiveType] =
            ((existing[effectiveType] as number) || 0) +
            (metric === "estimatedCost" ? t.estimatedCost : t.totalCalls);
          existing.total +=
            metric === "estimatedCost" ? t.estimatedCost : t.totalCalls;
          toolMap.set(t.name, existing);
        }
      }

      const allKeys = [
        ...topTypes,
        ...(Object.keys(toolData.splits).length > 5 ? ["Other"] : []),
      ];

      return {
        data: Array.from(toolMap.values())
          .sort((a, b) => b.total - a.total)
          .slice(0, 15),
        keys: allKeys,
        stacked: true,
      };
    }

    // Category or flat: single bar per tool
    const top15 = [...allTools]
      .sort((a, b) =>
        metric === "estimatedCost"
          ? b.estimatedCost - a.estimatedCost
          : b.totalCalls - a.totalCalls,
      )
      .slice(0, 15);

    return {
      data: top15.map((t) => ({
        name: formatToolName(t.name),
        value: metric === "estimatedCost" ? t.estimatedCost : t.totalCalls,
        category: t.category,
      })),
      keys: ["value"],
      stacked: false,
    };
  }, [allTools, toolData, splitBy, chartMetric]);

  const visibleCols = COLUMNS.filter((c) => visibleColumns.has(c.key));

  return (
    <PageContainer className="max-w-[1400px]">
      <PageScaffold
        title="Tool Analytics"
        subtitle="Break down tool usage, cost, and token consumption by category, agent type, or flat tool ranking."
        filters={
          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/analytics"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={14} />
              Analytics
            </Link>
            <div className="flex-1" />
            <FilterBar
              filters={filters}
              onChange={setFilters}
              projects={projects ?? []}
              filterOptions={filterOptions}
            />
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <Popover open={colOpen} onOpenChange={setColOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Columns3 size={14} />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="end">
                <div className="space-y-0.5">
                  <div className="text-micro uppercase text-muted-foreground font-medium px-1 pb-1">
                    Visible Columns
                  </div>
                  {LAYOUT_COLUMNS.map((col) => {
                    const checked = visibleColumns.has(col.key);
                    return (
                      <button
                        key={col.key}
                        className={cn(
                          "w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded-sm transition-colors",
                          checked
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted text-muted-foreground",
                        )}
                        onClick={() => toggleColumn(col.key)}
                      >
                        <span
                          className={cn(
                            "h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0",
                            checked
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {checked && <Check size={10} />}
                        </span>
                        {col.label}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        }
      >

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-64" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryBox
              icon={Hash}
              label="Total Calls"
              value={summary.totalCalls.toLocaleString()}
              color="text-chart-1"
            />
            <SummaryBox
              icon={Wrench}
              label="Unique Tools"
              value={String(summary.uniqueTools)}
              color="text-chart-2"
            />
            <SummaryBox
              icon={DollarSign}
              label="Total Cost"
              value={formatCost(summary.totalCost)}
              color="text-chart-3"
            />
            <SummaryBox
              icon={Trophy}
              label="Most Used"
              value={summary.mostUsed}
              color="text-chart-4"
              mono
            />
            <SummaryBox
              icon={Zap}
              label="Most Expensive"
              value={summary.mostExpensive}
              color="text-chart-5"
              mono
            />
          </div>

          {/* Split By toggle */}
          <TabBar
            tabs={SPLIT_TABS}
            activeTab={splitBy}
            onTabChange={(id) => setSplitBy(id as SplitMode)}
          />

          {/* Chart */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Top 15 tools
              </span>
              <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
                <button
                  className={cn(
                    "px-2 py-0.5 rounded text-micro font-medium transition-colors",
                    chartMetric === "cost"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setChartMetric("cost")}
                >
                  By Cost
                </button>
                <button
                  className={cn(
                    "px-2 py-0.5 rounded text-micro font-medium transition-colors",
                    chartMetric === "calls"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setChartMetric("calls")}
                >
                  By Calls
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={chartData.data}
                layout="vertical"
                margin={{ left: 100, right: 20, top: 5, bottom: 5 }}
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
                  tickFormatter={(v) =>
                    chartMetric === "cost" ? formatCost(v) : v.toLocaleString()
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{
                    ...chartTickStyle,
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                  width={95}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number | undefined) =>
                    v != null
                      ? chartMetric === "cost"
                        ? formatCost(v)
                        : v.toLocaleString()
                      : ""
                  }
                />
                {chartData.stacked ? (
                  chartData.keys.map((key, i) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="a"
                      fill={AGENT_TYPE_COLORS[i % AGENT_TYPE_COLORS.length]}
                      radius={
                        i === chartData.keys.length - 1
                          ? [0, 4, 4, 0]
                          : undefined
                      }
                    />
                  ))
                ) : (
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                    {chartData.data.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          splitBy === "category"
                            ? (categoryChartColors[
                                (entry as { category?: string }).category ??
                                  "other"
                              ] ?? chartColors.chart5)
                            : chartColors.chart1
                        }
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                )}
                {chartData.stacked && (
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Search */}
          <SearchField
            placeholder="Search tools..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            inputSize="sm"
            containerClassName="max-w-sm"
          />

          {/* Table */}
          <div className="overflow-x-auto">
            {splitBy !== "none" && groups ? (
              <GroupedTable
                groups={groups}
                columns={COLUMNS}
                visibleCols={visibleCols}
                sort={sort}
                onSort={setSort}
              />
            ) : (
              <>
                <table className="table-readable w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      {visibleCols.map((col) => (
                        <SortableHeader
                          key={col.key}
                          column={col.key}
                          label={col.label}
                          sort={sort}
                          onSort={setSort}
                          className={
                            col.align === "right" ? "text-right" : "text-left"
                          }
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTools.length === 0 ? (
                      <tr>
                        <td
                          colSpan={visibleCols.length}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No tools found
                        </td>
                      </tr>
                    ) : (
                      pagedTools.map((row) => (
                        <ToolRow
                          key={row.name}
                          row={row}
                          visibleCols={visibleCols}
                        />
                      ))
                    )}
                  </tbody>
                  <TotalsFooter tools={sortedTools} visibleCols={visibleCols} />
                </table>
                <TablePagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}
          </div>

          <div className="text-xs text-muted-foreground tabular-nums">
            {filteredTools.length.toLocaleString()} tool
            {filteredTools.length !== 1 ? "s" : ""}
          </div>
        </>
      )}
      </PageScaffold>
    </PageContainer>
  );
}
