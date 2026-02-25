"use client";

import { useState, useMemo, useEffect } from "react";
import { useAnalytics, type AnalyticsFilters } from "@/hooks/useAnalytics";
import { useSessions, type SessionFilters } from "@/hooks/useSessions";
import { Badge } from "@/components/ui/badge";
import { TablePagination } from "@/components/ui/table-pagination";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { format } from "date-fns";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  chartColors,
  chartTickStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import { ExternalLink } from "lucide-react";
import type { Session } from "@/types/session";
import { GenericTable, type Col } from "./GenericTable";
import { RowCount } from "./Helpers";
import type { PanelProps } from "./ModelsPanel";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SessionRow extends Session {
  _cacheRate: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert AnalyticsFilters (arrays) -> SessionFilters (singular strings) */
function analyticsToSessionFilters(
  f: AnalyticsFilters,
  from: string,
  to: string,
): Partial<SessionFilters> {
  return {
    dateFrom: from,
    dateTo: to,
    projectId: f.projectId,
    model: f.models?.join(",") || undefined,
    modelOp: f.modelOp,
    role: f.roles?.join(",") || undefined,
    agentType: f.agentTypes?.join(",") || undefined,
    provider: f.provider,
  };
}

// ─── Cost distribution session columns ──────────────────────────────────────

export const COST_DIST_COLS: Col<SessionRow>[] = [
  {
    key: "created_at",
    label: "Date",
    value: (r) => r.created_at,
    render: (r) => (
      <span className="text-muted-foreground whitespace-nowrap">
        {r.created_at
          ? format(new Date(r.created_at), "MMM d, HH:mm")
          : "\u2014"}
      </span>
    ),
  },
  {
    key: "prompt",
    label: "Prompt",
    value: (r) => r.first_prompt ?? r.slug ?? r.id,
    render: (r) => (
      <Link
        href={`/sessions/${r.id}`}
        className="flex items-center gap-1.5 text-foreground hover:text-chart-1 transition-colors max-w-[300px]"
      >
        <span className="truncate font-mono text-xs">
          {r.first_prompt?.slice(0, 80) || r.slug || r.id.slice(0, 12)}
        </span>
        <ExternalLink
          size={9}
          className="opacity-0 group-hover:opacity-50 shrink-0"
        />
      </Link>
    ),
  },
  {
    key: "total_cost",
    label: "Cost",
    align: "right",
    value: (r) => r.total_cost,
    render: (r) => (
      <span className="font-medium text-foreground">
        {formatCost(r.total_cost)}
      </span>
    ),
  },
  {
    key: "input_tokens",
    label: "Input",
    align: "right",
    value: (r) => r.input_tokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.input_tokens)}
      </span>
    ),
  },
  {
    key: "output_tokens",
    label: "Output",
    align: "right",
    value: (r) => r.output_tokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.output_tokens)}
      </span>
    ),
  },
  {
    key: "cacheRate",
    label: "Cache %",
    align: "right",
    sortable: false,
    value: (r) => r._cacheRate,
    render: (r) => (
      <span className="text-muted-foreground">{r._cacheRate.toFixed(1)}%</span>
    ),
  },
  {
    key: "message_count",
    label: "Msgs",
    align: "right",
    value: (r) => r.message_count,
    render: (r) => (
      <span className="text-muted-foreground">{r.message_count}</span>
    ),
  },
  {
    key: "tool_call_count",
    label: "Tools",
    align: "right",
    value: (r) => r.tool_call_count,
    render: (r) => (
      <span className="text-muted-foreground">{r.tool_call_count}</span>
    ),
  },
];

// ─── CostDistributionPanel ──────────────────────────────────────────────────

export function CostDistributionPanel({
  from,
  to,
  filters,
  sort,
  onSort,
  vis,
}: PanelProps) {
  const { data: analyticsData } = useAnalytics(from, to, filters);
  const [page, setPage] = useState(0);
  const limit = 25;

  // Derive a stable key from filter/sort state — when it changes, reset page
  const filterSortKey = `${sort?.column}:${sort?.dir}:${from}:${to}:${JSON.stringify(filters)}`;
  useEffect(() => {
    setPage(0);
  }, [filterSortKey]);

  // Map sort column names to API field names
  const SORT_MAP: Record<string, string> = {
    created_at: "created_at",
    prompt: "first_prompt",
    total_cost: "cost",
    input_tokens: "input",
    output_tokens: "output",
    cacheRate: "total_cost", // no server sort — fallback
    message_count: "messages",
    tool_call_count: "total_cost", // no server column — fallback
  };
  const apiSortBy = SORT_MAP[sort?.column ?? "total_cost"] ?? "cost";
  const apiSortDir = sort?.dir === "asc" ? "ASC" : "DESC";

  // Build session filters from analytics filters (pass ALL filter dimensions)
  const sessionFilters: SessionFilters = {
    sortBy: apiSortBy,
    sortDir: apiSortDir,
    limit,
    offset: page * limit,
    ...analyticsToSessionFilters(filters, from, to),
  };

  const { data: sessionData, isLoading } = useSessions(sessionFilters);

  const costDist = analyticsData?.costDistribution;
  const totalPages = sessionData ? Math.ceil(sessionData.total / limit) : 0;

  // Enrich sessions with computed cache rate
  const sessions = sessionData?.sessions;
  const rows: SessionRow[] = useMemo(() => {
    if (!sessions) return [];
    return sessions.map((s) => {
      const totalIn =
        s.input_tokens +
        (s.cache_read_tokens || 0) +
        (s.cache_write_tokens || 0);
      return {
        ...s,
        _cacheRate:
          totalIn > 0 ? ((s.cache_read_tokens || 0) / totalIn) * 100 : 0,
      };
    });
  }, [sessions]);

  const percentiles = costDist
    ? [
        { label: "p50", value: costDist.p50 },
        { label: "p75", value: costDist.p75 },
        { label: "p90", value: costDist.p90 },
        { label: "p99", value: costDist.p99 },
        { label: "max", value: costDist.max },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Percentiles + histogram */}
      {costDist && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {percentiles.map((p) => (
              <Badge
                key={p.label}
                variant="outline"
                className="text-xs tabular-nums gap-1.5"
              >
                <span className="text-muted-foreground">{p.label}</span>
                {formatCost(p.value)}
              </Badge>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={costDist.histogram} margin={{ left: -10 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={chartGridStroke}
                opacity={0.3}
              />
              <XAxis dataKey="bucket" tick={chartTickStyle} />
              <YAxis tick={chartTickStyle} allowDecimals={false} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={36}>
                {costDist.histogram.map((entry) => (
                  <Cell
                    key={entry.bucket}
                    fill={chartColors.chart4}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session table */}
      <div className="space-y-2">
        <RowCount
          count={sessionData?.total}
          noun="session"
          loading={isLoading}
        />
        <GenericTable
          columns={COST_DIST_COLS}
          rows={rows}
          vis={vis}
          sort={sort}
          onSort={onSort}
          rowKey={(r) => r.id}
          emptyMessage={
            isLoading
              ? "Loading sessions..."
              : "No sessions for this date range"
          }
        />
        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
