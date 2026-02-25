"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, AlertCircle, Zap, Bot, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { estimateTokensFromBytes } from "@/lib/marketplace/token-estimate";
import { formatTokens } from "@/lib/cost/calculator";

interface ReferencedFileNodeData {
  label: string;
  displayPath: string;
  nodeType: "skill" | "agent" | "knowledge";
  projectRoot: string | null;
  projectColor: string;
  exists: boolean;
  outCount: number;
  inCount: number;
  fileSize: number | null;
  dimmed?: boolean;
}

const typeConfig = {
  skill: {
    icon: Zap,
    color: "text-amber-500",
    tint: "bg-gradient-to-br from-amber-500/10 via-card to-card border-amber-500/40",
  },
  agent: {
    icon: Bot,
    color: "text-violet-500",
    tint: "bg-gradient-to-br from-violet-500/10 via-card to-card border-violet-500/40",
  },
  knowledge: {
    icon: FileText,
    color: "text-muted-foreground",
    tint: "bg-gradient-to-br from-zinc-500/8 via-card to-card border-zinc-500/30",
  },
};

const typeLabel: Record<ReferencedFileNodeData["nodeType"], string> = {
  skill: "Skill",
  agent: "Agent",
  knowledge: "Knowledge",
};

function formatFileBytes(bytes: number): string {
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

export const ReferencedFileNode = memo(function ReferencedFileNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as ReferencedFileNodeData;
  const config = typeConfig[d.nodeType] || typeConfig.knowledge;
  const Icon = config.icon;

  const projectName = d.projectRoot
    ? d.projectRoot.split("/").pop()
    : null;

  return (
    <div
      className={cn(
        "relative border rounded-lg px-3 py-2.5 min-w-[210px] max-w-[300px] shadow-sm transition-all",
        config.tint,
        selected
          ? "ring-2 ring-primary/80 shadow-lg border-primary/40"
          : "hover:shadow-md hover:border-border",
        !d.exists && "opacity-60 border-dashed",
        d.dimmed && "opacity-30",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        title="Incoming links"
        className="!bg-sky-500 !w-3 !h-3 !border-2 !border-background !shadow-[0_0_0_1px_rgba(14,165,233,0.35)]"
      />
      <span className="pointer-events-none absolute -left-7 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wide text-sky-500/85">
        In
      </span>

      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="rounded-md border border-border/60 bg-background/70 px-1.5 py-0.5 text-micro uppercase tracking-wide text-muted-foreground">
          {typeLabel[d.nodeType]}
        </span>
        <span className="text-micro tabular-nums text-muted-foreground/70">
          in {d.inCount} out {d.outCount}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <div className="relative">
          <Icon size={12} className={config.color} />
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full",
              d.exists ? "bg-green-500" : "bg-red-500",
            )}
          />
        </div>
        <span className="text-xs font-medium truncate">{d.label}</span>
        {!d.exists && (
          <AlertCircle size={10} className="text-destructive shrink-0" />
        )}
      </div>

      {projectName && (
        <div className="flex items-center gap-1.5 mb-1">
          <GitBranch size={9} className="text-muted-foreground/50" />
          <span
            className="text-meta font-medium truncate"
            style={{ color: d.projectColor }}
          >
            {projectName}
          </span>
        </div>
      )}

      <div className="text-meta text-muted-foreground/50 truncate">
        {d.displayPath}
      </div>

      {d.fileSize !== null && (
        <div className="text-meta text-muted-foreground/40 tabular-nums mt-0.5">
          {formatFileBytes(d.fileSize)} · ~
          {formatTokens(estimateTokensFromBytes(d.fileSize))} tok
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        title="Outgoing links"
        className="!bg-emerald-500 !w-3 !h-3 !border-2 !border-background !shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
      />
      <span className="pointer-events-none absolute -right-9 top-1/2 -translate-y-1/2 text-[9px] font-semibold uppercase tracking-wide text-emerald-500/85">
        Out
      </span>
    </div>
  );
});
