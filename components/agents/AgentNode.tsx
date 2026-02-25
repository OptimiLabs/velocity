"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

interface AgentNodeData {
  label: string;
  taskCount: number;
  completedCount: number;
  sessionId: string;
  firstTask: string;
}

export const AgentNode = memo(function AgentNode({ data }: NodeProps) {
  const d = data as unknown as AgentNodeData;
  const progress = d.taskCount > 0 ? (d.completedCount / d.taskCount) * 100 : 0;

  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 min-w-[160px] shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-chart-2" />

      <div className="font-mono text-meta text-muted-foreground mb-1">
        {d.label}
      </div>

      <div className="text-xs truncate max-w-[180px] mb-2" title={d.firstTask}>
        {d.firstTask || "No tasks"}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-chart-2 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-meta tabular-nums text-muted-foreground">
          {d.completedCount}/{d.taskCount}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-chart-2"
      />
    </div>
  );
});
