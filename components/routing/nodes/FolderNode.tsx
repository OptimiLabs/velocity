"use client";

import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoutingStore } from "@/stores/routingStore";

interface FolderNodeData {
  label: string;
  displayPath: string;
  projectRoot: string | null;
  projectColor: string;
  outCount: number;
  inCount: number;
  isCollapsed?: boolean;
  childCount?: number;
  dimmed?: boolean;
}

export const FolderNode = memo(function FolderNode({
  id,
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as FolderNodeData;
  const toggleFolderCollapse = useRoutingStore((s) => s.toggleFolderCollapse);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFolderCollapse(id);
    },
    [id, toggleFolderCollapse],
  );

  const hasChildren = (d.childCount ?? 0) > 0;

  return (
    <div
      className={cn(
        "relative border-2 border-dashed rounded-lg px-3.5 py-2.5 min-w-[210px] max-w-[300px] bg-gradient-to-br from-blue-500/8 via-card to-card shadow-sm transition-all",
        selected ? "ring-2 ring-primary/80 shadow-lg" : "hover:shadow-md",
        d.dimmed && "opacity-30",
      )}
      style={{ borderColor: d.projectColor + "80" }}
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
          Folder
        </span>
        <span className="text-micro tabular-nums text-muted-foreground/70">
          in {d.inCount} out {d.outCount}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        {hasChildren ? (
          <button
            onClick={handleToggle}
            className="shrink-0 p-0.5 -ml-1 rounded hover:bg-muted-foreground/10 transition-colors"
          >
            {d.isCollapsed ? (
              <ChevronRight size={14} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="text-muted-foreground" />
            )}
          </button>
        ) : null}
        <FolderOpen
          size={14}
          style={{ color: d.projectColor }}
          className="shrink-0"
        />
        <span className="text-sm font-medium truncate">{d.label}</span>
      </div>

      <div className="text-meta text-muted-foreground/50 truncate">
        {d.displayPath}
      </div>

      {d.isCollapsed && hasChildren ? (
        <div className="text-meta text-muted-foreground/40 tabular-nums mt-0.5">
          {d.childCount} files hidden
        </div>
      ) : d.outCount > 0 ? (
        <div className="text-meta text-muted-foreground/40 tabular-nums mt-0.5">
          {d.outCount} files
        </div>
      ) : null}

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
