"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Network, Globe, FolderGit2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EntrypointNodeData {
  label: string;
  nodeType: string;
  projectRoot: string | null;
  projectColor: string;
  outCount: number;
  inCount: number;
  dimmed?: boolean;
}

const scopeConfig = {
  root: {
    icon: Network,
    bg: "bg-gradient-to-br from-indigo-500/15 via-card to-card",
    border: "border-indigo-500/40",
  },
  global: {
    icon: Globe,
    bg: "bg-gradient-to-br from-zinc-500/10 via-card to-card",
    border: "border-zinc-500/40",
  },
  project: {
    icon: FolderGit2,
    bg: "bg-gradient-to-br from-blue-500/15 via-card to-card",
    border: "border-blue-500/40",
  },
} as const;

function getScope(id: string): "root" | "global" | "project" {
  if (id === "entrypoint::root") return "root";
  if (id === "entrypoint::global") return "global";
  return "project";
}

export const EntrypointNode = memo(function EntrypointNode({
  id,
  data,
  selected,
}: NodeProps) {
  const d = data as unknown as EntrypointNodeData;
  const scope = getScope(id);
  const config = scopeConfig[scope];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "relative border rounded-xl px-3.5 py-2 min-w-[170px] max-w-[240px] shadow-sm transition-all",
        config.bg,
        config.border,
        selected ? "ring-2 ring-primary/80 shadow-lg" : "hover:shadow-md",
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
          Entrypoint
        </span>
        <span className="text-micro tabular-nums text-muted-foreground/70">
          in {d.inCount} out {d.outCount}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Icon
          size={15}
          style={{ color: scope === "project" ? d.projectColor : "#2563eb" }}
          className="shrink-0"
        />
        <span className="text-sm font-medium truncate">{d.label}</span>
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
