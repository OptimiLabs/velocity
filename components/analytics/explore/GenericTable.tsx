"use client";

import { SortableHeader } from "@/components/analytics/ExploreTableLayout";
import type { SortState } from "@/lib/table-sort";

/** Generic column config — render is the cell renderer. */
export interface Col<T> {
  key: string;
  label: string;
  defaultVisible?: boolean;
  align?: "left" | "right";
  sortable?: boolean;
  /** Return the sortable/comparable value for this column */
  value: (row: T) => number | string;
  /** Render the cell content. Falls back to value() if omitted. */
  render?: (row: T) => React.ReactNode;
}

export function GenericTable<T>({
  columns,
  rows,
  vis,
  sort,
  onSort,
  rowKey,
  footer,
  emptyMessage = "No data",
}: {
  columns: Col<T>[];
  rows: T[];
  vis: Set<string>;
  sort: SortState;
  onSort: (s: SortState) => void;
  rowKey: (row: T) => string;
  footer?: React.ReactNode;
  emptyMessage?: string;
}) {
  const visibleCols = columns.filter((c) => vis.has(c.key));

  return (
    <table className="table-readable w-full text-xs">
      <thead>
        <tr className="border-b border-border/50">
          {visibleCols.map((col) =>
            col.sortable !== false ? (
              <SortableHeader
                key={col.key}
                column={col.key}
                label={col.label}
                sort={sort}
                onSort={onSort}
                className={col.align === "right" ? "text-right" : "text-left"}
              />
            ) : (
              <th
                key={col.key}
                className={`py-2 px-2 font-medium text-muted-foreground whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}
              >
                {col.label}
              </th>
            ),
          )}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={visibleCols.length}
              className="text-center py-8 text-muted-foreground"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border/60 hover:bg-muted/30 transition-colors group"
            >
              {visibleCols.map((col) => (
                <td
                  key={col.key}
                  className={`py-1.5 px-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.render ? col.render(row) : String(col.value(row))}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {footer && <tfoot>{footer}</tfoot>}
    </table>
  );
}
