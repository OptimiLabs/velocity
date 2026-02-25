"use client";

import { useState } from "react";
import { SortableHeader } from "@/components/analytics/ExploreTableLayout";
import type { SortState } from "@/lib/table-sort";
import { GroupSection } from "./GroupSection";
import type { EnrichedTool, Col } from "./ToolRow";

interface GroupedTableProps {
  groups: {
    name: string;
    tools: EnrichedTool[];
    totalCalls: number;
    totalCost: number;
  }[];
  columns: Col[];
  visibleCols: Col[];
  sort: SortState;
  onSort: (s: SortState) => void;
}

export function GroupedTable({
  groups,
  columns: _columns,
  visibleCols,
  sort,
  onSort,
}: GroupedTableProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (name: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <table className="table-readable w-full text-xs">
      <thead>
        <tr className="border-b border-border/50">
          {visibleCols.map((col) => (
            <SortableHeader
              key={col.key}
              column={col.key}
              label={col.label}
              sort={sort}
              onSort={onSort}
              className={col.align === "right" ? "text-right" : "text-left"}
            />
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.name);
          return (
            <GroupSection
              key={group.name}
              group={group}
              isCollapsed={isCollapsed}
              onToggle={() => toggle(group.name)}
              visibleCols={visibleCols}
            />
          );
        })}
      </tbody>
    </table>
  );
}
