"use client";

import { useState, useMemo, type ReactNode } from "react";
import {
  useContextPreview,
  type ContextPreviewFile,
} from "@/hooks/useAnalytics";
import { KPICard } from "@/components/layout/KPICard";
import { ContextBudgetBar, type BudgetSegment } from "./ContextBudgetBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTokens } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";
import {
  Layers,
  Globe,
  FolderOpen,
  BookOpen,
  Brain,
  Sparkles,
  Bot,
  ChevronRight,
  FileText,
  Hash,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SystemPromptPreviewProps {
  projectId: string;
  headerLeft?: ReactNode;
}

const SECTION_CONFIG: Record<string, { icon: LucideIcon; color: string }> = {
  "CLAUDE.md": { icon: BookOpen, color: "bg-chart-1" },
  "knowledge.md": { icon: Brain, color: "bg-chart-2" },
  skill: { icon: Sparkles, color: "bg-chart-3" },
  agent: { icon: Bot, color: "bg-chart-4" },
};

const DEFAULT_CONFIG = { icon: FileText, color: "bg-chart-5" };

export function SystemPromptPreview({
  projectId,
  headerLeft,
}: SystemPromptPreviewProps) {
  const { data, isLoading } = useContextPreview(projectId);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  function toggleSection(type: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function toggleFile(id: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const segments: BudgetSegment[] = useMemo(() => {
    if (!data) return [];
    return data.sections.map((s) => {
      const cfg = SECTION_CONFIG[s.type] ?? DEFAULT_CONFIG;
      return {
        label: s.label,
        tokens: s.totalTokens,
        color: cfg.color,
        icon: cfg.icon,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {headerLeft}
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-16" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const totals = data?.totals ?? {
    totalFiles: 0,
    totalTokens: 0,
    globalTokens: 0,
    projectTokens: 0,
  };

  return (
    <div className="space-y-6">
      {headerLeft}

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3">
        <KPICard
          label="System Prompt"
          value={formatTokens(totals.totalTokens)}
          icon={Layers}
          color="text-primary"
          subtitle={`${totals.totalFiles} files`}
        />
        <KPICard
          label="Global Context"
          value={formatTokens(totals.globalTokens)}
          icon={Globe}
          color="text-chart-1"
        />
        <KPICard
          label="Project Context"
          value={formatTokens(totals.projectTokens)}
          icon={FolderOpen}
          color="text-chart-2"
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

      {/* File Sections */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText size={14} />
            Instruction Files
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {data?.sections.map((section) => {
            const cfg = SECTION_CONFIG[section.type] ?? DEFAULT_CONFIG;
            const SectionIcon = cfg.icon;
            const isSectionExpanded = expandedSections.has(section.type);

            return (
              <div
                key={section.type}
                className="rounded-md border border-border/50"
              >
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => toggleSection(section.type)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <ChevronRight
                      size={12}
                      className={cn(
                        "shrink-0 text-muted-foreground transition-transform",
                        isSectionExpanded && "rotate-90",
                      )}
                    />
                    <SectionIcon
                      size={11}
                      className="shrink-0 text-muted-foreground/60"
                    />
                    <span className="font-medium">{section.label}</span>
                    <span className="ml-auto flex items-center gap-3 shrink-0 text-muted-foreground tabular-nums">
                      <span>{formatTokens(section.totalTokens)}</span>
                      <span className="text-muted-foreground/50">
                        {section.files.length} file
                        {section.files.length !== 1 ? "s" : ""}
                      </span>
                    </span>
                  </div>
                </button>

                {/* File rows */}
                {isSectionExpanded && (
                  <div className="border-t border-border/50">
                    {section.files.map((file) => (
                      <FileRow
                        key={file.id}
                        file={file}
                        color={cfg.color}
                        isExpanded={expandedFiles.has(file.id)}
                        onToggle={() => toggleFile(file.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {(!data || data.sections.length === 0) && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
              <Hash size={24} className="mb-3 text-muted-foreground/50" />
              <p>No instruction files found for this project.</p>
              <p className="text-xs mt-1">
                Select a different project to preview its system prompt.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FileRow({
  file,
  color,
  isExpanded,
  onToggle,
}: {
  file: ContextPreviewFile;
  color: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border/30 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-3 py-1.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-baseline justify-between text-xs gap-2 ml-[22px]">
          <span className="flex items-baseline gap-2 truncate min-w-0">
            <ChevronRight
              size={10}
              className={cn(
                "shrink-0 relative top-[1px] text-muted-foreground/50 transition-transform",
                isExpanded && "rotate-90",
              )}
            />
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full shrink-0 relative top-[1px]",
                color,
              )}
            />
            <span className="font-mono text-meta truncate">
              {file.shortPath}
            </span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "text-[10px] px-1 py-0.5 rounded",
                file.isGlobal
                  ? "bg-chart-1/10 text-chart-1"
                  : "bg-chart-2/10 text-chart-2",
              )}
            >
              {file.isGlobal ? "global" : "project"}
            </span>
            <span className="text-muted-foreground/50 tabular-nums text-meta">
              {formatTokens(file.tokenCount)}
            </span>
          </span>
        </div>
      </button>

      {isExpanded && file.content && (
        <div className="mx-3 mb-2 ml-[46px]">
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground bg-muted/30 rounded-md p-3 max-h-80 overflow-y-auto border border-border/30">
            {file.content}
          </pre>
        </div>
      )}
    </div>
  );
}
