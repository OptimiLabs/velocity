"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Session } from "@/types/session";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { TablePagination } from "@/components/ui/table-pagination";

interface SessionCostTableProps {
  sessions: Session[];
  total: number;
  page: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  sortBy?: string;
  sortDir?: "ASC" | "DESC";
  onSortChange?: (sortBy: string, sortDir: "ASC" | "DESC") => void;
  modelFilter?: string;
  onModelFilterChange?: (model: string) => void;
  availableModels?: string[];
}

function parseModels(modelUsage: string): string[] {
  try {
    return Object.keys(JSON.parse(modelUsage)).map((m) =>
      m.replace(/^claude-/, "").replace(/-\d{8}$/, ""),
    );
  } catch {
    return [];
  }
}

interface ToolRow {
  name: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCost: number;
}

function parseToolUsage(toolUsage: string): ToolRow[] {
  try {
    const parsed = JSON.parse(toolUsage) as Record<
      string,
      {
        count?: number;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        estimatedCost?: number;
      }
    >;
    return Object.entries(parsed)
      .map(([name, val]) => ({
        name,
        calls: typeof val === "object" ? (val.count ?? 0) : (val as number),
        inputTokens: typeof val === "object" ? (val.inputTokens ?? 0) : 0,
        outputTokens: typeof val === "object" ? (val.outputTokens ?? 0) : 0,
        cacheReadTokens:
          typeof val === "object" ? (val.cacheReadTokens ?? 0) : 0,
        estimatedCost: typeof val === "object" ? (val.estimatedCost ?? 0) : 0,
      }))
      .filter((t) => t.calls > 0)
      .sort((a, b) => b.estimatedCost - a.estimatedCost || b.calls - a.calls);
  } catch {
    return [];
  }
}

function TokenCell({ value }: { value: number }) {
  if (!value) return <span className="text-text-tertiary">—</span>;
  return <span>{formatTokens(value)}</span>;
}

const SORT_COLUMNS = [
  { key: "created_at", label: "Date" },
  { key: "messages", label: "Msgs" },
  { key: "input", label: "Input" },
  { key: "output", label: "Output" },
  { key: "cache_read", label: "Cache R" },
  { key: "cache_write", label: "Cache W" },
  { key: "cost", label: "Cost" },
] as const;

function SortHeader({
  column,
  currentSort,
  currentDir,
  onSort,
  align = "right",
}: {
  column: { key: string; label: string };
  currentSort?: string;
  currentDir?: "ASC" | "DESC";
  onSort?: (key: string, dir: "ASC" | "DESC") => void;
  align?: "left" | "right";
}) {
  const isActive = currentSort === column.key;
  const Icon = isActive
    ? currentDir === "ASC"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th
      className={`py-2 px-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none ${align === "left" ? "text-left" : "text-right"}`}
      onClick={() => {
        if (!onSort) return;
        if (isActive) {
          onSort(column.key, currentDir === "ASC" ? "DESC" : "ASC");
        } else {
          onSort(column.key, "DESC");
        }
      }}
    >
      <span
        className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}
      >
        {column.label}
        <Icon
          size={10}
          className={isActive ? "text-foreground" : "text-muted-foreground/50"}
        />
      </span>
    </th>
  );
}

export function SessionCostTable({
  sessions,
  total,
  page,
  onPageChange,
  pageSize,
  sortBy,
  sortDir,
  onSortChange,
  modelFilter,
  onModelFilterChange,
  availableModels,
}: SessionCostTableProps) {
  const router = useRouter();
  const totalPages = Math.ceil(total / pageSize);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-section-title">Session Costs</CardTitle>
          <div className="flex items-center gap-2">
            {availableModels &&
              availableModels.length > 0 &&
              onModelFilterChange && (
                <select
                  className="h-6 text-micro px-1.5 bg-card border border-border/50 rounded text-foreground"
                  value={modelFilter || ""}
                  onChange={(e) => onModelFilterChange(e.target.value)}
                >
                  <option value="">All models</option>
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/^claude-/, "").replace(/-\d{8}$/, "")}
                    </option>
                  ))}
                </select>
              )}
            <span className="text-xs text-muted-foreground">
              {total.toLocaleString()} sessions
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="table-readable w-full">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="w-6" />
                {SORT_COLUMNS.map((col) => (
                  <SortHeader
                    key={col.key}
                    column={col}
                    currentSort={sortBy}
                    currentDir={sortDir}
                    onSort={onSortChange}
                    align={col.key === "created_at" ? "left" : "right"}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => {
                const models = parseModels(session.model_usage);
                const isExpanded = expandedId === session.id;
                const toolRows = isExpanded
                  ? parseToolUsage(session.tool_usage)
                  : [];
                const prompt = session.first_prompt || "—";
                const truncated =
                  prompt.length > 50 ? prompt.slice(0, 47) + "..." : prompt;

                return (
                  <Fragment key={session.id}>
                    <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pl-1">
                        <button
                          className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedId(isExpanded ? null : session.id);
                          }}
                        >
                          {isExpanded ? (
                            <ChevronUp size={12} />
                          ) : (
                            <ChevronDown size={12} />
                          )}
                        </button>
                      </td>
                      <td
                        className="py-2 px-3 cursor-pointer"
                        onClick={() => router.push(`/sessions/${session.id}`)}
                      >
                        <div className="text-muted-foreground whitespace-nowrap">
                          {format(new Date(session.created_at), "MMM d, HH:mm")}
                        </div>
                        <div
                          className="text-micro text-muted-foreground/70 truncate max-w-[180px]"
                          title={prompt}
                        >
                          {truncated}
                        </div>
                        <div className="flex flex-wrap gap-0.5 mt-0.5">
                          {models.map((m) => (
                            <span
                              key={m}
                              className="inline-block px-1 py-0 rounded bg-muted text-muted-foreground text-micro font-mono"
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground">
                        {session.message_count}
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground">
                        <TokenCell value={session.input_tokens} />
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground">
                        <TokenCell value={session.output_tokens} />
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground">
                        <TokenCell value={session.cache_read_tokens} />
                      </td>
                      <td className="text-right py-2 px-3 text-muted-foreground">
                        <TokenCell value={session.cache_write_tokens} />
                      </td>
                      <td className="text-right py-2 pl-3 font-medium text-foreground">
                        {formatCost(session.total_cost)}
                      </td>
                    </tr>
                    {isExpanded && toolRows.length === 0 && (
                      <tr className="border-b border-border/30">
                        <td
                          colSpan={8}
                          className="px-4 py-3 bg-muted/20 text-micro text-muted-foreground"
                        >
                          No tool usage data for this session
                        </td>
                      </tr>
                    )}
                    {isExpanded && toolRows.length > 0 && (
                      <tr className="border-b border-border/30">
                        <td colSpan={8} className="px-2 py-2 bg-muted/20">
                          <table className="table-readable table-readable-compact w-full">
                            <thead>
                              <tr className="text-muted-foreground/70">
                                <th className="text-left py-1.5 pr-2 font-medium">
                                  Tool
                                </th>
                                <th className="text-right py-1.5 px-2 font-medium">
                                  Calls
                                </th>
                                <th className="text-right py-1.5 px-2 font-medium">
                                  Input
                                </th>
                                <th className="text-right py-1.5 px-2 font-medium">
                                  Output
                                </th>
                                <th className="text-right py-1.5 px-2 font-medium">
                                  Cache R
                                </th>
                                <th className="text-right py-1.5 pl-2 font-medium">
                                  Cost
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {toolRows.map((t) => (
                                <tr
                                  key={t.name}
                                  className="border-t border-border/20"
                                >
                                  <td
                                    className="py-1.5 pr-2 font-mono truncate max-w-[200px]"
                                    title={t.name}
                                  >
                                    {t.name}
                                  </td>
                                  <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                    {t.calls}
                                  </td>
                                  <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                    <TokenCell value={t.inputTokens} />
                                  </td>
                                  <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                    <TokenCell value={t.outputTokens} />
                                  </td>
                                  <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                    <TokenCell value={t.cacheReadTokens} />
                                  </td>
                                  <td className="text-right py-1.5 pl-2 tabular-nums font-medium text-foreground">
                                    {t.estimatedCost > 0 ? (
                                      formatCost(t.estimatedCost)
                                    ) : (
                                      <span className="text-text-tertiary">
                                        —
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {sessions.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center text-muted-foreground"
                  >
                    No sessions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </CardContent>
    </Card>
  );
}
