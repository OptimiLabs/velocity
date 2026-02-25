"use client";

import { useState, useMemo } from "react";
import {
  useInstructionContext,
  useDataUtilization,
  useAnalytics,
  type AnalyticsFilters,
  type InstructionContextFile,
  type DataUtilizationFile,
} from "@/hooks/useAnalytics";
import { KPICard } from "@/components/layout/KPICard";
import { ContextBudgetBar, type BudgetSegment } from "./ContextBudgetBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTokens } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  FileCode,
  Brain,
  Sparkles,
  Bot,
  ChevronRight,
  Hash,
  FileText,
  DatabaseZap,
  Layers,
} from "lucide-react";

interface ProjectContextDetailProps {
  from: string;
  to: string;
  projectId: string;
  headerLeft?: React.ReactNode;
}

interface UnifiedFile {
  path: string;
  shortPath: string;
  tokens: number;
  sessionCount: number;
  category: string;
  detectionMethod: string | null;
}

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: typeof BookOpen; color: string }
> = {
  instructions: { label: "Instructions", icon: BookOpen, color: "bg-chart-1" },
  knowledge: { label: "Knowledge", icon: Brain, color: "bg-chart-2" },
  skills: { label: "Skills", icon: Sparkles, color: "bg-chart-3" },
  agents: { label: "Agents", icon: Bot, color: "bg-chart-4" },
  code: { label: "Code Reads", icon: FileCode, color: "bg-chart-5" },
};

function classifyFile(
  file: InstructionContextFile | DataUtilizationFile,
  source: "instruction" | "data",
): string {
  if (source === "instruction") {
    const f = file as InstructionContextFile;
    if (f.fileType === "CLAUDE.md") return "instructions";
    if (f.fileType === "knowledge.md") return "knowledge";
    return "instructions";
  }
  const d = file as DataUtilizationFile;
  if (d.category === "agent") {
    return d.path.toLowerCase().includes("skill") ? "skills" : "agents";
  }
  return "code";
}

const DETECTION_LABELS: Record<string, { label: string; className: string }> = {
  hierarchy: { label: "auto", className: "bg-chart-1/10 text-chart-1" },
  file_read: { label: "read", className: "bg-chart-2/10 text-chart-2" },
  skill: { label: "skill", className: "bg-chart-3/10 text-chart-3" },
  agent: { label: "agent", className: "bg-chart-4/10 text-chart-4" },
};

export function ProjectContextDetail({
  from,
  to,
  projectId,
  headerLeft,
}: ProjectContextDetailProps) {
  const filters: AnalyticsFilters = { projectId };

  const { data: instrData, isLoading: instrLoading } = useInstructionContext(
    from,
    to,
    filters,
  );
  const { data: dataUtilData, isLoading: dataLoading } = useDataUtilization(
    from,
    to,
    filters,
  );
  const { data: analyticsData, isLoading: analyticsLoading } = useAnalytics(
    from,
    to,
    filters,
  );

  const isLoading = instrLoading || dataLoading || analyticsLoading;

  // Combine instruction + data-utilization files into a unified list
  const { unifiedFiles, segments } = useMemo(() => {
    const fileMap = new Map<string, UnifiedFile>();

    // Add instruction files
    if (instrData) {
      for (const f of instrData.instructionFiles) {
        const cat = classifyFile(f, "instruction");
        fileMap.set(f.filePath, {
          path: f.filePath,
          shortPath: f.shortPath,
          tokens: f.tokenCount,
          sessionCount: f.sessionCount,
          category: cat,
          detectionMethod: f.detectionMethod,
        });
      }
    }

    // Add data utilization files (deduped by path)
    if (dataUtilData) {
      for (const f of dataUtilData.topFiles) {
        if (!fileMap.has(f.path)) {
          const cat = classifyFile(f, "data");
          fileMap.set(f.path, {
            path: f.path,
            shortPath: f.shortPath,
            tokens: f.estimatedTokens,
            sessionCount: f.sessionCount,
            category: cat,
            detectionMethod: null,
          });
        }
      }
    }

    const files = Array.from(fileMap.values());

    // Build segments for budget bar
    const catTotals: Record<string, number> = {};
    for (const f of files) {
      catTotals[f.category] = (catTotals[f.category] ?? 0) + f.tokens;
    }

    const segs: BudgetSegment[] = Object.entries(CATEGORY_CONFIG)
      .filter(([key]) => (catTotals[key] ?? 0) > 0)
      .map(([key, cfg]) => ({
        label: cfg.label,
        tokens: catTotals[key],
        color: cfg.color,
        icon: cfg.icon,
      }));

    return { unifiedFiles: files, segments: segs };
  }, [instrData, dataUtilData]);

  // KPIs
  const totalContextTokens = segments.reduce((s, seg) => s + seg.tokens, 0);
  const instrTokens = instrData
    ? instrData.instructionFiles.reduce((s, f) => s + f.tokenCount, 0)
    : 0;
  const runtimeTokens = dataUtilData?.totals?.totalReadTokens ?? 0;

  const totals = analyticsData?.totals;
  const totalInput = totals
    ? totals.total_input_tokens +
      (totals.total_cache_read_tokens ?? 0) +
      (totals.total_cache_write_tokens ?? 0)
    : 0;
  const cacheHitRate =
    totalInput > 0 && totals
      ? ((totals.total_cache_read_tokens ?? 0) / totalInput) * 100
      : 0;

  // File grouping
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const filesByCategory = useMemo(() => {
    const grouped: Record<string, UnifiedFile[]> = {};
    for (const f of unifiedFiles) {
      (grouped[f.category] ??= []).push(f);
    }
    // Sort files within each category by tokens desc
    for (const files of Object.values(grouped)) {
      files.sort((a, b) => b.tokens - a.tokens);
    }
    return grouped;
  }, [unifiedFiles]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {headerLeft}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {headerLeft}

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPICard
          label="Total Context"
          value={formatTokens(totalContextTokens)}
          icon={Layers}
          color="text-primary"
        />
        <KPICard
          label="Instruction Tokens"
          value={formatTokens(instrTokens)}
          icon={BookOpen}
          color="text-chart-1"
        />
        <KPICard
          label="Runtime Reads"
          value={formatTokens(runtimeTokens)}
          icon={FileCode}
          color="text-chart-5"
        />
        <KPICard
          label="Cache Hit Rate"
          value={`${cacheHitRate.toFixed(1)}%`}
          icon={DatabaseZap}
          color="text-chart-3"
        />
      </div>

      {/* Budget Bar */}
      {segments.length > 0 && (
        <Card>
          <CardContent className="py-4 px-5">
            <ContextBudgetBar segments={segments} />
          </CardContent>
        </Card>
      )}

      {/* File Breakdown */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText size={14} />
            File Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {Object.entries(CATEGORY_CONFIG).map(([catKey, cfg]) => {
            const files = filesByCategory[catKey];
            if (!files || files.length === 0) return null;
            const catTokens = files.reduce((s, f) => s + f.tokens, 0);
            const isExpanded = expanded.has(catKey);

            return (
              <div key={catKey} className="rounded-md border border-border/50">
                <button
                  type="button"
                  onClick={() => toggle(catKey)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <ChevronRight
                      size={12}
                      className={cn(
                        "shrink-0 text-muted-foreground transition-transform",
                        isExpanded && "rotate-90",
                      )}
                    />
                    <cfg.icon
                      size={11}
                      className="shrink-0 text-muted-foreground/60"
                    />
                    <span className="font-medium">{cfg.label}</span>
                    <span className="ml-auto flex items-center gap-3 shrink-0 text-muted-foreground tabular-nums">
                      <span>{formatTokens(catTokens)}</span>
                      <span className="text-muted-foreground/50">
                        {files.length} file{files.length !== 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/50 px-3 py-2 space-y-0.5">
                    {files.map((file) => {
                      const detection = file.detectionMethod
                        ? DETECTION_LABELS[file.detectionMethod]
                        : null;

                      return (
                        <div
                          key={file.path}
                          className="flex items-baseline justify-between text-xs gap-2 ml-[22px]"
                        >
                          <span className="flex items-baseline gap-2 truncate min-w-0">
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full shrink-0 relative top-[1px]",
                                cfg.color,
                              )}
                            />
                            <span className="font-mono text-meta truncate">
                              {file.shortPath}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-muted-foreground tabular-nums text-meta">
                              {file.sessionCount > 0
                                ? `${file.sessionCount} session${file.sessionCount !== 1 ? "s" : ""}`
                                : "unused"}
                            </span>
                            <span className="text-muted-foreground/50 tabular-nums text-meta">
                              {formatTokens(file.tokens)}
                            </span>
                            {detection && (
                              <span
                                className={cn(
                                  "text-[10px] px-1 py-0.5 rounded",
                                  detection.className,
                                )}
                              >
                                {detection.label}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {unifiedFiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
              <Hash size={24} className="mb-3 text-muted-foreground/50" />
              <p>No context files found for this project.</p>
              <p className="text-xs mt-1">
                Select a different project or adjust the date range.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
