"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import {
  LayoutGrid,
  Network,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspaceStore";

interface WorkspaceToolbarProps {
  view: string;
  onViewChange: (v: "canvas" | "list") => void;
  onCreateAgent: () => void;
}

export function WorkspaceToolbar({
  view,
  onViewChange,
  onCreateAgent,
}: WorkspaceToolbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const searchQuery = useWorkspaceStore((s) => s.searchQuery);
  const setSearchQuery = useWorkspaceStore((s) => s.setSearchQuery);

  return (
    <div className="px-4 py-2 border-b border-border/50 bg-card/50 flex items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <SearchField
          ref={searchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search inventory..."
          inputSize="sm"
          className="pr-12"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-micro text-text-quaternary bg-muted/50 px-1 py-0.5 rounded font-mono">
          ⌘K
        </kbd>
      </div>

      {/* View toggle */}
      <div className="flex items-center bg-muted/50 rounded-md p-0.5">
        <button
          onClick={() => onViewChange("canvas")}
          className={cn(
            "p-1 rounded transition-colors",
            view === "canvas"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          title="Canvas view"
        >
          <Network size={14} />
        </button>
        <button
          onClick={() => onViewChange("list")}
          className={cn(
            "p-1 rounded transition-colors",
            view === "list"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          title="List view"
        >
          <LayoutGrid size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1.5 ml-auto">
        <Button size="sm" className="text-xs gap-1" onClick={onCreateAgent}>
          <Plus size={11} />
          New Agent
        </Button>
      </div>
    </div>
  );
}
