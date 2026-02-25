"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus } from "lucide-react";

export const NewFileNode = memo(function NewFileNode(_props: NodeProps) {
  return (
    <div className="border-2 border-dashed border-border/60 rounded-lg px-3.5 py-3 min-w-[220px] max-w-[280px] bg-muted/20 flex items-center justify-center gap-2 text-muted-foreground/50 cursor-default hover:border-primary/30 hover:text-muted-foreground transition-colors">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-muted-foreground/30 !w-2 !h-2"
      />
      <Plus size={14} />
      <span className="text-xs">Drop file here</span>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-muted-foreground/30 !w-2 !h-2"
      />
    </div>
  );
});
