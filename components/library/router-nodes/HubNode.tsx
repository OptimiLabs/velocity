"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

export const HubNode = memo(function HubNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    subtitle: string;
    totalEntries: number;
    lastSynced?: string;
    connectMode?: boolean;
  };

  return (
    <div className="bg-card border-2 border-primary/40 rounded-xl px-5 py-4 min-w-[200px] shadow-md">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="p-1.5 rounded-lg bg-primary/10">
          <FileText size={18} className="text-primary" />
        </div>
        <div>
          <div className="font-semibold text-sm">{d.label}</div>
          <div className="text-meta text-muted-foreground font-mono">
            {d.subtitle}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-meta text-muted-foreground mt-1.5">
        <span>{d.totalEntries} routing entries</span>
        {d.lastSynced && (
          <span className="text-muted-foreground/50">
            synced{" "}
            {new Date(d.lastSynced).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "!w-3 !h-3 !bg-primary",
          d.connectMode && "animate-pulse",
        )}
      />
    </div>
  );
});
