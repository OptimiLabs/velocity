"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClaudeMdNodeData {
  label: string;
  displayPath: string;
  projectRoot: string | null;
  projectColor: string;
  exists: boolean;
  outCount: number;
  inCount: number;
  fileSize: number | null;
  dimmed?: boolean;
}

export const ClaudeMdNode = memo(function ClaudeMdNode({
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as ClaudeMdNodeData;

  // Extract project name from path
  const projectName = d.projectRoot
    ? d.projectRoot.split("/").pop()
    : null;

  return (
    <div
      className={cn(
        "relative border-2 rounded-lg px-3.5 py-3 min-w-[220px] max-w-[320px] bg-gradient-to-br from-emerald-500/10 via-card to-card shadow-sm transition-all",
        selected
          ? "ring-2 ring-primary/80 shadow-lg"
          : "hover:shadow-md",
        d.dimmed && "opacity-30",
      )}
      style={{ borderColor: d.projectColor }}
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
          Entrypoint file
        </span>
        <span className="text-micro tabular-nums text-muted-foreground/70">
          in {d.inCount} out {d.outCount}
        </span>
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <FileText size={14} style={{ color: d.projectColor }} />
        <span className="text-sm font-semibold truncate">{d.label}</span>
      </div>

      {projectName && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <GitBranch size={10} className="text-muted-foreground/60" />
          <span
            className="text-meta font-medium truncate"
            style={{ color: d.projectColor }}
          >
            {projectName}
          </span>
        </div>
      )}

      <div className="text-meta text-muted-foreground/60 truncate mb-1">
        {d.displayPath}
      </div>

      <div className="flex items-center gap-3 text-meta text-muted-foreground/50">
        {d.outCount > 0 && (
          <span className="tabular-nums">{d.outCount} refs</span>
        )}
        {d.fileSize !== null && (
          <span className="tabular-nums">
            {d.fileSize > 1024
              ? `${(d.fileSize / 1024).toFixed(1)}KB`
              : `${d.fileSize}B`}
          </span>
        )}
      </div>

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
