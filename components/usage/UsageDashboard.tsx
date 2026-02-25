"use client";

import { useMemo, useState } from "react";
import {
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  BookMarked,
  Layers,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { KPICard } from "@/components/layout/KPICard";
import { CostChart } from "@/components/analytics/CostChart";
import { ModelBreakdownTable } from "@/components/usage/ModelBreakdownTable";
import { SessionCostTable } from "@/components/usage/SessionCostTable";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics, useModelUsage } from "@/hooks/useAnalytics";
import { useSessions } from "@/hooks/useSessions";
import { formatCost, formatTokens } from "@/lib/cost/calculator";

interface UsageDashboardProps {
  from: string;
  to: string;
  provider?: string;
}

function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

export function UsageDashboard({ from, to, provider }: UsageDashboardProps) {
  const rangeMs = new Date(to).getTime() - new Date(from).getTime();
  const granularity = rangeMs < 3 * 24 * 60 * 60 * 1000 ? "hour" : "day";
  const filters = useMemo(() => (provider ? { provider } : {}), [provider]);

  const { data: analytics, isLoading: analyticsLoading } = useAnalytics(
    from,
    to,
    filters,
    true,
    granularity,
  );

  const { data: modelData, isLoading: modelsLoading } = useModelUsage(
    from,
    to,
    filters,
  );

  const [sessionPage, setSessionPage] = useState(1);
  const [sessionSort, setSessionSort] = useState("cost");
  const [sessionSortDir, setSessionSortDir] = useState<"ASC" | "DESC">("DESC");
  const pageSize = 10;

  const { data: sessionsData, isLoading: sessionsLoading } = useSessions({
    dateFrom: from,
    dateTo: to,
    provider,
    sortBy: sessionSort,
    sortDir: sessionSortDir,
    limit: pageSize,
    offset: (sessionPage - 1) * pageSize,
  });

  const totals = analytics?.totals;
  const prevTotals = analytics?.previousTotals;

  const kpis = useMemo(() => {
    if (!totals) return null;
    return [
      {
        label: "Est. Cost",
        value: formatCost(totals.total_cost),
        icon: DollarSign,
        color: "text-chart-1",
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_cost, prevTotals.total_cost), invertTrend: true }
          : undefined,
      },
      {
        label: "Input Tokens",
        value: formatTokens(totals.total_input_tokens),
        icon: ArrowDownToLine,
        color: "text-chart-2",
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_input_tokens, prevTotals.total_input_tokens) }
          : undefined,
      },
      {
        label: "Output Tokens",
        value: formatTokens(totals.total_output_tokens),
        icon: ArrowUpFromLine,
        color: "text-chart-3",
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_output_tokens, prevTotals.total_output_tokens) }
          : undefined,
      },
      {
        label: "Cache Read",
        value: formatTokens(totals.total_cache_read_tokens),
        icon: BookOpen,
        color: "text-chart-4",
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_cache_read_tokens, prevTotals.total_cache_read_tokens) }
          : undefined,
      },
      {
        label: "Cache Write",
        value: formatTokens(totals.total_cache_write_tokens),
        icon: BookMarked,
        color: "text-chart-5",
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_cache_write_tokens, prevTotals.total_cache_write_tokens) }
          : undefined,
      },
      {
        label: "Sessions",
        value: totals.total_sessions,
        icon: Layers,
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_sessions, prevTotals.total_sessions) }
          : undefined,
      },
      {
        label: "Messages",
        value: totals.total_messages,
        icon: MessageSquare,
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_messages, prevTotals.total_messages) }
          : undefined,
      },
      {
        label: "Tool Calls",
        value: totals.total_tool_calls,
        icon: Wrench,
        trend: prevTotals
          ? { pctChange: pctChange(totals.total_tool_calls, prevTotals.total_tool_calls) }
          : undefined,
      },
    ];
  }, [totals, prevTotals]);

  if (analyticsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((kpi, i) => (
            <KPICard key={kpi.label} {...kpi} animationDelay={i * 50} />
          ))}
        </div>
      )}

      {/* Cost Chart */}
      {analytics?.daily && analytics.daily.length > 0 && (
        <CostChart data={analytics.daily} />
      )}

      {/* Model Breakdown */}
      {!modelsLoading && modelData?.models && (
        <ModelBreakdownTable data={modelData.models} />
      )}

      {/* Top Sessions */}
      {!sessionsLoading && sessionsData && (
        <SessionCostTable
          sessions={sessionsData.sessions}
          total={sessionsData.total}
          page={sessionPage}
          onPageChange={setSessionPage}
          pageSize={pageSize}
          sortBy={sessionSort}
          sortDir={sessionSortDir}
          onSortChange={(sortBy, sortDir) => {
            setSessionSort(sortBy);
            setSessionSortDir(sortDir);
            setSessionPage(1);
          }}
        />
      )}
    </div>
  );
}
