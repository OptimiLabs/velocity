"use client";

import { useState } from "react";
import {
  useInstructionContext,
  type AnalyticsFilters,
  type InstructionContextProject,
  type InstructionContextProjectFile,
} from "@/hooks/useAnalytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, FolderOpen, ChevronRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTokens } from "@/lib/cost/calculator";

const FILE_TYPE_COLORS: Record<string, string> = {
  "CLAUDE.md": "bg-chart-1",
  "knowledge.md": "bg-chart-2",
  "rules.md": "bg-chart-3",
  custom: "bg-chart-4",
};

function getFileTypeColor(fileType: string): string {
  return FILE_TYPE_COLORS[fileType] ?? "bg-chart-5";
}

const DETECTION_LABELS: Record<string, { label: string; className: string }> = {
  hierarchy: {
    label: "auto",
    className: "bg-chart-1/10 text-chart-1",
  },
  file_read: {
    label: "read",
    className: "bg-chart-2/10 text-chart-2",
  },
  skill: {
    label: "skill",
    className: "bg-chart-3/10 text-chart-3",
  },
  agent: {
    label: "agent",
    className: "bg-chart-4/10 text-chart-4",
  },
};

interface InstructionContextCardProps {
  from: string;
  to: string;
  filters: AnalyticsFilters;
}

export function InstructionContextCard({
  from,
  to,
  filters,
}: InstructionContextCardProps) {
  const { data, isLoading } = useInstructionContext(from, to, filters);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(projectPath: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectPath)) next.delete(projectPath);
      else next.add(projectPath);
      return next;
    });
  }

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (!data) return null;

  if (data.totals.totalInstructionFiles === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <BookOpen size={14} />
            Instruction Context
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
            <BookOpen size={24} className="mb-3 text-muted-foreground/50" />
            <p>No instruction files indexed yet.</p>
            <p className="text-xs mt-1">
              Visit the Instructions page to set up CLAUDE.md files.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const usedTokens =
    data.totals.usedInstructionTokens ??
    data.instructionFiles
      .filter((f) => f.sessionCount > 0)
      .reduce((s, f) => s + f.tokenCount, 0);
  const filesWithSessions = data.instructionFiles.filter(
    (f) => f.sessionCount > 0,
  ).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BookOpen size={14} />
          Instruction Context
        </CardTitle>
        <p className="text-xs text-muted-foreground -mt-1">
          Instruction files linked to sessions in the selected date range
        </p>
      </CardHeader>
      <CardContent>
        {/* Summary row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1.5">
            <FileText size={11} />
            {filesWithSessions}/{data.totals.totalInstructionFiles} file
            {data.totals.totalInstructionFiles !== 1 ? "s" : ""} linked
            {" · "}
            {formatTokens(usedTokens)} linked footprint
          </span>
          <span>
            Avg ~{formatTokens(data.totals.avgTokensPerSession)} per session
          </span>
        </div>

        {/* Per-project rows */}
        {data.projectBreakdown.length > 0 ? (
          <div className="space-y-1">
            {data.projectBreakdown.map((project) => (
              <ProjectRow
                key={project.projectPath}
                project={project}
                isExpanded={expanded.has(project.projectPath)}
                onToggle={() => toggle(project.projectPath)}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground py-4 text-center">
            No project sessions in this period.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectRow({
  project,
  isExpanded,
  onToggle,
}: {
  project: InstructionContextProject;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const maxTokens = Math.max(project.totalInstructionTokens, 1);
  const globalPct = (project.globalTokens / maxTokens) * 100;
  const projectPct = (project.projectTokens / maxTokens) * 100;

  const globalFiles = project.files
    .filter((f) => f.isGlobal)
    .sort(
      (a, b) => b.sessionCount - a.sessionCount || b.tokenCount - a.tokenCount,
    );
  const projectFiles = project.files
    .filter((f) => !f.isGlobal)
    .sort(
      (a, b) => b.sessionCount - a.sessionCount || b.tokenCount - a.tokenCount,
    );

  return (
    <div className="rounded-md border border-border/50">
      <button
        type="button"
        onClick={onToggle}
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
          <FolderOpen size={11} className="shrink-0 text-muted-foreground/60" />
          <span className="truncate font-medium">{project.projectName}</span>
          <span className="ml-auto flex items-center gap-3 shrink-0 text-muted-foreground tabular-nums">
            <span>{formatTokens(project.totalInstructionTokens)}</span>
            <span className="text-muted-foreground/50">
              {project.fileCount} file{project.fileCount !== 1 ? "s" : ""}
            </span>
          </span>
        </div>

        {/* Stacked token bar */}
        <div className="mt-1.5 ml-[22px] mr-0 flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden flex">
            {globalPct > 0 && (
              <div
                className="h-full bg-chart-1/70 transition-all"
                style={{ width: `${globalPct}%` }}
              />
            )}
            {projectPct > 0 && (
              <div
                className="h-full bg-chart-4/70 transition-all"
                style={{ width: `${projectPct}%` }}
              />
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 shrink-0">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-chart-1/70" />
              global
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-chart-4/70" />
              project
            </span>
          </div>
        </div>
      </button>

      {/* Expanded file list */}
      {isExpanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-0.5">
          {globalFiles.length > 0 && (
            <>
              <div className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1 ml-[22px]">
                Global
              </div>
              {globalFiles.map((file) => (
                <FileRow key={file.shortPath} file={file} />
              ))}
            </>
          )}
          {projectFiles.length > 0 && (
            <>
              <div
                className={cn(
                  "text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-1 ml-[22px]",
                  globalFiles.length > 0 && "mt-2",
                )}
              >
                Project-specific
              </div>
              {projectFiles.map((file) => (
                <FileRow key={file.shortPath} file={file} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({ file }: { file: InstructionContextProjectFile }) {
  const detection = file.detectionMethod
    ? DETECTION_LABELS[file.detectionMethod]
    : null;

  return (
    <div
      className={cn(
        "flex items-baseline justify-between text-xs gap-2 ml-[22px]",
        file.sessionCount === 0 && "opacity-40",
      )}
    >
      <span className="flex items-baseline gap-2 truncate min-w-0">
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0 relative top-[1px]",
            getFileTypeColor(file.fileType),
          )}
        />
        <span className="font-mono text-meta truncate">{file.shortPath}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-muted-foreground tabular-nums text-meta">
          {file.sessionCount > 0
            ? `${file.sessionCount} session${file.sessionCount !== 1 ? "s" : ""}`
            : "unused"}
        </span>
        <span className="text-muted-foreground/50 tabular-nums text-meta">
          {formatTokens(file.tokenCount)}
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
}
