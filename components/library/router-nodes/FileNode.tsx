"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  found: "bg-success",
  missing: "bg-destructive",
  orphaned: "bg-warning",
};

const CATEGORY_COLORS: Record<string, string> = {
  frontend: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  backend: "bg-green-500/15 text-green-400 border-green-500/30",
  frameworks: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  workflows: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  tools: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  skills: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export { CATEGORY_COLORS };

export const FileNode = memo(function FileNode({ data, selected }: NodeProps) {
  const d = data as {
    label: string;
    trigger: string;
    status: string;
    path: string;
    tokenCount: number;
    category?: string;
    isActive?: boolean;
  };

  const isActive = d.isActive !== false;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg px-3.5 py-2.5 min-w-[220px] max-w-[280px] shadow-sm cursor-pointer transition-all",
        "hover:border-primary/40 hover:shadow-md",
        selected && "ring-2 ring-primary border-primary/50",
        !isActive && "opacity-40",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground !w-2 !h-2"
      />

      <div className="flex items-center gap-1.5 mb-1">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[d.status] || "bg-gray-500 dark:bg-gray-400"}`}
        />
        <span className="text-xs font-medium truncate flex-1">{d.label}</span>
        {!isActive && (
          <EyeOff size={10} className="text-muted-foreground shrink-0" />
        )}
      </div>
      <div className="text-meta text-muted-foreground truncate">
        {d.trigger}
      </div>
      {d.tokenCount > 0 && (
        <div className="mt-1">
          <span className="text-meta tabular-nums text-text-quaternary">
            ~{d.tokenCount.toLocaleString()} tok
          </span>
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground !w-2 !h-2"
      />
    </div>
  );
});
