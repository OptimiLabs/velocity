"use client";

import { Plus, Trash2, Play, GitMerge, GitBranch, Clock, Copy } from "lucide-react";
import type { Workflow } from "@/types/workflow";
import { useRouter } from "next/navigation";

interface WorkflowListProps {
  workflows: Workflow[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

export function WorkflowList({
  workflows,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
}: WorkflowListProps) {
  const router = useRouter();
  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-4">
          <GitMerge size={24} className="text-muted-foreground/60" />
        </div>
        <h3 className="text-sm font-medium mb-1">No workflows yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-xs">
          Create a workflow to orchestrate multi-agent tasks with a visual DAG
          builder.
        </p>
        <button
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          New Workflow
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {workflows.map((wf) => {
          const readyCount = wf.nodes.filter(
            (n) => n.status === "ready" || n.status === "completed",
          ).length;
          const completionPct =
            wf.nodes.length > 0 ? Math.round((readyCount / wf.nodes.length) * 100) : 0;
          return (
            <div
              key={wf.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(wf.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(wf.id);
                }
              }}
              className="text-left p-4 rounded-xl border border-border/50 bg-card/90 hover:border-border hover:bg-card transition-all group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 shadow-sm"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 mr-2 min-w-0">
                  <GitBranch size={12} className="text-chart-4 shrink-0" />
                  <h3 className="font-mono text-xs font-medium truncate">
                    {wf.name}
                  </h3>
                </div>
              </div>
              {wf.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
                  {wf.description}
                </p>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-meta text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Play size={10} />
                    {wf.nodes.length} step{wf.nodes.length !== 1 ? "s" : ""}
                  </span>
                  <span className="tabular-nums">
                    {readyCount}/{wf.nodes.length} ready
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/?workflow=${encodeURIComponent(wf.id)}`);
                    }}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-emerald-500/80 hover:text-emerald-500 transition-all"
                    title="Run workflow"
                  >
                    <Play size={12} />
                  </button>
                  {onDuplicate && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(wf.id);
                      }}
                      className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-muted-foreground/60 hover:text-foreground transition-all"
                      title="Duplicate workflow"
                    >
                      <Copy size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(wf.id);
                    }}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1 rounded text-muted-foreground/60 hover:text-red-500 transition-all"
                    title="Delete workflow"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <div className="h-1.5 rounded-full bg-muted/70 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-[width]"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-micro uppercase tracking-wider text-muted-foreground/50">
                  <span>
                    {wf.nodes.length === 0
                      ? "Empty"
                      : readyCount === wf.nodes.length
                        ? "Ready"
                        : "In progress"}
                  </span>
                  <span className="tabular-nums">{completionPct}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-2 text-meta text-muted-foreground/50">
                <Clock size={10} />
                <time
                  suppressHydrationWarning
                  dateTime={wf.updatedAt}
                >
                  {new Date(wf.updatedAt).toLocaleDateString()}
                </time>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
