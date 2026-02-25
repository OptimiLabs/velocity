import type { ToolUsageRow } from "@/hooks/useAnalytics";

interface EnrichedTool extends ToolUsageRow {
  avgCost: number;
  cacheRate: number;
}

interface Col {
  key: string;
  label: string;
  defaultVisible?: boolean;
  align?: "left" | "right";
  value: (row: EnrichedTool) => number | string;
  render?: (row: EnrichedTool) => React.ReactNode;
}

interface ToolRowProps {
  row: EnrichedTool;
  visibleCols: Col[];
}

export function ToolRow({ row, visibleCols }: ToolRowProps) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/30 transition-colors">
      {visibleCols.map((col) => (
        <td
          key={col.key}
          className={`py-1.5 px-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
        >
          {col.render ? col.render(row) : String(col.value(row))}
        </td>
      ))}
    </tr>
  );
}

export type { EnrichedTool, Col };
