import React from "react";
import { cn } from "@/lib/utils";

interface SummaryBoxProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: string;
  mono?: boolean;
}

export function SummaryBox({
  icon: Icon,
  label,
  value,
  color,
  mono,
}: SummaryBoxProps) {
  return (
    <div className="rounded-lg border border-border/50 bg-card px-3 py-2.5 space-y-0.5">
      <div className="flex items-center gap-1.5 text-micro text-muted-foreground uppercase font-medium">
        <Icon size={12} className={color} />
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold truncate",
          mono && "font-mono text-xs",
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
