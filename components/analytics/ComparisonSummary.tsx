"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/cost/calculator";

interface PeriodTotals {
  total_cost: number;
  total_messages: number;
  total_sessions: number;
  total_tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
}

interface ComparisonSummaryProps {
  periodA: PeriodTotals;
  periodB: PeriodTotals;
  periodALabel: string;
  periodBLabel: string;
}

function pctChange(a: number, b: number): number {
  if (b === 0) return a > 0 ? 100 : 0;
  return ((a - b) / b) * 100;
}

function DeltaCell({ pct, invert }: { pct: number; invert?: boolean }) {
  if (Math.abs(pct) < 0.1) {
    return (
      <span className="text-muted-foreground flex items-center justify-end gap-1">
        <Minus size={10} />
        0.0%
      </span>
    );
  }
  const isUp = pct > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <span
      className={cn(
        "flex items-center justify-end gap-1",
        isGood ? "text-success" : "text-destructive",
      )}
    >
      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isUp ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

export function ComparisonSummary({
  periodA,
  periodB,
  periodALabel,
  periodBLabel,
}: ComparisonSummaryProps) {
  const totalTokensA = periodA.total_input_tokens + periodA.total_output_tokens;
  const totalTokensB = periodB.total_input_tokens + periodB.total_output_tokens;
  const totalInputA =
    periodA.total_input_tokens +
    (periodA.total_cache_read_tokens || 0) +
    (periodA.total_cache_write_tokens || 0);
  const totalInputB =
    periodB.total_input_tokens +
    (periodB.total_cache_read_tokens || 0) +
    (periodB.total_cache_write_tokens || 0);
  const cacheRateA =
    totalInputA > 0
      ? ((periodA.total_cache_read_tokens || 0) / totalInputA) * 100
      : 0;
  const cacheRateB =
    totalInputB > 0
      ? ((periodB.total_cache_read_tokens || 0) / totalInputB) * 100
      : 0;

  const rows = [
    {
      label: "Cost",
      valA: formatCost(periodA.total_cost),
      valB: formatCost(periodB.total_cost),
      pct: pctChange(periodA.total_cost, periodB.total_cost),
      invert: true,
    },
    {
      label: "Sessions",
      valA: periodA.total_sessions.toLocaleString(),
      valB: periodB.total_sessions.toLocaleString(),
      pct: pctChange(periodA.total_sessions, periodB.total_sessions),
    },
    {
      label: "Messages",
      valA: periodA.total_messages.toLocaleString(),
      valB: periodB.total_messages.toLocaleString(),
      pct: pctChange(periodA.total_messages, periodB.total_messages),
    },
    {
      label: "Tokens",
      valA: formatTokens(totalTokensA),
      valB: formatTokens(totalTokensB),
      pct: pctChange(totalTokensA, totalTokensB),
    },
    {
      label: "Cache Rate",
      valA: `${cacheRateA.toFixed(1)}%`,
      valB: `${cacheRateB.toFixed(1)}%`,
      pct: cacheRateA - cacheRateB,
      isAbsolute: true,
    },
  ];

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Period Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="table-readable w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[22%]" />
            <col className="w-[22%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border/30">
              <th className="text-left py-2 pr-3 text-muted-foreground font-medium">
                Metric
              </th>
              <th className="text-right py-2 px-3 text-muted-foreground font-medium truncate">
                {periodALabel}
              </th>
              <th className="text-right py-2 px-3 text-muted-foreground font-medium truncate">
                {periodBLabel}
              </th>
              <th className="text-right py-2 pl-3 text-muted-foreground font-medium">
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ label, valA, valB, pct, invert, isAbsolute }) => (
              <tr key={label} className="border-b border-border/30">
                <td className="py-2 pr-3 text-foreground font-medium">
                  {label}
                </td>
                <td className="text-right py-2 px-3 text-foreground tabular-nums">
                  {valA}
                </td>
                <td className="text-right py-2 px-3 text-muted-foreground tabular-nums">
                  {valB}
                </td>
                <td className="text-right py-2 pl-3 tabular-nums">
                  {isAbsolute ? (
                    <span
                      className={cn(
                        "flex items-center justify-end gap-1",
                        pct > 0.1
                          ? "text-success"
                          : pct < -0.1
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {pct > 0.1 ? (
                        <TrendingUp size={10} />
                      ) : pct < -0.1 ? (
                        <TrendingDown size={10} />
                      ) : (
                        <Minus size={10} />
                      )}
                      {pct > 0 ? "+" : ""}
                      {pct.toFixed(1)}pp
                    </span>
                  ) : (
                    <DeltaCell pct={pct} invert={invert} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
