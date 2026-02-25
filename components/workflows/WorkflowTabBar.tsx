"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, MoreHorizontal, Copy, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workflow } from "@/types/workflow";

interface WorkflowTabBarProps {
  workflows: Workflow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  isCreating?: boolean;
}

export function WorkflowTabBar({
  workflows,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  isCreating,
}: WorkflowTabBarProps) {
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click-outside or Escape
  useEffect(() => {
    if (!menuId) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuId]);

  if (workflows.length === 0 && !activeId) return null;

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-card/50 overflow-x-auto scrollbar-none">
      {workflows.map((wf) => {
        const isActive = wf.id === activeId;
        return (
          <div
            key={wf.id}
            className="relative flex items-center shrink-0 group"
          >
            <button
              onClick={() => onSelect(wf.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-t-md transition-colors max-w-[180px]",
                isActive
                  ? "text-foreground border-b-2 border-primary bg-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <span className="truncate">{wf.name}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuId(menuId === wf.id ? null : wf.id);
              }}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-foreground transition-all"
            >
              <MoreHorizontal size={12} />
            </button>
            {menuId === wf.id && (
              <div
                ref={menuRef}
                className="absolute top-full left-0 z-50 mt-1 min-w-[140px] rounded-md border border-border bg-popover shadow-md py-1"
              >
                <button
                  onClick={() => {
                    onDuplicate(wf.id);
                    setMenuId(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <Copy size={12} />
                  Duplicate
                </button>
                <button
                  onClick={() => {
                    onDelete(wf.id);
                    setMenuId(null);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-muted transition-colors"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={onCreate}
        disabled={isCreating}
        className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
        title="New workflow"
      >
        {isCreating ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Plus size={14} />
        )}
      </button>
    </div>
  );
}
