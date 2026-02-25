"use client";

import { useMemo } from "react";
import {
  useInstructionContext,
  useDataUtilization,
  type AnalyticsFilters,
  type InstructionContextProject,
  type DataUtilizationFile,
} from "@/hooks/useAnalytics";
import { KPICard } from "@/components/layout/KPICard";
import { ContextBudgetBar, type BudgetSegment } from "./ContextBudgetBar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTokens } from "@/lib/cost/calculator";
import {
  FolderOpen,
  BookOpen,
  Brain,
  Sparkles,
  Bot,
  FileCode,
  Layers,
  Crown,
  Hash,
  FileText,
} from "lucide-react";

interface ProjectContextOverviewProps {
  from: string;
  to: string;
  headerLeft?: React.ReactNode;
}

interface ProjectSummary {
  projectPath: string;
  projectName: string;
  instrTokens: number;
  runtimeTokens: number;
  totalTokens: number;
  fileCount: number;
  segments: BudgetSegment[];
}

export function ProjectContextOverview({
  from,
  to,
  headerLeft,
}: ProjectContextOverviewProps) {
  const emptyFilters: AnalyticsFilters = {};
  const { data: instrData, isLoading: instrLoading } = useInstructionContext(
    from,
    to,
    emptyFilters,
  );
  const { data: dataUtilData, isLoading: dataLoading } = useDataUtilization(
    from,
    to,
    emptyFilters,
  );

  const isLoading = instrLoading || dataLoading;

  const projectSummaries = useMemo(() => {
    if (!instrData) return [];

    // Build a map of project -> runtime tokens from data utilization
    const runtimeByProject = new Map<
      string,
      { tokens: number; files: DataUtilizationFile[] }
    >();
    if (dataUtilData) {
      for (const f of dataUtilData.topFiles) {
        const key = f.projectPath ?? "unknown";
        const existing = runtimeByProject.get(key) ?? { tokens: 0, files: [] };
        existing.tokens += f.estimatedTokens;
        existing.files.push(f);
        runtimeByProject.set(key, existing);
      }
    }

    const summaries: ProjectSummary[] = instrData.projectBreakdown.map(
      (project: InstructionContextProject) => {
        const runtime = runtimeByProject.get(project.projectPath);
        const runtimeTokens = runtime?.tokens ?? 0;

        // Classify instruction files
        let instrKnowledgeTokens = 0;
        let instrCoreTokens = 0;
        for (const f of project.files) {
          if (f.fileType === "knowledge.md") {
            instrKnowledgeTokens += f.tokenCount;
          } else {
            instrCoreTokens += f.tokenCount;
          }
        }

        // Classify runtime files
        let skillTokens = 0;
        let agentTokens = 0;
        let codeTokens = 0;
        if (runtime) {
          for (const f of runtime.files) {
            if (f.category === "agent") {
              if (f.path.toLowerCase().includes("skill")) {
                skillTokens += f.estimatedTokens;
              } else {
                agentTokens += f.estimatedTokens;
              }
            } else {
              codeTokens += f.estimatedTokens;
            }
          }
        }

        const segments: BudgetSegment[] = [
          {
            label: "Instructions",
            tokens: instrCoreTokens,
            color: "bg-chart-1",
            icon: BookOpen,
          },
          {
            label: "Knowledge",
            tokens: instrKnowledgeTokens,
            color: "bg-chart-2",
            icon: Brain,
          },
          {
            label: "Skills",
            tokens: skillTokens,
            color: "bg-chart-3",
            icon: Sparkles,
          },
          {
            label: "Agents",
            tokens: agentTokens,
            color: "bg-chart-4",
            icon: Bot,
          },
          {
            label: "Code Reads",
            tokens: codeTokens,
            color: "bg-chart-5",
            icon: FileCode,
          },
        ].filter((s) => s.tokens > 0);

        return {
          projectPath: project.projectPath,
          projectName: project.projectName,
          instrTokens: project.totalInstructionTokens,
          runtimeTokens,
          totalTokens: project.totalInstructionTokens + runtimeTokens,
          fileCount: project.fileCount + (runtime?.files.length ?? 0),
          segments,
        };
      },
    );

    // Sort by total context weight descending
    summaries.sort((a, b) => b.totalTokens - a.totalTokens);
    return summaries;
  }, [instrData, dataUtilData]);

  // KPIs
  const totalProjects = projectSummaries.length;
  const heaviest = projectSummaries[0];
  const avgContext =
    totalProjects > 0
      ? projectSummaries.reduce((s, p) => s + p.totalTokens, 0) / totalProjects
      : 0;
  const totalInstrFiles = instrData?.totals?.totalInstructionFiles ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {headerLeft}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {headerLeft}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Total Projects"
          value={totalProjects}
          icon={FolderOpen}
          color="text-primary"
        />
        <KPICard
          label="Heaviest Project"
          value={heaviest ? formatTokens(heaviest.totalTokens) : "—"}
          icon={Crown}
          color="text-chart-4"
          subtitle={heaviest?.projectName}
        />
        <KPICard
          label="Avg Context/Project"
          value={formatTokens(avgContext)}
          icon={Layers}
          color="text-chart-2"
        />
        <KPICard
          label="Instruction Files"
          value={totalInstrFiles}
          icon={FileText}
          color="text-chart-1"
        />
      </div>

      {/* Project Cards */}
      {projectSummaries.length > 0 ? (
        <div className="space-y-3">
          {projectSummaries.map((project) => (
            <Card key={project.projectPath}>
              <CardContent className="py-3 px-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 font-medium truncate min-w-0">
                    <FolderOpen
                      size={12}
                      className="shrink-0 text-muted-foreground/60"
                    />
                    {project.projectName}
                  </span>
                  <span className="flex items-center gap-3 shrink-0 text-muted-foreground tabular-nums">
                    <span>{formatTokens(project.totalTokens)}</span>
                    <span className="text-muted-foreground/50">
                      {project.fileCount} file
                      {project.fileCount !== 1 ? "s" : ""}
                    </span>
                  </span>
                </div>

                <ContextBudgetBar segments={project.segments} compact />

                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                  <span>Instructions: {formatTokens(project.instrTokens)}</span>
                  <span>Runtime: {formatTokens(project.runtimeTokens)}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Hash size={24} className="mb-3 text-muted-foreground/50" />
              <p>No projects found in this date range.</p>
              <p className="text-xs mt-1">
                Adjust the date range to see project context data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
