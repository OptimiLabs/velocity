"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  useAnalytics,
  useModelUsage,
  useToolAnalytics,
  useRoleAnalytics,
  useProviderAnalytics,
  useProjects,
  useFilterOptions,
  type AnalyticsFilters,
} from "@/hooks/useAnalytics";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import { ComparisonSummary } from "@/components/analytics/ComparisonSummary";
import { ModelBreakdownTable } from "@/components/usage/ModelBreakdownTable";

const SessionCostDistribution = dynamic(
  () => import("@/components/usage/SessionCostDistribution").then((m) => m.SessionCostDistribution),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const LatencyChart = dynamic(
  () => import("@/components/analytics/LatencyChart").then((m) => m.LatencyChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const ToolUsageCard = dynamic(
  () => import("@/components/analytics/ToolSidebarCard").then((m) => m.ToolUsageCard),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const CostChart = dynamic(
  () => import("@/components/analytics/CostChart").then((m) => m.CostChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const TokenChart = dynamic(
  () => import("@/components/analytics/TokenChart").then((m) => m.TokenChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const ActivityChart = dynamic(
  () => import("@/components/analytics/ActivityChart").then((m) => m.ActivityChart),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const SubagentTypeCard = dynamic(
  () => import("@/components/analytics/RoleBreakdownCard").then((m) => m.SubagentTypeCard),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
const ProviderBreakdownCard = dynamic(
  () => import("@/components/analytics/ProviderBreakdownCard").then((m) => m.ProviderBreakdownCard),
  { ssr: false, loading: () => <Skeleton className="h-[300px] w-full" /> }
);
import { useSearchParams } from "next/navigation";
import { FilterBar } from "@/components/analytics/FilterBar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { KPICard } from "@/components/layout/KPICard";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/date-range-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { subDays, format } from "date-fns";
import {
  getDefaultDateRange,
  formatDateRange,
  getDaysBetween,
  getCompareRange,
  getActivePreset,
  getOrderedPeriods,
  formatPeriodDate,
} from "@/lib/analytics/date-utils";
import { pctChange } from "@/lib/analytics/kpi";
import {
  DollarSign,
  Zap,
  Hash,
  DatabaseZap,
  CalendarIcon,
  Timer,
  X,
} from "lucide-react";
import { formatCost, formatTokens, formatLatency } from "@/lib/cost/calculator";
import { CardExpandWrapper } from "@/components/analytics/CardExpandWrapper";
import { cn } from "@/lib/utils";
import type { DailyStats } from "@/types/session";
import {
  getAllSessionProviders,
  getSessionProvider,
} from "@/lib/providers/session-registry";

type CompareDimension = "project" | "model" | "role" | "agentType" | "provider";

const DIMENSION_LABELS: Record<CompareDimension, string> = {
  project: "Project",
  model: "Model",
  role: "Role",
  agentType: "Agent Type",
  provider: "Provider",
};

const HIDDEN_PROJECT_IDS = new Set(["codex-sessions", "gemini-sessions"]);
const ALL_PROVIDERS_COMPARE_VALUE = "__all__";

function formatModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function applyDimensionFilter(
  base: AnalyticsFilters,
  dim: CompareDimension,
  value: string,
): AnalyticsFilters {
  const f = { ...base };
  if (dim === "project") {
    f.projectId = value;
  } else if (dim === "model") {
    f.models = [value];
    f.modelOp = "or";
  } else if (dim === "role") {
    f.roles = [value];
  } else if (dim === "agentType") {
    f.agentTypes = [value];
  } else if (dim === "provider") {
    if (value === ALL_PROVIDERS_COMPARE_VALUE) {
      delete f.provider;
    } else {
      f.provider = value;
    }
  }
  return f;
}

function countActiveFilters(filters: AnalyticsFilters): number {
  let count = 0;
  if (filters.projectId) count += 1;
  if (filters.roles?.length) count += 1;
  if (filters.models?.length) count += 1;
  if (filters.agentTypes?.length) count += 1;
  if (filters.provider) count += 1;
  return count;
}

function buildBins(
  from: string,
  to: string,
  granularity: "day" | "hour",
): string[] {
  const bins: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(
    granularity === "hour" ? `${to}T23:00:00` : `${to}T00:00:00`,
  );
  while (cursor <= end) {
    bins.push(format(cursor, granularity === "hour" ? "yyyy-MM-dd HH:00" : "yyyy-MM-dd"));
    if (granularity === "hour") {
      cursor.setHours(cursor.getHours() + 1);
    } else {
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return bins;
}

function fillMissingBins(
  rows: DailyStats[] | undefined,
  from: string,
  to: string,
  granularity: "day" | "hour",
): DailyStats[] {
  const byDate = new Map((rows ?? []).map((row) => [row.date, row]));
  return buildBins(from, to, granularity).map((date) => {
    const row = byDate.get(date);
    return {
      date,
      session_count: row?.session_count ?? 0,
      message_count: row?.message_count ?? 0,
      tool_call_count: row?.tool_call_count ?? 0,
      input_tokens: row?.input_tokens ?? 0,
      output_tokens: row?.output_tokens ?? 0,
      cache_read_tokens: row?.cache_read_tokens ?? 0,
      cache_write_tokens: row?.cache_write_tokens ?? 0,
      total_cost: row?.total_cost ?? 0,
      avg_latency_ms: row?.avg_latency_ms ?? 0,
      avg_p95_latency_ms: row?.avg_p95_latency_ms ?? 0,
    };
  });
}

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const urlProvider = searchParams.get("provider");
  const prevUrlProvider = useRef(urlProvider);

  const [primaryRange, setPrimaryRange] = useState<DateRange>(getDefaultDateRange);
  const [filters, setFilters] = useState<AnalyticsFilters>(() => ({
    ...(urlProvider ? { provider: urlProvider } : {}),
  }));
  const [compareType, setCompareType] = useState<"date" | "dimension" | null>(
    null,
  );
  const compareMode = compareType !== null;
  const [compareStartDate, setCompareStartDate] = useState<Date | null>(null);
  const [compareDim, setCompareDim] = useState<{
    dimension: CompareDimension;
    valueA: string;
    valueB: string;
  } | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Sync provider filter when URL searchParam changes (e.g. sidebar click)
  useEffect(() => {
    if (urlProvider !== prevUrlProvider.current) {
      prevUrlProvider.current = urlProvider;
      setFilters((prev) => {
        if (urlProvider) return { ...prev, provider: urlProvider };
        const { provider: _, ...rest } = prev;
        return rest;
      });
    }
  }, [urlProvider]);

  const { from, to } = useMemo(
    () => formatDateRange(primaryRange),
    [primaryRange],
  );

  const daysBetween = useMemo(() => getDaysBetween(from, to), [from, to]);
  const granularity: "day" | "hour" = daysBetween <= 2 ? "hour" : "day";

  // Comparison: start date + auto-computed end (same duration as primary)
  const { compareFrom, compareTo } = useMemo(
    () => getCompareRange(from, daysBetween, compareStartDate),
    [from, daysBetween, compareStartDate],
  );

  // Auto-sort: older period = A, newer = B (date compare only)
  const { periodA, periodB, primaryIsA } = useMemo(() => {
    if (!compareMode || compareType === "dimension")
      return { periodA: { from, to }, periodB: { from, to }, primaryIsA: true };
    return getOrderedPeriods(from, to, compareFrom, compareTo);
  }, [compareMode, compareType, from, to, compareFrom, compareTo]);

  const activePreset = useMemo(
    () => getActivePreset(from, compareStartDate),
    [from, compareStartDate],
  );

  // Derive whether role filter is active (for includeRoleBreakdown logic)
  const hasRoleFilter =
    !!filters.roles?.length ||
    (compareType === "dimension" && compareDim?.dimension === "role");

  const { data: filterOptions } = useFilterOptions(
    from,
    to,
    filters.projectId,
    filters.provider,
  );
  const { data: projects } = useProjects();

  // Build primary/compare filters based on compare type
  const primaryFilters = useMemo(() => {
    if (compareType === "dimension" && compareDim) {
      return applyDimensionFilter(
        filters,
        compareDim.dimension,
        compareDim.valueA,
      );
    }
    return filters;
  }, [compareType, compareDim, filters]);

  const compareFilters = useMemo(() => {
    if (compareType === "dimension" && compareDim) {
      return applyDimensionFilter(
        filters,
        compareDim.dimension,
        compareDim.valueB,
      );
    }
    return filters;
  }, [compareType, compareDim, filters]);

  // For dimension compare, both queries use the same date range
  const effectiveCompareFrom = compareType === "dimension" ? from : compareFrom;
  const effectiveCompareTo = compareType === "dimension" ? to : compareTo;

  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics(
    from,
    to,
    primaryFilters,
    true,
    granularity,
  );
  const { data: compareData } = useAnalytics(
    effectiveCompareFrom,
    effectiveCompareTo,
    compareFilters,
    compareMode,
    granularity,
  );
  const { data: modelData } = useModelUsage(
    from,
    to,
    primaryFilters,
    true,
    false,
  );
  const { data: toolData } = useToolAnalytics(
    from,
    to,
    primaryFilters,
    true,
    false,
  );
  const { data: compareToolData } = useToolAnalytics(
    effectiveCompareFrom,
    effectiveCompareTo,
    compareFilters,
    compareMode,
    false,
  );
  const { data: roleData } = useRoleAnalytics(from, to, primaryFilters, true);
  const { data: providerData } = useProviderAnalytics(from, to, primaryFilters, true);
  const { data: compareProviderData } = useProviderAnalytics(
    effectiveCompareFrom,
    effectiveCompareTo,
    compareFilters,
    compareMode,
  );
  const { data: compareRoleData } = useRoleAnalytics(
    effectiveCompareFrom,
    effectiveCompareTo,
    compareFilters,
    compareMode,
  );

  const isLoading = analyticsLoading;

  const totals = analyticsData?.totals;
  const prev =
    compareMode && compareData?.totals
      ? compareData.totals
      : analyticsData?.previousTotals;

  const kpis = useMemo(() => {
    if (!totals) return [];

    const avgCost =
      totals.total_sessions > 0 ? totals.total_cost / totals.total_sessions : 0;
    const maxCost = analyticsData?.costDistribution?.max ?? 0;
    const avgTokens =
      totals.total_sessions > 0
        ? (totals.total_input_tokens + totals.total_output_tokens) /
          totals.total_sessions
        : 0;
    const totalInput =
      totals.total_input_tokens +
      (totals.total_cache_read_tokens || 0) +
      (totals.total_cache_write_tokens || 0);
    const cacheHitRate =
      totalInput > 0
        ? ((totals.total_cache_read_tokens || 0) / totalInput) * 100
        : 0;

    const prevAvgCost =
      prev && prev.total_sessions > 0
        ? prev.total_cost / prev.total_sessions
        : 0;
    const prevAvgTokens =
      prev && prev.total_sessions > 0
        ? (prev.total_input_tokens + prev.total_output_tokens) /
          prev.total_sessions
        : 0;
    const prevTotalInput = prev
      ? prev.total_input_tokens +
        (prev.total_cache_read_tokens || 0) +
        (prev.total_cache_write_tokens || 0)
      : 0;
    const prevCacheHitRate =
      prevTotalInput > 0 && prev
        ? ((prev.total_cache_read_tokens || 0) / prevTotalInput) * 100
        : 0;

    const avgLatency = totals.avg_latency_ms ?? 0;
    const prevAvgLatency = prev?.avg_latency_ms ?? 0;

    return [
      {
        key: "avgCost",
        label: "Avg Cost/Session",
        icon: DollarSign,
        value: formatCost(avgCost),
        color: "text-chart-1",
        trend: prev
          ? { pctChange: pctChange(avgCost, prevAvgCost), invertTrend: true }
          : undefined,
      },
      {
        key: "avgLatency",
        label: "Avg Latency",
        icon: Timer,
        value: formatLatency(avgLatency),
        color: "text-chart-5",
        trend: prev
          ? { pctChange: pctChange(avgLatency, prevAvgLatency), invertTrend: true }
          : undefined,
      },
      {
        key: "avgTokens",
        label: "Avg Tokens/Session",
        icon: Hash,
        value: formatTokens(avgTokens),
        color: "text-chart-2",
        trend: prev ? { pctChange: pctChange(avgTokens, prevAvgTokens) } : undefined,
      },
      {
        key: "cacheHit",
        label: "Cache Hit Rate",
        icon: DatabaseZap,
        value: `${cacheHitRate.toFixed(1)}%`,
        color: "text-chart-3",
        trend: prev
          ? { pctChange: pctChange(cacheHitRate, prevCacheHitRate) }
          : undefined,
      },
      {
        key: "maxCost",
        label: "Most Expensive",
        icon: Zap,
        value: formatCost(maxCost),
        color: "text-chart-4",
      },
    ];
  }, [totals, prev, analyticsData?.costDistribution]);

  const mergedDaily = useMemo(() => {
    if (!compareMode || !analyticsData?.daily || !compareData?.daily)
      return null;

    if (compareType === "dimension") {
      // Merge by date across fully-filled bins (same date range, different filters)
      const aFilled = fillMissingBins(analyticsData.daily, from, to, granularity);
      const bMap = new Map(
        fillMissingBins(compareData.daily, from, to, granularity).map((d) => [
          d.date,
          d,
        ]),
      );
      return aFilled.map((d) => ({
        ...d,
        compare_total_cost: bMap.get(d.date)?.total_cost ?? 0,
        compare_input_tokens: bMap.get(d.date)?.input_tokens ?? 0,
        compare_output_tokens: bMap.get(d.date)?.output_tokens ?? 0,
        compare_message_count: bMap.get(d.date)?.message_count ?? 0,
        compare_tool_call_count: bMap.get(d.date)?.tool_call_count ?? 0,
        avg_latency_ms: d.avg_latency_ms ?? 0,
        avg_p95_latency_ms: d.avg_p95_latency_ms ?? 0,
        compare_avg_latency_ms: bMap.get(d.date)?.avg_latency_ms ?? 0,
        compare_avg_p95_latency_ms: bMap.get(d.date)?.avg_p95_latency_ms ?? 0,
      }));
    }

    // Date compare: fill missing bins first, then align by relative index.
    const primaryDaily = fillMissingBins(
      analyticsData.daily,
      from,
      to,
      granularity,
    );
    const comparisonDaily = fillMissingBins(
      compareData.daily,
      effectiveCompareFrom,
      effectiveCompareTo,
      granularity,
    );
    const aDaily = primaryIsA ? primaryDaily : comparisonDaily;
    const bDaily = primaryIsA ? comparisonDaily : primaryDaily;

    return aDaily.map((a, i) => ({
      date: a.date,
      dayIndex: i + 1,
      total_cost: a.total_cost ?? 0,
      input_tokens: a.input_tokens ?? 0,
      output_tokens: a.output_tokens ?? 0,
      message_count: a.message_count ?? 0,
      tool_call_count: a.tool_call_count ?? 0,
      session_count: a.session_count ?? 0,
      avg_latency_ms: a.avg_latency_ms ?? 0,
      avg_p95_latency_ms: a.avg_p95_latency_ms ?? 0,
      compare_total_cost: bDaily[i]?.total_cost ?? 0,
      compare_input_tokens: bDaily[i]?.input_tokens ?? 0,
      compare_output_tokens: bDaily[i]?.output_tokens ?? 0,
      compare_message_count: bDaily[i]?.message_count ?? 0,
      compare_tool_call_count: bDaily[i]?.tool_call_count ?? 0,
      compare_avg_latency_ms: bDaily[i]?.avg_latency_ms ?? 0,
      compare_avg_p95_latency_ms: bDaily[i]?.avg_p95_latency_ms ?? 0,
    }));
  }, [
    compareMode,
    compareType,
    analyticsData,
    compareData,
    primaryIsA,
    from,
    to,
    granularity,
    effectiveCompareFrom,
    effectiveCompareTo,
  ]);

  // Labels for comparison charts and summary
  const compareLabels = useMemo((): [string, string] | undefined => {
    if (!compareMode) return undefined;
    if (compareType === "dimension" && compareDim) {
      const fmt = (v: string) => {
        if (compareDim.dimension === "model") return formatModelName(v);
        if (compareDim.dimension === "provider") {
          if (v === ALL_PROVIDERS_COMPARE_VALUE) return "All providers";
          return getSessionProvider(v)?.label ?? v;
        }
        return v;
      };
      return [fmt(compareDim.valueA), fmt(compareDim.valueB)];
    }
    return [
      `${periodA.from} — ${periodA.to}`,
      `${periodB.from} — ${periodB.to}`,
    ];
  }, [compareMode, compareType, compareDim, periodA, periodB]);

  // Dimension compare: get value options for current dimension
  function getDimValues(
    dim: CompareDimension,
  ): { value: string; label: string }[] {
    switch (dim) {
      case "project":
        return (projects ?? [])
          .filter((p) => !HIDDEN_PROJECT_IDS.has(p.id))
          .map((p) => ({ value: p.id, label: p.name }));
      case "model":
        return (filterOptions?.models ?? []).map((m) => ({
          value: m,
          label: formatModelName(m),
        }));
      case "role":
        return [
          { value: "standalone", label: "Standalone" },
          { value: "subagent", label: "Subagent" },
        ];
      case "agentType":
        return (filterOptions?.agentTypes ?? []).map((t) => ({
          value: t,
          label: t,
        }));
      case "provider": {
        const providerIds = Array.from(
          new Set(
            (
              filterOptions?.providers?.length
                ? filterOptions.providers
                : getAllSessionProviders().map((p) => p.id)
            ).filter(Boolean),
          ),
        );
        return [
          { value: ALL_PROVIDERS_COMPARE_VALUE, label: "All providers" },
          ...providerIds.map((providerId) => ({
            value: providerId,
            label: getSessionProvider(providerId)?.label ?? providerId,
          })),
        ];
      }
    }
  }

  function handleDimensionChange(dim: CompareDimension) {
    const values = getDimValues(dim);
    setCompareDim({
      dimension: dim,
      valueA: values[0]?.value ?? "",
      valueB: values[1]?.value ?? values[0]?.value ?? "",
    });
  }

  function setDateCompareMode() {
    setCompareType("date");
    setCompareDim(null);
  }

  function setDimensionCompareMode() {
    setCompareType("dimension");
    setCompareStartDate(null);
    const fallbackDimension =
      (
        ["model", "project", "agentType", "role", "provider"] as CompareDimension[]
      ).find(
        (dim) => getDimValues(dim).length > 0,
      ) ?? "role";

    setCompareDim((prev) => {
      const activeDimension =
        prev && getDimValues(prev.dimension).length > 0
          ? prev.dimension
          : fallbackDimension;
      const values = getDimValues(activeDimension);
      const nextValueA =
        prev && values.some((option) => option.value === prev.valueA)
          ? prev.valueA
          : values[0]?.value ?? "";
      const fallbackValueB =
        values.find((option) => option.value !== nextValueA)?.value ??
        nextValueA;
      const nextValueB =
        prev && values.some((option) => option.value === prev.valueB)
          ? prev.valueB
          : fallbackValueB;
      return {
        dimension: activeDimension,
        valueA: nextValueA,
        valueB: nextValueB,
      };
    });
  }

  function clearCompareMode() {
    setCompareType(null);
    setCompareDim(null);
    setCompareStartDate(null);
  }

  function handleCompareModeChange(mode: "none" | "date" | "dimension") {
    if (mode === "none") {
      clearCompareMode();
      return;
    }
    if (mode === "date") {
      setDateCompareMode();
      return;
    }
    setDimensionCompareMode();
  }

  // Strip out the compared dimension from base filters when dimension compare is active
  const effectiveFilters = useMemo(() => {
    if (compareType === "dimension" && compareDim) {
      const f = { ...filters };
      const dim = compareDim.dimension;
      if (dim === "project") delete f.projectId;
      if (dim === "role") delete f.roles;
      if (dim === "model") {
        delete f.models;
        delete f.modelOp;
      }
      if (dim === "agentType") delete f.agentTypes;
      if (dim === "provider") delete f.provider;
      return f;
    }
    return filters;
  }, [filters, compareType, compareDim]);

  // Use effectiveFilters for the FilterBar display
  const handleFiltersChange = (next: AnalyticsFilters) => {
    // If a dimension is being compared, make sure we don't set it on the base filters
    if (compareType === "dimension" && compareDim) {
      const dim = compareDim.dimension;
      const cleaned = { ...next };
      if (dim === "project") delete cleaned.projectId;
      if (dim === "role") delete cleaned.roles;
      if (dim === "model") {
        delete cleaned.models;
        delete cleaned.modelOp;
      }
      if (dim === "agentType") delete cleaned.agentTypes;
      if (dim === "provider") delete cleaned.provider;
      setFilters(cleaned);
    } else {
      setFilters(next);
    }
  };

  const activeFilterCount = useMemo(
    () => countActiveFilters(effectiveFilters),
    [effectiveFilters],
  );

  return (
    <PageContainer>
      <PageScaffold
        title="Analytics"
        subtitle="Explore session costs, latency, models, tools, and provider usage with filters and compare modes."
        filters={
          <div className="space-y-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <FilterBar
                filters={effectiveFilters}
                onChange={handleFiltersChange}
                projects={projects ?? []}
                filterOptions={filterOptions}
                disabledDimensions={compareDim ? [compareDim.dimension] : []}
              />
              <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                <DateRangePicker
                  value={primaryRange}
                  onChange={setPrimaryRange}
                  className="h-7 w-full justify-start rounded-md border-border/60 bg-background/70 px-2 text-[11px] font-medium shadow-none sm:w-auto"
                />
                <span className="inline-flex h-7 items-center rounded-md border border-border/60 bg-background/70 px-2 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {from} — {to}
                </span>
                <div className="flex h-7 w-full items-center gap-2 rounded-md border border-border/60 bg-background/70 px-2 sm:w-auto">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                    Compare
                  </span>
                  <Select
                    value={compareType ?? "none"}
                    onValueChange={(value) =>
                      handleCompareModeChange(
                        value as "none" | "date" | "dimension",
                      )
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="h-7 w-full border-0 bg-transparent px-0 text-[11px] font-medium shadow-none focus-visible:ring-0 sm:w-[172px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">
                        Standard view
                      </SelectItem>
                      <SelectItem value="date" className="text-xs">
                        Date comparison
                      </SelectItem>
                      <SelectItem value="dimension" className="text-xs">
                        Dimension comparison
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => handleFiltersChange({})}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            {compareType === "date" && (
              <div className="rounded-lg border border-border/60 bg-background/55 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {(
                    [
                      { key: "prev", label: "Previous", getStart: () => null },
                      {
                        key: "-30d",
                        label: "30d ago",
                        getStart: () => subDays(new Date(from + "T00:00"), 30),
                      },
                      {
                        key: "-1yr",
                        label: "1y ago",
                        getStart: () => subDays(new Date(from + "T00:00"), 365),
                      },
                    ] as const
                  ).map(({ key, label, getStart }) => (
                    <Button
                      key={key}
                      variant="ghost"
                      size="sm"
                      className={cn(
                        "h-7 shrink-0 text-xs px-2",
                        activePreset === key
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground",
                      )}
                      onClick={() => setCompareStartDate(getStart())}
                    >
                      {label}
                    </Button>
                  ))}
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-7 shrink-0 text-xs px-2 gap-1",
                          activePreset === "custom"
                            ? "bg-primary/15 text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon size={11} />
                        {activePreset === "custom" && compareStartDate
                          ? format(compareStartDate, "MMM d")
                          : "Custom"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={compareStartDate ?? undefined}
                        onSelect={(date) => {
                          if (date) {
                            setCompareStartDate(date);
                            setCalendarOpen(false);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  {compareStartDate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                      onClick={() => setCompareStartDate(null)}
                    >
                      <X size={11} />
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  A {formatPeriodDate(periodA.from)} - {formatPeriodDate(periodA.to)} • B{" "}
                  {formatPeriodDate(periodB.from)} - {formatPeriodDate(periodB.to)}
                </p>
              </div>
            )}

            {compareType === "dimension" && compareDim && (
              <div className="rounded-lg border border-border/60 bg-background/55 p-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Dimension
                    </span>
                    <Select
                      value={compareDim.dimension}
                      onValueChange={(v) =>
                        handleDimensionChange(v as CompareDimension)
                      }
                    >
                      <SelectTrigger className="h-8 w-full text-xs gap-1 sm:w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.entries(
                            DIMENSION_LABELS,
                          ) as [CompareDimension, string][]
                        ).map(([key, label]) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      A
                    </span>
                    <Select
                      value={compareDim.valueA}
                      onValueChange={(v) =>
                        setCompareDim({ ...compareDim, valueA: v })
                      }
                    >
                      <SelectTrigger className="h-8 w-full text-xs gap-1 sm:w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getDimValues(compareDim.dimension).map(
                          ({ value, label }) => (
                            <SelectItem key={value} value={value} className="text-xs">
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      B
                    </span>
                    <Select
                      value={compareDim.valueB}
                      onValueChange={(v) =>
                        setCompareDim({ ...compareDim, valueB: v })
                      }
                    >
                      <SelectTrigger className="h-8 w-full text-xs gap-1 sm:w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getDimValues(compareDim.dimension).map(
                          ({ value, label }) => (
                            <SelectItem key={value} value={value} className="text-xs">
                              {label}
                            </SelectItem>
                          ),
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </div>
        }
      >

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {kpis.map(({ key, label, icon, value, color, trend }, i) => (
              <KPICard
                key={key}
                label={label}
                icon={icon}
                value={value}
                color={color}
                trend={trend}
                animationDelay={i * 50}
              />
            ))}
          </div>

          {/* Comparison Summary */}
          {compareMode && totals && compareData?.totals && (
            <ComparisonSummary
              periodA={
                compareType === "dimension" || primaryIsA
                  ? totals
                  : compareData.totals
              }
              periodB={
                compareType === "dimension" || primaryIsA
                  ? compareData.totals
                  : totals
              }
              periodALabel={compareLabels?.[0] ?? ""}
              periodBLabel={compareLabels?.[1] ?? ""}
            />
          )}

          {/* Model Breakdown Table */}
          {modelData && modelData.models.length > 0 && (
            <CardExpandWrapper href="/analytics/explore/models">
              <ModelBreakdownTable data={modelData.models} />
            </CardExpandWrapper>
          )}

          {/* Subagent Type Breakdown */}
          {!hasRoleFilter && roleData && roleData.byAgentType.length > 0 && (
            <SubagentTypeCard
              byAgentType={roleData.byAgentType}
              compareByAgentType={compareRoleData?.byAgentType}
            />
          )}

          {/* Provider Breakdown */}
          {providerData &&
            (providerData.byProvider.length > 1 ||
              (!!compareMode && (compareProviderData?.byProvider.length ?? 0) > 0)) && (
            <ProviderBreakdownCard
              byProvider={providerData.byProvider}
              daily={providerData.daily}
              compareByProvider={compareProviderData?.byProvider}
              compareLabels={compareLabels}
            />
            )}

          {/* Charts — full width 2x2 grid */}
          {analyticsData?.daily && analyticsData.daily.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CostChart
                data={analyticsData.daily}
                compareData={mergedDaily ?? undefined}
                compareLabels={compareLabels}
              />
              <TokenChart
                data={analyticsData.daily}
                compareData={mergedDaily ?? undefined}
                compareLabels={compareLabels}
              />
              <ActivityChart
                data={analyticsData.daily}
                compareData={mergedDaily ?? undefined}
                compareLabels={compareLabels}
              />
              <LatencyChart
                data={analyticsData.daily}
                compareData={mergedDaily ?? undefined}
                compareLabels={compareLabels}
              />
            </div>
          )}

          {/* Tool usage — unified card */}
          {toolData && toolData.tools.length > 0 && (
            <ToolUsageCard
              tools={toolData.tools}
              categories={toolData.categories}
              compareTools={compareToolData?.tools}
              compareCategories={compareToolData?.categories}
            />
          )}

          {/* Cost Distribution */}
          {analyticsData?.costDistribution && (
            <CardExpandWrapper href="/analytics/explore/cost-distribution">
              <SessionCostDistribution
                data={analyticsData.costDistribution}
                dateFrom={from}
                dateTo={to}
                projectId={primaryFilters.projectId}
                filters={primaryFilters}
                compareData={compareData?.costDistribution}
                compareLabels={compareLabels}
              />
            </CardExpandWrapper>
          )}

        </>
      )}
      </PageScaffold>
    </PageContainer>
  );
}
