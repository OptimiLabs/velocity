"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  useAnalytics,
  useModelUsage,
  useToolAnalytics,
  useRoleAnalytics,
  useProviderAnalytics,
  useProjects,
  useFilterOptions,
  type AnalyticsFilters,
  type CostDistribution,
} from "@/hooks/useAnalytics";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  formatPeriodDate,
} from "@/lib/analytics/date-utils";
import { pctChange } from "@/lib/analytics/kpi";
import {
  DollarSign,
  Zap,
  Hash,
  DatabaseZap,
  CalendarIcon,
  ArrowLeftRight,
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
type CompareValueOption = { value: string; label: string };

const DIMENSION_LABELS: Record<CompareDimension, string> = {
  project: "Project",
  model: "Model",
  role: "Role",
  agentType: "Agent Type",
  provider: "Provider",
};

const HIDDEN_PROJECT_IDS = new Set(["codex-sessions", "gemini-sessions"]);
const ALL_PROVIDERS_COMPARE_VALUE = "__all__";

function buildComparePair(
  options: CompareValueOption[],
  preferredA?: string,
  preferredB?: string,
): { valueA: string; valueB: string } {
  const firstValue = options[0]?.value ?? "";
  const valueA =
    preferredA && options.some((option) => option.value === preferredA)
      ? preferredA
      : firstValue;
  const fallbackB =
    options.find((option) => option.value !== valueA)?.value ?? valueA;
  const valueB =
    preferredB &&
    preferredB !== valueA &&
    options.some((option) => option.value === preferredB)
      ? preferredB
      : fallbackB;
  return { valueA, valueB };
}

function stripComparedDimensionFilter(
  base: AnalyticsFilters,
  dim: CompareDimension,
): AnalyticsFilters {
  const next = { ...base };
  if (dim === "project") delete next.projectId;
  if (dim === "role") delete next.roles;
  if (dim === "model") {
    delete next.models;
    delete next.modelOp;
  }
  if (dim === "agentType") delete next.agentTypes;
  if (dim === "provider") delete next.provider;
  return next;
}

function formatModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function formatRangeLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const sameYear = start.getFullYear() === end.getFullYear();
  const currentYear = new Date().getFullYear();
  const includeYear = !sameYear || start.getFullYear() !== currentYear;
  const fmt = includeYear ? "MMM d, yyyy" : "MMM d";
  return `${format(start, fmt)} — ${format(end, fmt)}`;
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

type CompareHighlightRow = {
  id: string;
  kind: "model" | "provider" | "agentType" | "tool";
  label: string;
  current: number;
  previous: number;
  delta: number;
  pct: number;
  metric: "cost" | "calls";
};

function hasDistributionSignal(dist: CostDistribution | undefined): boolean {
  if (!dist) return false;
  if (dist.max > 0) return true;
  return dist.histogram.some((bucket) => bucket.count > 0);
}

function formatToolCompareLabel(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    return parts.length >= 3 ? parts.slice(2).join("/") : name;
  }
  if (name.startsWith("Task:") || name.startsWith("Skill:")) {
    return name.slice(name.indexOf(":") + 1);
  }
  return name;
}

function buildHighlightRows<T>({
  currentRows,
  previousRows,
  getKey,
  getLabel,
  getValue,
  kind,
  metric,
  excludeOneSided = false,
}: {
  currentRows: T[] | undefined;
  previousRows: T[] | undefined;
  getKey: (row: T) => string;
  getLabel: (row: T) => string;
  getValue: (row: T) => number;
  kind: CompareHighlightRow["kind"];
  metric: CompareHighlightRow["metric"];
  excludeOneSided?: boolean;
}): CompareHighlightRow[] {
  const current = currentRows ?? [];
  const previous = previousRows ?? [];
  const currentMap = new Map(current.map((row) => [getKey(row), row]));
  const previousMap = new Map(previous.map((row) => [getKey(row), row]));
  const keys = new Set([...currentMap.keys(), ...previousMap.keys()]);

  const rows: CompareHighlightRow[] = [];
  for (const key of keys) {
    const cur = currentMap.get(key);
    const prev = previousMap.get(key);
    const currentValue = cur ? getValue(cur) : 0;
    const previousValue = prev ? getValue(prev) : 0;
    if (
      excludeOneSided &&
      (Math.abs(currentValue) <= 0.0001 || Math.abs(previousValue) <= 0.0001)
    ) {
      continue;
    }
    const delta = currentValue - previousValue;
    if (Math.abs(delta) <= 0.0001) continue;
    const label = cur ? getLabel(cur) : prev ? getLabel(prev) : key;
    rows.push({
      id: `${kind}:${key}`,
      kind,
      label,
      current: currentValue,
      previous: previousValue,
      delta,
      pct: pctChange(currentValue, previousValue),
      metric,
    });
  }
  return rows;
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

  const activePreset = useMemo(
    () => getActivePreset(from, compareStartDate),
    [from, compareStartDate],
  );

  // Derive whether role filter is active (for includeRoleBreakdown logic)
  const hasRoleFilter =
    !!filters.roles?.length ||
    (compareType === "dimension" && compareDim?.dimension === "role");

  // When comparing a dimension, filter options should not be constrained by that same dimension.
  const filterOptionSeedFilters = useMemo(() => {
    if (compareType === "dimension" && compareDim) {
      return stripComparedDimensionFilter(filters, compareDim.dimension);
    }
    return filters;
  }, [filters, compareType, compareDim]);

  const { data: filterOptions } = useFilterOptions(
    from,
    to,
    filterOptionSeedFilters.projectId,
    filterOptionSeedFilters.provider,
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
  const { data: compareModelData } = useModelUsage(
    effectiveCompareFrom,
    effectiveCompareTo,
    compareFilters,
    compareMode,
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

    return primaryDaily.map((a, i) => ({
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
      compare_total_cost: comparisonDaily[i]?.total_cost ?? 0,
      compare_input_tokens: comparisonDaily[i]?.input_tokens ?? 0,
      compare_output_tokens: comparisonDaily[i]?.output_tokens ?? 0,
      compare_message_count: comparisonDaily[i]?.message_count ?? 0,
      compare_tool_call_count: comparisonDaily[i]?.tool_call_count ?? 0,
      compare_avg_latency_ms: comparisonDaily[i]?.avg_latency_ms ?? 0,
      compare_avg_p95_latency_ms: comparisonDaily[i]?.avg_p95_latency_ms ?? 0,
    }));
  }, [
    compareMode,
    compareType,
    analyticsData,
    compareData,
    from,
    to,
    granularity,
    effectiveCompareFrom,
    effectiveCompareTo,
  ]);

  // Dimension compare: get value options for current dimension
  const getDimValues = useCallback(
    (dim: CompareDimension): CompareValueOption[] => {
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
    },
    [projects, filterOptions],
  );

  const availableCompareDimensions = useMemo(
    () =>
      (Object.keys(DIMENSION_LABELS) as CompareDimension[]).filter(
        (dim) => getDimValues(dim).length >= 2,
      ),
    [getDimValues],
  );

  const currentDimValues = useMemo(
    () =>
      compareType === "dimension" && compareDim
        ? getDimValues(compareDim.dimension)
        : [],
    [compareType, compareDim, getDimValues],
  );
  const currentDimValueLabelMap = useMemo(
    () => new Map(currentDimValues.map((option) => [option.value, option.label])),
    [currentDimValues],
  );

  // Labels for comparison charts and summary
  const compareLabels = useMemo((): [string, string] | undefined => {
    if (!compareMode) return undefined;
    if (compareType === "dimension" && compareDim) {
      const labelA =
        currentDimValueLabelMap.get(compareDim.valueA) ?? compareDim.valueA;
      const labelB =
        currentDimValueLabelMap.get(compareDim.valueB) ?? compareDim.valueB;
      return [labelA, labelB];
    }
    return [
      formatRangeLabel(from, to),
      formatRangeLabel(compareFrom, compareTo),
    ];
  }, [
    compareMode,
    compareType,
    compareDim,
    from,
    to,
    compareFrom,
    compareTo,
    currentDimValueLabelMap,
  ]);

  const showModelBreakdown = useMemo(() => {
    const current = modelData?.models ?? [];
    if (!compareMode) return current.length > 0;
    if (!compareModelData) return false;
    const previous = compareModelData.models;
    if (compareType === "dimension") {
      if (compareDim?.dimension === "model") return false;
      if (compareDim?.dimension === "provider") {
        const previousByModel = new Map(previous.map((row) => [row.model, row]));
        const sharedModelCount = current.filter((row) => {
          const compareRow = previousByModel.get(row.model);
          return !!compareRow && (row.cost > 0 || compareRow.cost > 0);
        }).length;
        if (sharedModelCount === 0) return false;
      }
    }
    return current.length > 0 || previous.length > 0;
  }, [
    compareMode,
    compareType,
    compareDim,
    modelData?.models,
    compareModelData?.models,
  ]);

  const showSubagentTypeBreakdown = useMemo(() => {
    if (hasRoleFilter || !roleData) return false;
    const current = roleData.byAgentType;
    if (!compareMode) return current.length > 0;
    if (!compareRoleData) return false;
    const previous = compareRoleData.byAgentType;
    if (
      compareType === "dimension" &&
      compareDim?.dimension === "agentType" &&
      current.length <= 1 &&
      previous.length <= 1
    ) {
      return false;
    }
    return current.length > 0 || previous.length > 0;
  }, [
    hasRoleFilter,
    roleData,
    compareMode,
    compareRoleData?.byAgentType,
    compareType,
    compareDim,
  ]);

  const showProviderBreakdown = useMemo(() => {
    if (!providerData) return false;
    if (!compareMode) return providerData.byProvider.length > 1;
    if (!compareProviderData) return false;
    if (compareType === "dimension" && compareDim?.dimension === "provider") {
      return false;
    }
    return (
      providerData.byProvider.length > 0 ||
      compareProviderData.byProvider.length > 0
    );
  }, [
    providerData,
    compareMode,
    compareType,
    compareDim,
    compareProviderData?.byProvider,
  ]);

  const showTrendCharts = useMemo(() => {
    if (!compareMode) return (analyticsData?.daily.length ?? 0) > 0;
    return (mergedDaily?.length ?? 0) > 0;
  }, [compareMode, analyticsData?.daily, mergedDaily]);

  const showToolUsage = useMemo(() => {
    const current = toolData?.tools ?? [];
    if (!compareMode) return current.length > 0;
    const previous = compareToolData?.tools ?? [];
    return current.length > 0 || previous.length > 0;
  }, [compareMode, toolData?.tools, compareToolData?.tools]);

  const showCostDistribution = useMemo(() => {
    const current = analyticsData?.costDistribution;
    if (!current) return false;
    if (!compareMode) return hasDistributionSignal(current);
    const previous = compareData?.costDistribution;
    if (!previous) return hasDistributionSignal(current);
    return hasDistributionSignal(current) || hasDistributionSignal(previous);
  }, [analyticsData?.costDistribution, compareData?.costDistribution, compareMode]);

  const costHighlights = useMemo(() => {
    if (!compareMode) return [] as CompareHighlightRow[];
    if (!compareModelData || !compareProviderData || !compareRoleData) {
      return [] as CompareHighlightRow[];
    }
    const excludeOneSided = compareType === "dimension";
    const rows: CompareHighlightRow[] = [];
    if (!(compareType === "dimension" && compareDim?.dimension === "model")) {
      rows.push(
        ...buildHighlightRows({
          currentRows: modelData?.models,
          previousRows: compareModelData.models,
          getKey: (row) => row.model,
          getLabel: (row) => formatModelName(row.model),
          getValue: (row) => row.cost,
          kind: "model",
          metric: "cost",
          excludeOneSided,
        }),
      );
    }
    if (!(compareType === "dimension" && compareDim?.dimension === "provider")) {
      rows.push(
        ...buildHighlightRows({
          currentRows: providerData?.byProvider,
          previousRows: compareProviderData.byProvider,
          getKey: (row) => row.provider,
          getLabel: (row) => getSessionProvider(row.provider)?.label ?? row.provider,
          getValue: (row) => row.totalCost,
          kind: "provider",
          metric: "cost",
          excludeOneSided,
        }),
      );
    }
    if (!(compareType === "dimension" && compareDim?.dimension === "agentType")) {
      rows.push(
        ...buildHighlightRows({
          currentRows: roleData?.byAgentType,
          previousRows: compareRoleData.byAgentType,
          getKey: (row) => row.type,
          getLabel: (row) => row.type,
          getValue: (row) => row.totalCost,
          kind: "agentType",
          metric: "cost",
          excludeOneSided,
        }),
      );
    }
    return rows
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }, [
    compareMode,
    compareType,
    compareDim,
    modelData?.models,
    compareModelData?.models,
    providerData?.byProvider,
    compareProviderData?.byProvider,
    roleData?.byAgentType,
    compareRoleData?.byAgentType,
  ]);

  const toolCallHighlights = useMemo(() => {
    if (!compareMode) return [] as CompareHighlightRow[];
    if (!compareToolData) return [] as CompareHighlightRow[];
    const excludeOneSided = compareType === "dimension";
    return buildHighlightRows({
      currentRows: toolData?.tools,
      previousRows: compareToolData.tools,
      getKey: (row) => row.name,
      getLabel: (row) => formatToolCompareLabel(row.name),
      getValue: (row) => row.totalCalls,
      kind: "tool",
      metric: "calls",
      excludeOneSided,
    })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8);
  }, [compareMode, compareType, toolData?.tools, compareToolData?.tools]);

  const showComparisonHighlights =
    compareMode && (costHighlights.length > 0 || toolCallHighlights.length > 0);

  function handleDimensionChange(dim: CompareDimension) {
    const values = getDimValues(dim);
    const { valueA, valueB } = buildComparePair(values);
    setCompareDim({
      dimension: dim,
      valueA,
      valueB,
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
      availableCompareDimensions.find((dim) => getDimValues(dim).length >= 2) ??
      "role";

    setCompareDim((prev) => {
      const activeDimension =
        prev && getDimValues(prev.dimension).length >= 2
          ? prev.dimension
          : fallbackDimension;
      const values = getDimValues(activeDimension);
      const { valueA: nextValueA, valueB: nextValueB } = buildComparePair(
        values,
        prev?.valueA,
        prev?.valueB,
      );
      return {
        dimension: activeDimension,
        valueA: nextValueA,
        valueB: nextValueB,
      };
    });
  }

  useEffect(() => {
    if (compareType !== "dimension" || !compareDim) return;

    const values = getDimValues(compareDim.dimension);
    if (values.length < 2) {
      const fallback = availableCompareDimensions[0];
      if (!fallback || fallback === compareDim.dimension) return;
      const fallbackValues = getDimValues(fallback);
      const pair = buildComparePair(fallbackValues);
      setCompareDim({
        dimension: fallback,
        valueA: pair.valueA,
        valueB: pair.valueB,
      });
      return;
    }

    const nextPair = buildComparePair(
      values,
      compareDim.valueA,
      compareDim.valueB,
    );
    if (
      nextPair.valueA !== compareDim.valueA ||
      nextPair.valueB !== compareDim.valueB
    ) {
      setCompareDim({
        dimension: compareDim.dimension,
        valueA: nextPair.valueA,
        valueB: nextPair.valueB,
      });
    }
  }, [compareType, compareDim, availableCompareDimensions, getDimValues]);

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
      return stripComparedDimensionFilter(filters, compareDim.dimension);
    }
    return filters;
  }, [filters, compareType, compareDim]);

  // Use effectiveFilters for the FilterBar display
  const handleFiltersChange = (next: AnalyticsFilters) => {
    // If a dimension is being compared, make sure we don't set it on the base filters
    if (compareType === "dimension" && compareDim) {
      setFilters(stripComparedDimensionFilter(next, compareDim.dimension));
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
                  Primary {formatPeriodDate(from)} - {formatPeriodDate(to)} • Comparison{" "}
                  {formatPeriodDate(compareFrom)} - {formatPeriodDate(compareTo)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Change values are calculated as Primary relative to Comparison.
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Charts align by relative day (Day 1..N), not calendar dates.
                </p>
              </div>
            )}

            {compareType === "dimension" && compareDim && (
              <div className="rounded-lg border border-border/60 bg-background/55 p-2.5 space-y-2">
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
                        {availableCompareDimensions.map((key) => (
                          <SelectItem key={key} value={key} className="text-xs">
                            {DIMENSION_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      A (Primary)
                    </span>
                    <Select
                      value={compareDim.valueA}
                      onValueChange={(v) => {
                        const pair = buildComparePair(
                          currentDimValues,
                          v,
                          compareDim.valueB,
                        );
                        setCompareDim({
                          ...compareDim,
                          valueA: pair.valueA,
                          valueB: pair.valueB,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-full text-xs gap-1 sm:w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currentDimValues.map(({ value, label }) => (
                          <SelectItem
                            key={value}
                            value={value}
                            className="text-xs"
                            disabled={value === compareDim.valueB}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-[11px] text-muted-foreground"
                      onClick={() =>
                        setCompareDim({
                          ...compareDim,
                          valueA: compareDim.valueB,
                          valueB: compareDim.valueA,
                        })
                      }
                    >
                      <ArrowLeftRight size={12} />
                      Swap
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      B (Comparison)
                    </span>
                    <Select
                      value={compareDim.valueB}
                      onValueChange={(v) => {
                        const pair = buildComparePair(
                          currentDimValues,
                          compareDim.valueA,
                          v,
                        );
                        setCompareDim({
                          ...compareDim,
                          valueA: pair.valueA,
                          valueB: pair.valueB,
                        });
                      }}
                    >
                      <SelectTrigger className="h-8 w-full text-xs gap-1 sm:w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currentDimValues.map(({ value, label }) => (
                          <SelectItem
                            key={value}
                            value={value}
                            className="text-xs"
                            disabled={value === compareDim.valueA}
                          >
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Comparing {DIMENSION_LABELS[compareDim.dimension]}:
                  {" "}
                  <span className="text-foreground font-medium">
                    {compareLabels?.[0] ?? "Primary"}
                  </span>
                  {" "}vs{" "}
                  <span className="text-foreground font-medium">
                    {compareLabels?.[1] ?? "Comparison"}
                  </span>
                  . Change values are calculated as Primary relative to Comparison.
                </p>
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
              periodA={totals}
              periodB={compareData.totals}
              periodALabel={compareLabels?.[0] ?? "Primary"}
              periodBLabel={compareLabels?.[1] ?? "Comparison"}
            />
          )}

          {showComparisonHighlights && (
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-section-title">Top Changes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[10px] text-muted-foreground">
                  Largest deltas from Primary relative to Comparison.
                </p>

                {costHighlights.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Cost Movers
                    </div>
                    <div className="overflow-x-auto">
                      <table className="table-readable w-full">
                        <thead>
                          <tr className="border-b border-border/30 text-muted-foreground">
                            <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                            <th className="text-left py-1.5 px-3 font-medium">Entity</th>
                            <th className="text-right py-1.5 px-3 font-medium">Primary</th>
                            <th className="text-right py-1.5 px-3 font-medium">Comparison</th>
                            <th className="text-right py-1.5 pl-3 font-medium">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {costHighlights.map((row) => {
                            const typeLabel =
                              row.kind === "model"
                                ? "Model"
                                : row.kind === "provider"
                                  ? "Provider"
                                  : "Agent Type";
                            return (
                              <tr key={row.id} className="border-b border-border/20">
                                <td className="py-1.5 pr-3 text-muted-foreground">
                                  {typeLabel}
                                </td>
                                <td className="py-1.5 px-3 text-foreground font-medium">
                                  {row.label}
                                </td>
                                <td className="text-right py-1.5 px-3 tabular-nums">
                                  {formatCost(row.current)}
                                </td>
                                <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground">
                                  {formatCost(row.previous)}
                                </td>
                                <td
                                  className={cn(
                                    "text-right py-1.5 pl-3 tabular-nums",
                                    row.delta > 0
                                      ? "text-destructive"
                                      : "text-success",
                                  )}
                                >
                                  {row.delta > 0 ? "+" : "-"}
                                  {formatCost(Math.abs(row.delta))}
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    ({row.delta > 0 ? "+" : ""}
                                    {row.pct.toFixed(1)}%)
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {toolCallHighlights.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Tool Call Movers
                    </div>
                    <div className="overflow-x-auto">
                      <table className="table-readable w-full">
                        <thead>
                          <tr className="border-b border-border/30 text-muted-foreground">
                            <th className="text-left py-1.5 pr-3 font-medium">Tool</th>
                            <th className="text-right py-1.5 px-3 font-medium">Primary</th>
                            <th className="text-right py-1.5 px-3 font-medium">Comparison</th>
                            <th className="text-right py-1.5 pl-3 font-medium">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {toolCallHighlights.map((row) => (
                            <tr key={row.id} className="border-b border-border/20">
                              <td className="py-1.5 pr-3 font-mono text-[11px] text-foreground">
                                {row.label}
                              </td>
                              <td className="text-right py-1.5 px-3 tabular-nums">
                                {row.current.toLocaleString()}
                              </td>
                              <td className="text-right py-1.5 px-3 tabular-nums text-muted-foreground">
                                {row.previous.toLocaleString()}
                              </td>
                              <td
                                className={cn(
                                  "text-right py-1.5 pl-3 tabular-nums",
                                  row.delta > 0 ? "text-destructive" : "text-success",
                                )}
                              >
                                {row.delta > 0 ? "+" : ""}
                                {row.delta.toLocaleString()}
                                <span className="ml-1 text-[10px] text-muted-foreground">
                                  ({row.delta > 0 ? "+" : ""}
                                  {row.pct.toFixed(1)}%)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Model Breakdown Table */}
          {showModelBreakdown ? (
            <CardExpandWrapper href="/analytics/explore/models">
              <ModelBreakdownTable
                data={modelData?.models ?? []}
                compareData={compareModelData?.models}
                compareLabels={compareLabels}
              />
            </CardExpandWrapper>
          ) : null}

          {/* Subagent Type Breakdown */}
          {showSubagentTypeBreakdown && roleData && (
            <SubagentTypeCard
              byAgentType={roleData.byAgentType}
              compareByAgentType={compareRoleData?.byAgentType}
              compareLabels={compareLabels}
            />
          )}

          {/* Provider Breakdown */}
          {showProviderBreakdown && providerData && (
            <ProviderBreakdownCard
              byProvider={providerData.byProvider}
              daily={providerData.daily}
              compareByProvider={compareProviderData?.byProvider}
              compareLabels={compareLabels}
            />
            )}

          {/* Charts — full width 2x2 grid */}
          {showTrendCharts && analyticsData?.daily && (
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
          {showToolUsage && toolData && (
            <ToolUsageCard
              tools={toolData.tools}
              categories={toolData.categories}
              compareTools={compareToolData?.tools}
              compareCategories={compareToolData?.categories}
              compareLabels={compareLabels}
            />
          )}

          {/* Cost Distribution */}
          {showCostDistribution && analyticsData?.costDistribution && (
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
