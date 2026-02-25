"use client";

import { memo, useState, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Wrench, BarChart3, Puzzle } from "lucide-react";
import { AgentIcon } from "@/lib/agents/categories";
import { cn } from "@/lib/utils";
import type { WorkflowNodeStatus } from "@/types/workflow";

export interface AgentCanvasNodeData {
  [key: string]: unknown;
  name: string;
  description: string;
  model?: string;
  color?: string;
  icon?: string;
  category?: string;
  toolCount: number;
  usageCount?: number;
  workflowRole?: string;
  workflowStatus?: WorkflowNodeStatus;
  selected: boolean;
  dimmed: boolean;
  // Catalog fields
  enabled?: boolean;
  source?: "custom" | "preset" | "marketplace";
  scope?: "global" | "project" | "workflow";
  skillCount?: number;
  skillNames?: string[];
  // Build mode
  onAttachSkill?: (agentName: string, skillId: string) => void;
}

const statusBorder: Record<WorkflowNodeStatus, string> = {
  unconfirmed: "border-l-amber-400",
  ready: "border-l-emerald-500",
  running: "border-l-blue-500",
  completed: "border-l-emerald-500",
  error: "border-l-red-500",
};

export const AgentCanvasNode = memo(function AgentCanvasNode({
  data,
}: NodeProps) {
  const d = data as unknown as AgentCanvasNodeData;
  const [dragOver, setDragOver] = useState(false);
  const isDisabled = d.enabled === false;
  const sourceLabel =
    d.scope === "workflow"
      ? "Workflow"
      : d.scope === "project"
        ? "Project"
        : d.source === "preset"
          ? "Preset"
          : d.source === "marketplace"
            ? "Marketplace"
            : "Custom";
  const sourceTone =
    d.scope === "workflow"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : d.scope === "project"
        ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
        : d.source === "preset"
          ? "border-violet-500/30 bg-violet-500/10 text-violet-300"
          : d.source === "marketplace"
            ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-300"
            : "border-amber-500/30 bg-amber-500/10 text-amber-300";

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (isDisabled) return;
      if (e.dataTransfer.types.includes("application/skill-id")) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }
    },
    [isDisabled],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const skillId = e.dataTransfer.getData("application/skill-id");
      if (skillId && d.onAttachSkill) {
        d.onAttachSkill(d.name, skillId);
      }
    },
    [d],
  );

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-xl border border-border/70 bg-card/95 px-3 py-2.5 min-w-[200px] max-w-[260px] shadow-[0_10px_24px_-16px_rgba(0,0,0,0.65)]",
        "transition-[box-shadow,opacity,background-color] duration-150 cursor-pointer",
        d.workflowStatus && "border-l-[3px]",
        d.workflowStatus && statusBorder[d.workflowStatus],
        d.selected && "ring-2 ring-primary/55 shadow-[0_0_0_1px_rgba(59,130,246,0.35),0_14px_30px_-16px_rgba(59,130,246,0.4)]",
        d.dimmed && "opacity-40",
        isDisabled && "opacity-40",
        dragOver && "ring-2 ring-emerald-500/55 bg-emerald-500/5",
        !isDisabled && "hover:ring-1 hover:ring-primary/30",
      )}
    >
      {!isDisabled && (
        <span className="pointer-events-none absolute -top-4 left-1/2 -translate-x-1/2 rounded-full border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
          In
        </span>
      )}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "!w-3.5 !h-3.5 !border-2 !shadow-sm",
          isDisabled && "!opacity-0",
          !isDisabled
            ? "!bg-sky-500/80 !border-sky-300/40"
            : "!bg-muted-foreground/50 !border-muted-foreground/20",
        )}
        isConnectable={!isDisabled}
      />

      {/* Source/scope badge */}
      <div className="absolute right-2 top-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
            sourceTone,
          )}
        >
          {sourceLabel}
        </span>
      </div>

      {/* Header: icon + name + model */}
      <div className="flex items-center gap-2 pr-14">
        <AgentIcon agent={{ icon: d.icon, category: d.category }} size={12} className="shrink-0" />
        <span className="font-mono text-xs font-medium truncate flex-1">
          {d.name}
        </span>
        {d.model && (
          <span className="text-meta text-text-tertiary shrink-0">
            {d.model}
          </span>
        )}
      </div>

      {/* Description */}
      {d.description && (
        <p className="text-xs text-muted-foreground truncate mt-1">
          {d.description}
        </p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-2.5 mt-1.5 text-meta text-text-tertiary">
        {d.toolCount > 0 && (
          <span className="flex items-center gap-0.5">
            <Wrench size={8} />
            {d.toolCount}
          </span>
        )}
        {d.skillNames && d.skillNames.length > 0 && (
          <span className="flex items-center gap-0.5 text-chart-4 truncate max-w-[100px]" title={d.skillNames.map((s) => `/${s}`).join(", ")}>
            <Puzzle size={8} className="shrink-0" />
            /{d.skillNames[0]}{d.skillNames.length > 1 && ` +${d.skillNames.length - 1}`}
          </span>
        )}
        {d.usageCount !== undefined && d.usageCount > 0 && (
          <span className="flex items-center gap-0.5">
            <BarChart3 size={8} />
            {d.usageCount}
          </span>
        )}
        {d.workflowRole && (
          <span className="text-primary/60 ml-auto truncate max-w-[80px]">
            {d.workflowRole}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "!w-3.5 !h-3.5 !border-2 !shadow-sm",
          isDisabled && "!opacity-0",
          !isDisabled
            ? "!bg-emerald-500/80 !border-emerald-300/40"
            : "!bg-muted-foreground/50 !border-muted-foreground/20",
        )}
        isConnectable={!isDisabled}
      />
      {!isDisabled && (
        <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
          Out
        </span>
      )}
    </div>
  );
});
