"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Code,
  Server,
  BookOpen,
  Workflow,
  Wrench,
  Zap,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, typeof Code> = {
  frontend: Code,
  backend: Server,
  frameworks: BookOpen,
  workflows: Workflow,
  tools: Wrench,
  skills: Zap,
};

export const CategoryNode = memo(function CategoryNode({
  data,
  selected,
}: NodeProps) {
  const d = data as {
    label: string;
    fileCount: number;
    totalTokens: number;
    color: string;
    connectedCount?: number;
  };
  const Icon = CATEGORY_ICONS[d.label] || FolderOpen;
  const connected = d.connectedCount ?? d.fileCount;
  const pct = d.fileCount > 0 ? (connected / d.fileCount) * 100 : 0;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg px-4 py-3 min-w-[180px] shadow-sm transition-all",
        selected && "ring-2 ring-primary",
      )}
      style={{ borderLeftColor: d.color, borderLeftWidth: 3 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !w-2 !h-2"
      />

      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} style={{ color: d.color }} />
        <span className="text-sm font-medium capitalize">{d.label}</span>
      </div>
      <div className="text-meta text-muted-foreground mb-2">
        {d.fileCount} files &middot;{" "}
        {d.totalTokens > 0 ? `~${d.totalTokens.toLocaleString()} tok` : "—"}
      </div>

      {/* Progress bar: connected / total */}
      <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: d.color, opacity: 0.7 }}
        />
      </div>
      <div className="text-meta text-muted-foreground/60 mt-1">
        {connected}/{d.fileCount} connected
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2"
        style={{ background: d.color }}
      />
    </div>
  );
});
