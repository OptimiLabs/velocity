"use client";

import { useMemo } from "react";
import { AlertTriangle, FileText, Coins } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstructionFile } from "@/types/instructions";

interface KnowledgeStatsProps {
  files: InstructionFile[];
}

export function KnowledgeStats({ files }: KnowledgeStatsProps) {
  const stats = useMemo(() => {
    const byCategory: Record<string, { count: number; tokens: number }> = {};
    let totalTokens = 0;
    const oversized: InstructionFile[] = [];

    for (const f of files) {
      totalTokens += f.tokenCount;
      const cat = f.category ?? "uncategorized";
      if (!byCategory[cat]) {
        byCategory[cat] = { count: 0, tokens: 0 };
      }
      byCategory[cat].count++;
      byCategory[cat].tokens += f.tokenCount;

      if (f.tokenCount > 1000) {
        oversized.push(f);
      }
    }

    const sorted = [...files].sort((a, b) => b.tokenCount - a.tokenCount);
    const maxTokens = Math.max(
      ...Object.values(byCategory).map((c) => c.tokens),
      1,
    );

    return { byCategory, totalTokens, oversized, sorted, maxTokens };
  }, [files]);

  const categoryOrder = [
    "frontend",
    "backend",
    "frameworks",
    "workflows",
    "tools",
  ];
  const categoryColors: Record<string, string> = {
    frontend: "bg-blue-500",
    backend: "bg-green-500",
    frameworks: "bg-purple-500",
    workflows: "bg-orange-500",
    tools: "bg-pink-500",
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <FileText size={14} />
            <span className="text-xs">Knowledge Files</span>
          </div>
          <span className="text-lg font-medium tabular-nums">
            {files.length}
          </span>
        </div>
        <div className="p-3 rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Coins size={14} />
            <span className="text-xs">Total LLM Tokens (est.)</span>
          </div>
          <span className="text-lg font-medium tabular-nums">
            {stats.totalTokens.toLocaleString()}
          </span>
        </div>
        <div className="p-3 rounded-lg border border-border/50 bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <AlertTriangle size={14} />
            <span className="text-xs">Over 1000-Token Limit</span>
          </div>
          <span
            className={cn(
              "text-lg font-medium tabular-nums",
              stats.oversized.length > 0
                ? "text-yellow-500 dark:text-yellow-400"
                : "text-muted-foreground",
            )}
          >
            {stats.oversized.length}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-lg border border-border/50 bg-card">
        <h3 className="text-sm font-medium mb-1">
          LLM Token Usage by Category
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Estimated tokens each category adds to Claude&apos;s context when
          loaded
        </p>
        <div className="space-y-2">
          {categoryOrder.map((cat) => {
            const data = stats.byCategory[cat];
            if (!data) return null;
            const pct = (data.tokens / stats.maxTokens) * 100;
            return (
              <div key={cat} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24 shrink-0 capitalize">
                  {cat}
                </span>
                <div className="flex-1 h-5 bg-muted/50 rounded overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded transition-all",
                      categoryColors[cat] || "bg-primary",
                    )}
                    style={{ width: `${pct}%`, opacity: 0.7 }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground w-20 text-right">
                  {data.tokens.toLocaleString()} tok
                </span>
                <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                  {data.count} files
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-4 rounded-lg border border-border/50 bg-card">
        <h3 className="text-sm font-medium mb-3">
          Largest Knowledge Files by Token Count
        </h3>
        <div className="space-y-1">
          {stats.sorted.slice(0, 10).map((file) => (
            <div key={file.id} className="flex items-center gap-2 text-xs py-1">
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  categoryColors[file.category ?? ""] || "bg-muted",
                )}
              />
              <span className="flex-1 truncate text-muted-foreground">
                {file.title ?? file.fileName}
              </span>
              <span
                className={cn(
                  "tabular-nums shrink-0",
                  file.tokenCount > 1000
                    ? "text-yellow-500 dark:text-yellow-400"
                    : "text-muted-foreground",
                )}
              >
                {file.tokenCount} tok
              </span>
            </div>
          ))}
        </div>
      </div>

      {stats.oversized.length > 0 && (
        <div className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 dark:bg-yellow-900/20">
          <h3 className="text-sm font-medium text-yellow-500 dark:text-yellow-400 flex items-center gap-1.5 mb-2">
            <AlertTriangle size={14} />
            Files Exceeding 1000-Token Per-File Limit
          </h3>
          <div className="space-y-1">
            {stats.oversized.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-muted-foreground">
                  {file.category}/{file.slug}.md
                </span>
                <span className="text-yellow-500 dark:text-yellow-400 tabular-nums">
                  {file.tokenCount} tok
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
