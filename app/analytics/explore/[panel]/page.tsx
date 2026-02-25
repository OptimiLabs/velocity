"use client";

import { useState, useMemo, useCallback, use } from "react";
import { redirect } from "next/navigation";
import {
  useProjects,
  useFilterOptions,
  type AnalyticsFilters,
} from "@/hooks/useAnalytics";
import {
  ExploreTableLayout,
  type ColumnDef,
} from "@/components/analytics/ExploreTableLayout";
import { type DateRange } from "@/components/ui/date-range-picker";
import type { SortState } from "@/lib/table-sort";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import type { Col } from "@/components/analytics/explore/GenericTable";
import {
  MODEL_COLS,
  ModelsPanel,
} from "@/components/analytics/explore/ModelsPanel";
import {
  COST_DIST_COLS,
  CostDistributionPanel,
} from "@/components/analytics/explore/CostDistributionPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

type PanelSlug = "models" | "cost-distribution";

// ─── Column defs → ColumnDef (for layout header) ────────────────────────────

function toLayoutColumns<T>(cols: Col<T>[]): ColumnDef[] {
  return cols.map((c) => ({
    key: c.key,
    label: c.label,
    defaultVisible: c.defaultVisible,
  }));
}

function defaultVisibleSet<T>(cols: Col<T>[]): Set<string> {
  return new Set(
    cols.filter((c) => c.defaultVisible !== false).map((c) => c.key),
  );
}

// ─── Column defs lookup (for ExploreTableLayout header) ─────────────────────

function getColumnsForPanel(panel: PanelSlug): ColumnDef[] {
  switch (panel) {
    case "models":
      return toLayoutColumns(MODEL_COLS);
    case "cost-distribution":
      return toLayoutColumns(COST_DIST_COLS);
  }
}

function getDefaultVisible(panel: PanelSlug): Set<string> {
  switch (panel) {
    case "models":
      return defaultVisibleSet(MODEL_COLS);
    case "cost-distribution":
      return defaultVisibleSet(COST_DIST_COLS);
  }
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ExplorePanel({
  params: paramsPromise,
}: {
  params: Promise<{ panel: string }>;
}) {
  const params = use(paramsPromise);
  const slug = params.panel;

  // Redirect removed tool panels to the dedicated tools page
  if (slug === "expensive-tools" || slug === "tools") {
    redirect("/analytics/tools");
  }

  const panel = slug as PanelSlug;
  const layoutColumns = getColumnsForPanel(panel);

  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  });
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [sort, setSort] = useState<SortState>(null);
  const [visibleColumns, setVisibleColumns] = useState(() =>
    getDefaultVisible(panel),
  );

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

  return (
    <ExploreTableLayout
      columns={layoutColumns}
      visibleColumns={visibleColumns}
      onToggleColumn={toggleColumn}
      filters={filters}
      onFiltersChange={setFilters}
      projects={projects ?? []}
      filterOptions={filterOptions}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
    >
      {panel === "models" && (
        <ModelsPanel
          from={from}
          to={to}
          filters={filters}
          sort={sort}
          onSort={setSort}
          vis={visibleColumns}
        />
      )}
      {panel === "cost-distribution" && (
        <CostDistributionPanel
          from={from}
          to={to}
          filters={filters}
          sort={sort}
          onSort={setSort}
          vis={visibleColumns}
        />
      )}
    </ExploreTableLayout>
  );
}
