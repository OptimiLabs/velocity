"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Session } from "@/types/session";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import {
  computeCostBreakdown,
  computeCacheEfficiency,
  computeToolCostEstimates,
  computeCostPerMessage,
  generateOptimizationHints,
} from "@/lib/cost/analysis";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function PercentBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 w-12 bg-muted rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full", color)}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function statusColor(
  value: number,
  good: number,
  warn: number,
  invert = false,
): string {
  if (invert) {
    if (value > warn) return "text-destructive";
    if (value > good) return "text-yellow-500";
    return "text-success";
  }
  if (value > good) return "text-success";
  if (value > warn) return "text-yellow-500";
  return "text-destructive";
}

const severityDotColor = {
  tip: "bg-success",
  warning: "bg-yellow-500",
  info: "bg-blue-400",
};

export function CostAnalysisPanel({
  session,
  cacheWriteUnavailable = false,
}: {
  session: Session;
  cacheWriteUnavailable?: boolean;
}) {
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const breakdown = computeCostBreakdown(session);
  const { hitRate, savingsEstimate } = computeCacheEfficiency(session);
  const toolEstimates = computeToolCostEstimates(session);
  const costPerMsg = computeCostPerMessage(session);
  const hints = generateOptimizationHints(session);
  const outputRatio =
    session.input_tokens > 0 ? session.output_tokens / session.input_tokens : 0;

  const totalTokens =
    session.input_tokens +
    session.output_tokens +
    session.cache_read_tokens +
    session.cache_write_tokens;

  const hasMeaningfulCost =
    breakdown.total >= 0.0001 || session.total_cost >= 0.0001;
  const hasTokens = totalTokens > 0;

  const segments = hasMeaningfulCost
    ? [
        { label: "Input", cost: breakdown.inputCost, color: "bg-chart-1" },
        { label: "Output", cost: breakdown.outputCost, color: "bg-chart-4" },
        {
          label: "Cache Read",
          cost: breakdown.cacheReadCost,
          color: "bg-chart-2",
        },
        {
          label: "Cache Write",
          cost: breakdown.cacheWriteCost,
          color: "bg-chart-5",
        },
      ].filter((s) => s.cost > 0)
    : [];

  return (
    <div className="space-y-3">
      {/* Total cost + tokens summary */}
      <div className="flex items-baseline justify-between rounded-lg border border-border/40 bg-background/45 px-2.5 py-2">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCost(session.total_cost)}
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground flex items-center gap-1">
          {formatTokens(totalTokens)} tokens
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info size={11} className="text-muted-foreground/40 cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[240px] text-xs leading-relaxed">
                Totals are from the complete session log. Per-message tokens may
                differ — only assistant turns include usage data, and older
                messages may not be loaded.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
      </div>

      {/* Cost Breakdown Bar — only when there's meaningful cost */}
      {hasMeaningfulCost && (
        <div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
            {segments.map((seg) => (
              <div
                key={seg.label}
                className={cn("h-full", seg.color)}
                style={{ width: `${(seg.cost / breakdown.total) * 100}%` }}
                title={`${seg.label}: ${formatCost(seg.cost)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-2">
            {segments.map((seg) => (
              <Badge
                key={seg.label}
                variant="outline"
                className="h-5 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground"
              >
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full",
                    seg.color,
                  )}
                />
                {seg.label} {formatCost(seg.cost)}
              </Badge>
            ))}
          </div>
          {savingsEstimate > 0.001 && (
            <div className="text-xs text-success mt-1">
              Cache saved ~{formatCost(savingsEstimate)}
            </div>
          )}
        </div>
      )}

      {/* Token breakdown */}
      {hasTokens && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
          {session.input_tokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Input</span>
              <span className="tabular-nums">
                {formatTokens(session.input_tokens)}
              </span>
            </div>
          )}
          {session.output_tokens > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Output</span>
              <span className="tabular-nums">
                {formatTokens(session.output_tokens)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cache Read</span>
            <span className="tabular-nums">
              {formatTokens(session.cache_read_tokens)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cache Write</span>
            <span className="tabular-nums">
              {cacheWriteUnavailable
                ? "N/A"
                : formatTokens(session.cache_write_tokens)}
            </span>
          </div>
        </div>
      )}

      {/* Efficiency Metrics — show whenever we have tokens or cost */}
      {(hasMeaningfulCost || hasTokens) && (
        <div className="space-y-1 text-[11px]">
          {hasTokens && (
            <div
              className="flex justify-between"
              title="Fraction of input tokens served from prompt cache (summed across all turns)"
            >
              <span className="text-muted-foreground">Cache Hit</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  statusColor(hitRate * 100, 60, 20),
                )}
              >
                {(hitRate * 100).toFixed(1)}%
              </span>
            </div>
          )}
          {hasMeaningfulCost && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">$/msg</span>
              <span className="tabular-nums">{formatCost(costPerMsg)}</span>
            </div>
          )}
          {hasTokens && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Out/In</span>
              <span className="tabular-nums">{outputRatio.toFixed(1)}x</span>
            </div>
          )}
        </div>
      )}

      {/* Per-Tool Cost Table */}
      {toolEstimates.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setToolsExpanded((v) => !v)}
            className="w-full justify-start px-2 text-muted-foreground hover:text-foreground"
          >
            {toolsExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
            <span>Tool Costs ({toolEstimates.length})</span>
          </Button>
          {toolsExpanded && (
            <div className="mt-1.5 space-y-1">
              {toolEstimates.slice(0, 8).map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-2 rounded-lg border border-border/35 bg-background/55 px-2 py-1.5 text-xs"
                >
                  <span className="font-mono text-foreground/75 truncate flex-1">
                    {t.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {t.count}×
                  </span>
                  <PercentBar value={t.pctOfTotal} color="bg-primary" />
                  <span className="tabular-nums text-foreground/80 shrink-0 w-12 text-right">
                    {formatCost(t.estimatedCost)}
                  </span>
                </div>
              ))}
              {toolEstimates.length > 8 && (
                <div className="text-xs text-muted-foreground">
                  +{toolEstimates.length - 8} more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Optimization Hints */}
      {hints.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-border/35 bg-background/45 p-2">
          {hints.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "mt-0.5 w-1.5 h-1.5 rounded-full shrink-0",
                  severityDotColor[h.severity],
                )}
              />
              <div>
                <span className="font-medium text-foreground/80">
                  {h.title}
                </span>
                <span className="text-muted-foreground ml-1">{h.detail}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
