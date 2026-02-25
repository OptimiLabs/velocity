"use client";

import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { GitBranch, Layers, Link } from "lucide-react";
import type { Workflow } from "@/types/workflow";

interface WorkflowInventoryItemProps {
  workflow: Workflow;
  selected: boolean;
  onSelect: () => void;
  onRename?: (id: string, name: string) => void;
}

export function WorkflowInventoryItem({
  workflow,
  selected,
  onSelect,
  onRename,
}: WorkflowInventoryItemProps) {
  const nameRef = useRef<HTMLSpanElement>(null);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!onRename || !nameRef.current) return;

      const el = nameRef.current;
      // Remove truncation while editing
      el.classList.remove("truncate");
      el.contentEditable = "plaintext-only";
      el.focus();

      // Select all text
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    },
    [onRename],
  );

  const handleBlur = useCallback(() => {
    const el = nameRef.current;
    if (!el) return;
    el.contentEditable = "false";
    el.classList.add("truncate");

    const trimmed = (el.textContent ?? "").trim();
    if (trimmed && trimmed !== workflow.name) {
      onRename?.(workflow.id, trimmed);
    } else {
      el.textContent = workflow.name;
    }
  }, [onRename, workflow.id, workflow.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        nameRef.current?.blur();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        const el = nameRef.current;
        if (el) {
          el.textContent = workflow.name;
          el.contentEditable = "false";
          el.classList.add("truncate");
        }
      }
    },
    [workflow.name],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (nameRef.current?.contentEditable === "plaintext-only") return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors group",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        selected && "bg-primary/10 text-primary",
      )}
    >
      <GitBranch
        size={12}
        className={cn(
          "shrink-0",
          selected ? "text-primary" : "text-muted-foreground/50",
        )}
      />
      <span
        ref={nameRef}
        className={cn(
          "text-xs truncate flex-1 outline-none",
          onRename && "cursor-text",
        )}
        onDoubleClick={handleDoubleClick}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={(e) => {
          if (nameRef.current?.contentEditable === "plaintext-only")
            e.stopPropagation();
        }}
        suppressContentEditableWarning
        title={onRename ? "Double-click to rename" : workflow.name}
      >
        {workflow.name}
      </span>
      <span className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-meta text-text-tertiary flex items-center gap-0.5 min-w-[20px] justify-end"
          title={`${workflow.nodes.length} step${workflow.nodes.length === 1 ? "" : "s"}`}
        >
          <Layers size={8} />
          {workflow.nodes.length}
        </span>
        <span
          className="text-meta text-chart-4/50 flex items-center gap-0.5 min-w-[20px] justify-end"
          title={`${workflow.edges.length} connection${workflow.edges.length === 1 ? "" : "s"}`}
        >
          <Link size={8} />
          {workflow.edges.length}
        </span>
      </span>
    </div>
  );
}
