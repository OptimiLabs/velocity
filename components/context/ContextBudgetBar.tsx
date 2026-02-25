"use client";

import type { LucideIcon } from "lucide-react";
import { formatTokens } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface BudgetSegment {
  label: string;
  tokens: number;
  color: string;
  icon: LucideIcon;
}

interface ContextBudgetBarProps {
  segments: BudgetSegment[];
  maxTokens?: number;
  compact?: boolean;
}

export function ContextBudgetBar({
  segments,
  maxTokens = 200_000,
  compact = false,
}: ContextBudgetBarProps) {
  const totalTokens = segments.reduce((s, seg) => s + seg.tokens, 0);
  const usagePct = Math.min((totalTokens / maxTokens) * 100, 100);
  const nonEmpty = segments.filter((s) => s.tokens > 0);

  return (
    <div className={cn("w-full", compact ? "space-y-1" : "space-y-3")}>
      {/* Bar */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex-1 rounded-full bg-muted overflow-hidden flex",
            compact ? "h-2.5" : "h-4",
          )}
        >
          <TooltipProvider delayDuration={100}>
            {nonEmpty.map((seg, i) => {
              const pct = (seg.tokens / maxTokens) * 100;
              return (
                <Tooltip key={seg.label}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "h-full transition-all",
                        seg.color,
                        i === 0 && "rounded-l-full",
                        i === nonEmpty.length - 1 && "rounded-r-full",
                      )}
                      style={{ width: `${Math.max(pct, 0.5)}%` }}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="font-medium">{seg.label}</span>
                    {" — "}
                    {formatTokens(seg.tokens)} ({pct.toFixed(1)}%)
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {usagePct.toFixed(0)}% of {formatTokens(maxTokens)}
        </span>
      </div>

      {/* Legend — only in non-compact mode */}
      {!compact && nonEmpty.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {nonEmpty.map((seg) => {
            const pct = (seg.tokens / totalTokens) * 100;
            return (
              <span
                key={seg.label}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <seg.icon size={11} className="shrink-0" />
                <span
                  className={cn("w-2 h-2 rounded-full shrink-0", seg.color)}
                />
                <span>{seg.label}</span>
                <span className="tabular-nums">{formatTokens(seg.tokens)}</span>
                <span className="text-muted-foreground/50 tabular-nums">
                  {pct.toFixed(0)}%
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
