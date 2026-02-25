"use client";

import { cn } from "@/lib/utils";
import { FileText, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PromptInventoryItemProps {
  filename: string;
  category?: string;
  selected: boolean;
  onSelect: () => void;
}

export function PromptInventoryItem({
  filename,
  category,
  selected,
  onSelect,
}: PromptInventoryItemProps) {
  const displayName = filename.replace(/\.md$/, "").replace(/-/g, " ");

  return (
    <button
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/skill-id", filename);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors group",
        "hover:bg-muted/50",
        selected && "bg-primary/10 text-primary",
      )}
    >
      <GripVertical
        size={10}
        className="shrink-0 text-muted-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
      />
      <FileText size={12} className="shrink-0 text-muted-foreground/50" />
      <span className="text-xs truncate flex-1 capitalize">{displayName}</span>
      {category && (
        <Badge variant="secondary" className="text-micro shrink-0">
          {category}
        </Badge>
      )}
    </button>
  );
}
