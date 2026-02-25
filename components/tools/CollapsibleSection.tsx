"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  count?: number;
  defaultExpanded?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  count,
  defaultExpanded = true,
  actions,
  children,
  className,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={cn("border border-border/50 rounded-lg", className)}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        className="flex items-center gap-2.5 px-4 py-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-lg"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-medium">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-micro">
            {count}
          </Badge>
        )}
        <div className="flex-1" />
        {actions && (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {actions}
          </div>
        )}
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}
