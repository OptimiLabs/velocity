"use client";

import { useMemo } from "react";
import {
  useModelUsage,
  type AnalyticsFilters,
  type ModelUsageRow,
} from "@/hooks/useAnalytics";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { MODEL_PRICING, DEFAULT_PRICING } from "@/lib/cost/pricing";
import { sortRows, type SortState } from "@/lib/table-sort";
import { GenericTable, type Col } from "./GenericTable";
import { Loading, RowCount } from "./Helpers";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function getPricing(modelId: string) {
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  const key = Object.keys(MODEL_PRICING).find((k) => modelId.startsWith(k));
  return key ? MODEL_PRICING[key] : DEFAULT_PRICING;
}

function fmtRate(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(0)}`;
}

// ─── Model columns ──────────────────────────────────────────────────────────

export const MODEL_COLS: Col<ModelUsageRow>[] = [
  {
    key: "model",
    label: "Model",
    value: (r) => r.model,
    render: (r) => {
      const p = getPricing(r.model);
      return (
        <div title={r.model}>
          <div className="font-mono text-foreground">
            {formatModelName(r.model)}
          </div>
          <div className="text-meta mt-0.5">
            {fmtRate(p.input)} &rarr; {fmtRate(p.output)} &middot; cr{" "}
            {fmtRate(p.cacheRead)} / cw {fmtRate(p.cacheWrite)}
          </div>
        </div>
      );
    },
  },
  {
    key: "inputTokens",
    label: "Input Tokens",
    align: "right",
    value: (r) => r.inputTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.inputTokens)}
      </span>
    ),
  },
  {
    key: "outputTokens",
    label: "Output Tokens",
    align: "right",
    value: (r) => r.outputTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.outputTokens)}
      </span>
    ),
  },
  {
    key: "cacheReadTokens",
    label: "Cache Read",
    align: "right",
    value: (r) => r.cacheReadTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.cacheReadTokens)}
      </span>
    ),
  },
  {
    key: "cacheWriteTokens",
    label: "Cache Write",
    align: "right",
    defaultVisible: false,
    value: (r) => r.cacheWriteTokens,
    render: (r) => (
      <span className="text-muted-foreground">
        {formatTokens(r.cacheWriteTokens)}
      </span>
    ),
  },
  {
    key: "messageCount",
    label: "Messages",
    align: "right",
    value: (r) => r.messageCount,
    render: (r) => (
      <span className="text-muted-foreground">
        {r.messageCount.toLocaleString()}
      </span>
    ),
  },
  {
    key: "sessionCount",
    label: "Sessions",
    align: "right",
    value: (r) => r.sessionCount,
    render: (r) => (
      <span className="text-muted-foreground">
        {r.sessionCount.toLocaleString()}
      </span>
    ),
  },
  {
    key: "cost",
    label: "Cost",
    align: "right",
    value: (r) => r.cost,
    render: (r) => (
      <span className="font-medium text-foreground">{formatCost(r.cost)}</span>
    ),
  },
];

// ─── Sort helper ─────────────────────────────────────────────────────────────

function sortWithCols<T>(rows: T[], sort: SortState, cols: Col<T>[]): T[] {
  if (!sort) return rows;
  const col = cols.find((c) => c.key === sort.column);
  if (!col) return rows;
  return sortRows(rows, sort, (row) => col.value(row));
}

// ─── Panel props ─────────────────────────────────────────────────────────────

export interface PanelProps {
  from: string;
  to: string;
  filters: AnalyticsFilters;
  sort: SortState;
  onSort: (s: SortState) => void;
  vis: Set<string>;
}

// ─── ModelsPanel ─────────────────────────────────────────────────────────────

export function ModelsPanel({
  from,
  to,
  filters,
  sort,
  onSort,
  vis,
}: PanelProps) {
  const { data, isLoading } = useModelUsage(from, to, filters);

  const rows = useMemo(
    () => sortWithCols(data?.models ?? [], sort, MODEL_COLS),
    [data?.models, sort],
  );

  if (isLoading) return <Loading />;

  const totals = rows.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + r.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + r.cacheWriteTokens,
      messageCount: acc.messageCount + r.messageCount,
      sessionCount: acc.sessionCount + r.sessionCount,
      cost: acc.cost + r.cost,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      messageCount: 0,
      sessionCount: 0,
      cost: 0,
    },
  );

  const visibleCols = MODEL_COLS.filter((c) => vis.has(c.key));

  return (
    <div className="space-y-2">
      <RowCount count={rows.length} noun="model" />
      <GenericTable
        columns={MODEL_COLS}
        rows={rows}
        vis={vis}
        sort={sort}
        onSort={onSort}
        rowKey={(r) => r.model}
        emptyMessage="No model data for this date range"
        footer={
          rows.length > 0 ? (
            <tr className="border-t border-border/50 font-medium text-xs">
              {visibleCols.map((col) => (
                <td
                  key={col.key}
                  className={`py-2 px-2 tabular-nums ${col.align === "right" ? "text-right" : ""}`}
                >
                  {col.key === "model"
                    ? `Total (${rows.length})`
                    : col.key === "inputTokens"
                      ? formatTokens(totals.inputTokens)
                      : col.key === "outputTokens"
                        ? formatTokens(totals.outputTokens)
                        : col.key === "cacheReadTokens"
                          ? formatTokens(totals.cacheReadTokens)
                          : col.key === "cacheWriteTokens"
                            ? formatTokens(totals.cacheWriteTokens)
                            : col.key === "messageCount"
                              ? totals.messageCount.toLocaleString()
                              : col.key === "sessionCount"
                                ? totals.sessionCount.toLocaleString()
                                : col.key === "cost"
                                  ? formatCost(totals.cost)
                                  : ""}
                </td>
              ))}
            </tr>
          ) : undefined
        }
      />
    </div>
  );
}
