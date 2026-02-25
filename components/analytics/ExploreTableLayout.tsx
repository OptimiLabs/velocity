"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Columns3, Check } from "lucide-react";
import { FilterBar } from "@/components/analytics/FilterBar";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/date-range-picker";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { AnalyticsFilters } from "@/hooks/useAnalytics";
import type { SortState } from "@/lib/table-sort";
import { nextSort } from "@/lib/table-sort";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";

export interface ColumnDef {
  key: string;
  label: string;
  defaultVisible?: boolean;
}

interface ExploreTableLayoutProps {
  columns: ColumnDef[];
  visibleColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  filters: AnalyticsFilters;
  onFiltersChange: (f: AnalyticsFilters) => void;
  projects: { id: string; name: string }[];
  filterOptions: { models: string[]; agentTypes: string[]; providers: string[] } | undefined;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  children: React.ReactNode;
}

export function ExploreTableLayout({
  columns,
  visibleColumns,
  onToggleColumn,
  filters,
  onFiltersChange,
  projects,
  filterOptions,
  dateRange,
  onDateRangeChange,
  children,
}: ExploreTableLayoutProps) {
  const [colOpen, setColOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-6 min-h-screen">
      {/* Header */}
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
          onChange={onFiltersChange}
          projects={projects}
          filterOptions={filterOptions}
        />

        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />

        {/* Column toggle */}
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
              {columns.map((col) => {
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
                    onClick={() => onToggleColumn(col.key)}
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

      {/* Table content */}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/* Reusable sortable table header */
export function SortableHeader({
  column,
  label,
  sort,
  onSort,
  className,
}: {
  column: string;
  label: string;
  sort: SortState;
  onSort: (s: SortState) => void;
  className?: string;
}) {
  const active = sort?.column === column;
  return (
    <th
      className={cn(
        "py-2 px-2 font-medium cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
      onClick={() => onSort(nextSort(sort, column))}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active &&
          (sort!.dir === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          ))}
      </span>
    </th>
  );
}
