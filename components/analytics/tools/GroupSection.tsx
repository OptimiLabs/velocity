import { ChevronRight, ChevronDown } from "lucide-react";
import { formatCost } from "@/lib/cost/calculator";
import { ToolRow } from "./ToolRow";
import type { EnrichedTool, Col } from "./ToolRow";

interface GroupSectionProps {
  group: {
    name: string;
    tools: EnrichedTool[];
    totalCalls: number;
    totalCost: number;
  };
  isCollapsed: boolean;
  onToggle: () => void;
  visibleCols: Col[];
}

export function GroupSection({
  group,
  isCollapsed,
  onToggle,
  visibleCols,
}: GroupSectionProps) {
  return (
    <>
      <tr
        className="border-b border-border/50 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        <td colSpan={visibleCols.length} className="py-1.5 px-2">
          <div className="flex items-center gap-2">
            {isCollapsed ? (
              <ChevronRight size={14} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={14} className="text-muted-foreground" />
            )}
            <span className="font-medium text-foreground">{group.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {group.tools.length} tool{group.tools.length !== 1 ? "s" : ""}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground tabular-nums">
              {group.totalCalls.toLocaleString()} calls
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="tabular-nums font-medium">
              {formatCost(group.totalCost)}
            </span>
          </div>
        </td>
      </tr>
      {!isCollapsed &&
        group.tools.map((row) => (
          <ToolRow key={row.name} row={row} visibleCols={visibleCols} />
        ))}
    </>
  );
}
