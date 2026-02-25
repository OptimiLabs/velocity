import { formatCost, formatTokens } from "@/lib/cost/calculator";
import type { EnrichedTool, Col } from "./ToolRow";

interface TotalsFooterProps {
  tools: EnrichedTool[];
  visibleCols: Col[];
}

export function TotalsFooter({ tools, visibleCols }: TotalsFooterProps) {
  if (tools.length === 0) return null;

  const totals = tools.reduce(
    (acc, t) => ({
      totalCalls: acc.totalCalls + t.totalCalls,
      inputTokens: acc.inputTokens + t.inputTokens,
      outputTokens: acc.outputTokens + t.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + t.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + t.cacheWriteTokens,
      estimatedCost: acc.estimatedCost + t.estimatedCost,
      sessionCount: acc.sessionCount + t.sessionCount,
    }),
    {
      totalCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      estimatedCost: 0,
      sessionCount: 0,
    },
  );

  const avgCost =
    totals.totalCalls > 0 ? totals.estimatedCost / totals.totalCalls : 0;
  const totalTokens =
    totals.inputTokens +
    totals.outputTokens +
    totals.cacheReadTokens +
    totals.cacheWriteTokens;
  const cacheRate =
    totalTokens > 0 ? (totals.cacheReadTokens / totalTokens) * 100 : 0;

  const valMap: Record<string, string> = {
    name: `Total (${tools.length})`,
    category: "",
    group: "",
    totalCalls: totals.totalCalls.toLocaleString(),
    inputTokens: formatTokens(totals.inputTokens),
    outputTokens: formatTokens(totals.outputTokens),
    cacheReadTokens: formatTokens(totals.cacheReadTokens),
    cacheWriteTokens: formatTokens(totals.cacheWriteTokens),
    cacheRate: `${cacheRate.toFixed(0)}%`,
    avgCost: formatCost(avgCost),
    estimatedCost: formatCost(totals.estimatedCost),
    sessionCount: totals.sessionCount.toLocaleString(),
  };

  return (
    <tfoot>
      <tr className="border-t border-border/50 font-medium text-xs">
        {visibleCols.map((col) => (
          <td
            key={col.key}
            className={`py-2 px-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
          >
            {valMap[col.key] ?? ""}
          </td>
        ))}
      </tr>
    </tfoot>
  );
}
