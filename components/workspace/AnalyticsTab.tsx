"use client";

import { useState, useMemo } from "react";
import {
  useAnalytics,
  useProjectCosts,
  useProjects,
} from "@/hooks/useAnalytics";
import { KPICard } from "@/components/layout/KPICard";
import { CostChart } from "@/components/analytics/CostChart";
import { ActivityChart } from "@/components/analytics/ActivityChart";
import { TokenChart } from "@/components/analytics/TokenChart";
import { ProjectCostChart } from "@/components/analytics/ProjectCostChart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DollarSign,
  MessageSquare,
  Layers,
  Wrench,
  BarChart3,
} from "lucide-react";
import { subDays, format } from "date-fns";

const ranges = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "All", days: 365 },
];

export function AnalyticsTab() {
  const [activeDays, setActiveDays] = useState(30);
  const [selectedProject, setSelectedProject] = useState<string | undefined>();
  const { today, from } = useMemo(
    () => ({
      today: format(new Date(), "yyyy-MM-dd"),
      from: format(subDays(new Date(), activeDays), "yyyy-MM-dd"),
    }),
    [activeDays],
  );

  const { data, isLoading } = useAnalytics(
    from,
    today,
    selectedProject ? { projectId: selectedProject } : {},
  );
  const { data: projectData } = useProjectCosts(from, today);
  const { data: projects } = useProjects();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            className="h-7 text-xs px-2 bg-card border border-border/50 rounded-md text-foreground"
            value={selectedProject || ""}
            onChange={(e) => setSelectedProject(e.target.value || undefined)}
          >
            <option value="">All Projects</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-muted-foreground">
            {from} — {today}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {ranges.map(({ label, days }) => (
            <Button
              key={days}
              variant={activeDays === days ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-2.5"
              onClick={() => setActiveDays(days)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-4 gap-3">
            {(
              [
                {
                  label: "Total Cost",
                  value: `$${data.totals.total_cost.toFixed(2)}`,
                  icon: DollarSign,
                  color: "text-chart-1",
                  prevKey: "total_cost" as const,
                  invertTrend: true,
                },
                {
                  label: "Messages",
                  value: data.totals.total_messages.toLocaleString(),
                  icon: MessageSquare,
                  color: "text-chart-2",
                  prevKey: "total_messages" as const,
                  invertTrend: false,
                },
                {
                  label: "Sessions",
                  value: data.totals.total_sessions.toLocaleString(),
                  icon: Layers,
                  color: "text-chart-3",
                  prevKey: "total_sessions" as const,
                  invertTrend: false,
                },
                {
                  label: "Tool Calls",
                  value: data.totals.total_tool_calls.toLocaleString(),
                  icon: Wrench,
                  color: "text-chart-4",
                  prevKey: "total_tool_calls" as const,
                  invertTrend: false,
                },
              ] as const
            ).map((kpi, i) => {
              const prev = data.previousTotals?.[kpi.prevKey];
              const current = data.totals[kpi.prevKey];
              const pctChange =
                prev && prev > 0 ? ((current - prev) / prev) * 100 : 0;
              return (
                <KPICard
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  icon={kpi.icon}
                  color={kpi.color}
                  trend={
                    pctChange !== 0
                      ? { pctChange, invertTrend: kpi.invertTrend }
                      : undefined
                  }
                  animationDelay={i * 50}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <CostChart data={data.daily} />
            <ActivityChart data={data.daily} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <TokenChart data={data.daily} />
            {projectData && <ProjectCostChart data={projectData.projects} />}
          </div>
        </>
      ) : (
        <EmptyState
          icon={BarChart3}
          title="No analytics data"
          description="Try re-indexing from the header."
        />
      )}
    </div>
  );
}
