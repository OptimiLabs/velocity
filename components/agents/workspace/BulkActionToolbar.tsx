"use client";

import { Button } from "@/components/ui/button";
import { PanelLeftClose, Trash2, X } from "lucide-react";

interface BulkActionToolbarProps {
  count: number;
  hasPresetSelected: boolean;
  onRemoveFromCanvas: () => void;
  onDeleteAgents: () => void;
  onClear: () => void;
}

export function BulkActionToolbar({
  count,
  hasPresetSelected,
  onRemoveFromCanvas,
  onDeleteAgents,
  onClear,
}: BulkActionToolbarProps) {
  if (count < 2) return null;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-card/95 backdrop-blur border border-border shadow-lg rounded-xl px-4 py-2 flex items-center gap-3">
      <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
        {count} selected
      </span>

      <div className="w-px h-4 bg-border/50" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-muted-foreground"
        onClick={onRemoveFromCanvas}
      >
        <PanelLeftClose size={10} />
        Remove from Canvas
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
        onClick={onDeleteAgents}
        disabled={hasPresetSelected}
        title={hasPresetSelected ? "Cannot delete preset agents" : undefined}
      >
        <Trash2 size={10} />
        Delete Agents
      </Button>

      <div className="w-px h-4 bg-border/50" />

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        onClick={onClear}
      >
        <X size={12} />
      </Button>
    </div>
  );
}
