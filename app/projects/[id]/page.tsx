"use client";

import { use, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAnalytics } from "@/hooks/useAnalytics";
import { CostChart } from "@/components/analytics/CostChart";
import { TokenChart } from "@/components/analytics/TokenChart";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Folder } from "lucide-react";
import Link from "next/link";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { SessionCard } from "@/components/sessions/SessionCard";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { TabBar } from "@/components/layout/TabBar";
import { ProjectKnowledge } from "@/components/projects/ProjectKnowledge";
import {
  DateRangePicker,
  type DateRange,
} from "@/components/ui/date-range-picker";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import type { Session, Project } from "@/types/session";

interface ProjectDetail {
  project: Project;
  sessions: Session[];
  models: Record<
    string,
    {
      inputTokens: number;
      outputTokens: number;
      cost: number;
      sessions: number;
    }
  >;
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [activeTab, setActiveTab] = useState("overview");
  const [primaryRange, setPrimaryRange] = useState<DateRange>({
    from: startOfDay(subDays(new Date(), 30)),
    to: endOfDay(new Date()),
  });
  const { today, from } = useMemo(
    () => ({
      today: primaryRange.to
        ? format(primaryRange.to, "yyyy-MM-dd")
        : format(new Date(), "yyyy-MM-dd"),
      from: primaryRange.from
        ? format(primaryRange.from, "yyyy-MM-dd")
        : format(subDays(new Date(), 30), "yyyy-MM-dd"),
    }),
    [primaryRange],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["project-detail", id],
    queryFn: async (): Promise<ProjectDetail> => {
      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) throw new Error("Project not found");
      return res.json();
    },
  });

  const { data: analytics } = useAnalytics(from, today, { projectId: id });

  if (isLoading) {
    return (
      <PageContainer>
        <PageScaffold
          title="Project Detail"
          subtitle="Loading project analytics, sessions, and knowledge context."
        >
          <div className="space-y-4 rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-80" />
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <PageScaffold
          title="Project Detail"
          subtitle="Project analytics and related sessions are unavailable."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5">
            <EmptyState
              icon={Folder}
              title="Project not found"
              description="This project may have been removed."
            />
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  const { project, sessions, models } = data;
  const modelEntries = Object.entries(models).sort(
    ([, a], [, b]) => b.cost - a.cost,
  );

  return (
    <PageContainer>
      <PageScaffold
        title={project.name}
        subtitle={project.path}
        actions={
          <Link href="/sessions?tab=projects">
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <ArrowLeft size={14} />
              Back
            </Button>
          </Link>
        }
      >
        <TabBar
          tabs={[
            { id: "overview", label: "Overview" },
            { id: "knowledge", label: "Knowledge" },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {activeTab === "overview" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                { label: "Total Cost", value: formatCost(project.total_cost) },
                { label: "Sessions", value: String(project.session_count) },
                { label: "Tokens", value: formatTokens(project.total_tokens) },
                { label: "Models", value: String(modelEntries.length) },
              ].map(({ label, value }) => (
                <Card key={label} className="bg-card">
                  <CardContent className="p-3">
                    <div className="text-section-label">{label}</div>
                    <div className="text-lg font-medium tabular-nums mt-1">
                      {value}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="flex items-center justify-end">
              <DateRangePicker value={primaryRange} onChange={setPrimaryRange} />
            </div>

            {analytics && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <CostChart data={analytics.daily} />
                <TokenChart data={analytics.daily} />
              </div>
            )}

            {modelEntries.length > 0 && (
              <Card className="bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-section-title">Model Usage</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {modelEntries.map(([model, stats]) => (
                      <div
                        key={model}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="font-mono text-detail text-foreground/80 truncate">
                          {model}
                        </span>
                        <div className="flex gap-4 text-muted-foreground">
                          <span>
                            {formatTokens(stats.inputTokens + stats.outputTokens)} tok
                          </span>
                          <span className="tabular-nums">
                            {formatCost(stats.cost)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div>
              <div className="text-section-label mb-2">
                Sessions ({sessions.length})
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.slice(0, 20).map((s) => (
                  <SessionCard key={s.id} session={s} />
                ))}
              </div>
              {sessions.length > 20 && (
                <div className="text-detail text-center mt-3">
                  Showing 20 of {sessions.length} sessions
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "knowledge" && (
          <ProjectKnowledge projectId={id} projectPath={project.path} />
        )}
      </PageScaffold>
    </PageContainer>
  );
}
