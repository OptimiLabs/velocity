"use client";

import { useState, useMemo, Fragment, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useSessions,
  useSessionSummary,
  useTaskSessions,
  useCompressSessionsBulk,
  useRestoreSessionsBulk,
  useDeleteSessionsBulk,
  useSessionStorage,
  useCompressSession,
  useRestoreSession,
  useDeleteSession,
} from "@/hooks/useSessions";
import { useFilterOptions, useProjects } from "@/hooks/useAnalytics";
import { useDebounce } from "@/hooks/useDebounce";
import { SessionCard } from "@/components/sessions/SessionCard";
import {
  SessionFilters,
  type ViewMode,
} from "@/components/sessions/SessionFilters";
import { TaskGroup } from "@/components/sessions/TaskGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Hash,
  DollarSign,
  TrendingUp,
  MessageSquare,
  Archive,
  RotateCcw,
  Trash2,
  Sparkles,
  X,
} from "lucide-react";
import { TablePagination } from "@/components/ui/table-pagination";
import { format, formatDistanceToNow } from "date-fns";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import Link from "next/link";
import type { Session } from "@/types/session";
import { CompareDialog } from "@/components/sessions/CompareDialog";
import { useConfirm } from "@/hooks/useConfirm";

const PAGE_SIZE = 24;

interface SessionSummaryMetrics {
  totalSessions: number;
  totalCost: number;
  avgCost: number;
  totalMessages: number;
}

interface SessionsTabProps {
  onSummaryMetricsChange?: (metrics: SessionSummaryMetrics | null) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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

function formatEffortMode(mode: string | null | undefined): string {
  if (!mode) return "";
  const normalized = mode.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "xhigh") return "XHigh";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

const SORT_COLUMNS = [
  { key: "modified_at", label: "Session", align: "left" as const },
  { key: "messages", label: "Messages", align: "right" as const },
  { key: "cost", label: "Cost", align: "right" as const },
  { key: "input", label: "Input", align: "right" as const },
  { key: "output", label: "Output", align: "right" as const },
  { key: "cache_read", label: "Cache Read", align: "right" as const },
  { key: "cache_write", label: "Cache Write", align: "right" as const },
] as const;

const VALID_SORT_KEYS = new Set<string>([
  ...SORT_COLUMNS.map((column) => column.key),
  "created_at",
  "tokens",
]);

function normalizeSortBy(value: string | null): string {
  if (!value) return "modified_at";
  return VALID_SORT_KEYS.has(value) ? value : "modified_at";
}

function SortHeader({
  column,
  currentSort,
  currentDir,
  onSort,
}: {
  column: { key: string; label: string; align: "left" | "right" };
  currentSort: string;
  currentDir: "ASC" | "DESC";
  onSort: (key: string, dir: "ASC" | "DESC") => void;
}) {
  const isActive = currentSort === column.key;
  const Icon = isActive
    ? currentDir === "ASC"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;

  return (
    <th
      className={`py-2 px-3 font-medium cursor-pointer hover:text-foreground transition-colors select-none ${column.align === "left" ? "text-left" : "text-right"}`}
      onClick={() => {
        if (isActive) {
          onSort(column.key, currentDir === "ASC" ? "DESC" : "ASC");
        } else {
          onSort(column.key, "DESC");
        }
      }}
    >
      <span
        className={`inline-flex items-center gap-1 ${column.align === "right" ? "justify-end" : ""}`}
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

export function SessionsTab({ onSummaryMetricsChange }: SessionsTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { confirm } = useConfirm();

  const [projectId, setProjectId] = useState<string | undefined>();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState(() =>
    normalizeSortBy(searchParams.get("sortBy")),
  );
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">(
    (searchParams.get("sortDir") as "ASC" | "DESC") || "DESC",
  );
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>(() => {
    const df = searchParams.get("dateFrom");
    const dt = searchParams.get("dateTo");
    return {
      from: df ? new Date(df) : undefined,
      to: dt ? new Date(dt) : undefined,
    };
  });
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => {
      const v = searchParams.get("view");
      if (v === "grid" || v === "list" || v === "task") return v;
      return "list";
    },
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [costMin, setCostMin] = useState<number | undefined>(
    searchParams.get("costMin")
      ? Number(searchParams.get("costMin"))
      : undefined,
  );
  const [costMax, setCostMax] = useState<number | undefined>(
    searchParams.get("costMax")
      ? Number(searchParams.get("costMax"))
      : undefined,
  );
  const [minMessages, setMinMessages] = useState<number | undefined>(
    searchParams.get("minMessages")
      ? Number(searchParams.get("minMessages"))
      : undefined,
  );
  const [role, setRole] = useState<string | undefined>();
  const [model, setModel] = useState<string | undefined>();
  const [agentType, setAgentType] = useState<string | undefined>();
  const [effortMode, setEffortMode] = useState<string | undefined>(
    () => searchParams.get("effortMode") || undefined,
  );
  const [provider, setProvider] = useState<string | undefined>(
    () => searchParams.get("provider") || undefined,
  );
  const [compressionState, setCompressionState] = useState<
    "active" | "compressed" | "all"
  >(() => {
    const state = searchParams.get("compressionState");
    if (state === "all" || state === "compressed" || state === "active") {
      return state;
    }
    return "active";
  });
  const compressSession = useCompressSession();
  const restoreSession = useRestoreSession();
  const compressBulk = useCompressSessionsBulk();
  const restoreBulk = useRestoreSessionsBulk();
  const deleteSession = useDeleteSession();
  const deleteBulk = useDeleteSessionsBulk();
  const debouncedSearch = useDebounce(search, 300);

  // Sync provider filter when URL changes (e.g. sidebar navigation)
  const urlProvider = searchParams.get("provider") || undefined;
  useEffect(() => {
    setProvider(urlProvider);
    setPage(0);
  }, [urlProvider]);

  // Compare selection state: no cap on number of sessions
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedSessions, setSelectedSessions] = useState<
    Map<string, Session>
  >(new Map());
  const [compareOpen, setCompareOpen] = useState(false);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);

  const toggleSelect = (id: string, session?: Session) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return next;
    });
    setSelectedSessions((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else if (session) next.set(id, session);
      return next;
    });
  };

  // Clear filter URL params after hydrating so they don't stick on navigation
  useEffect(() => {
    if (
      searchParams.has("costMin") ||
      searchParams.has("costMax") ||
      searchParams.has("minMessages") ||
      searchParams.has("dateFrom") ||
      searchParams.has("dateTo")
    ) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("costMin");
      params.delete("costMax");
      params.delete("minMessages");
      params.delete("dateFrom");
      params.delete("dateTo");
      params.delete("sortBy");
      params.delete("sortDir");
      router.replace(`/sessions?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dateFrom = useMemo(() => {
    if (!dateRange.from) return undefined;
    const d = dateRange.from;
    // Preserve time precision for sub-day filtering (e.g. block windows)
    if (d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0) {
      return d.toISOString();
    }
    return format(d, "yyyy-MM-dd");
  }, [dateRange.from]);

  const dateTo = useMemo(() => {
    if (!dateRange.to) return undefined;
    const d = dateRange.to;
    if (d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0) {
      return d.toISOString();
    }
    return format(d, "yyyy-MM-dd");
  }, [dateRange.to]);

  const { data: projectsData } = useProjects();
  const { data: filterOptions } = useFilterOptions(
    dateFrom || "2025-01-01",
    dateTo || new Date().toISOString().split("T")[0],
    projectId,
    provider,
  );
  const { data, isLoading, error } = useSessions({
    projectId,
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
    dateFrom,
    dateTo,
    costMin,
    costMax,
    minMessages,
    role,
    model,
    agentType,
    effortMode,
    provider,
    compressionState,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const { data: summary } = useSessionSummary({
    projectId,
    search: debouncedSearch || undefined,
    dateFrom,
    dateTo,
    costMin,
    costMax,
    minMessages,
    role,
    model,
    agentType,
    effortMode,
    provider,
    compressionState,
    enabled: onSummaryMetricsChange ? true : false,
  });

  const summaryMetrics = useMemo<SessionSummaryMetrics | null>(
    () =>
      summary
        ? {
            totalSessions: summary.total_sessions,
            totalCost: summary.total_cost,
            avgCost: summary.avg_cost,
            totalMessages: summary.total_messages,
          }
        : null,
    [summary],
  );

  useEffect(() => {
    onSummaryMetricsChange?.(summaryMetrics);
  }, [onSummaryMetricsChange, summaryMetrics]);

  useEffect(() => {
    return () => onSummaryMetricsChange?.(null);
  }, [onSummaryMetricsChange]);

  const { data: taskData, isLoading: taskLoading } = useTaskSessions({
    projectId,
    search: debouncedSearch || undefined,
    sortBy,
    sortDir,
    dateFrom,
    dateTo,
    costMin,
    costMax,
    minMessages,
    role,
    model,
    agentType,
    effortMode,
    provider,
    compressionState,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    enabled: viewMode === "task",
  });

  const sessions = data?.sessions ?? [];
  const { data: storageData } = useSessionStorage({
    provider,
    projectId,
    compressionState,
  });
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const taskTotalPages = Math.ceil((taskData?.total || 0) / PAGE_SIZE);

  const pageSummary = useMemo(() => {
    const rows = data?.sessions ?? [];
    if (rows.length === 0) return null;
    return {
      messages: rows.reduce((s, x) => s + x.message_count, 0),
      cost: rows.reduce((s, x) => s + x.total_cost, 0),
      input: rows.reduce((s, x) => s + x.input_tokens, 0),
      output: rows.reduce((s, x) => s + x.output_tokens, 0),
      cacheRead: rows.reduce((s, x) => s + x.cache_read_tokens, 0),
      cacheWrite: rows.reduce((s, x) => s + x.cache_write_tokens, 0),
    };
  }, [data?.sessions]);

  // Build a lookup of all visible sessions across all views
  const dataSessions = data?.sessions;
  const taskSessions = taskData?.sessions;
  const allVisibleSessions = useMemo(() => {
    const map = new Map<string, Session>();
    for (const s of dataSessions || []) map.set(s.id, s);
    for (const t of taskSessions || []) {
      map.set(t.id, t as unknown as Session);
      for (const c of t.children || []) map.set(c.id, c);
    }
    return map;
  }, [dataSessions, taskSessions]);

  // Wrap toggleSelect to auto-resolve session from visible data
  const toggleSelectWithLookup = (id: string, session?: Session) => {
    const resolved = session || allVisibleSessions.get(id);
    toggleSelect(id, resolved);
  };

  const selectedRows = useMemo(
    () =>
      selectedIds
        .map((id) => selectedSessions.get(id) || allVisibleSessions.get(id))
        .filter(Boolean) as Session[],
    [selectedIds, selectedSessions, allVisibleSessions],
  );
  const selectedActiveIds = useMemo(
    () => selectedRows.filter((s) => !s.compressed_at).map((s) => s.id),
    [selectedRows],
  );
  const selectedCompressedIds = useMemo(
    () => selectedRows.filter((s) => !!s.compressed_at).map((s) => s.id),
    [selectedRows],
  );

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
        <div className="border-b border-border/40 bg-muted/20 px-4 py-3">
          <SessionFilters
              projects={projectsData || []}
              selectedProject={projectId}
              onProjectChange={(id) => {
                setProjectId(id);
                setPage(0);
              }}
              search={search}
              onSearchChange={(v) => {
                setSearch(v);
                setPage(0);
              }}
              sortBy={sortBy}
              onSortChange={(v) => {
                setSortBy(v);
                setSortDir("DESC");
                setPage(0);
              }}
              dateRange={dateRange}
              onDateRangeChange={(v) => {
                setDateRange(v);
                setPage(0);
              }}
              viewMode={viewMode}
              onViewModeChange={(mode) => {
                setViewMode(mode);
                setPage(0);
              }}
              role={role}
              onRoleChange={(v) => {
                setRole(v);
                setPage(0);
              }}
              models={filterOptions?.models}
              model={model}
              onModelChange={(v) => {
                setModel(v);
                setPage(0);
              }}
              agentTypes={filterOptions?.agentTypes}
              agentType={agentType}
              onAgentTypeChange={(v) => {
                setAgentType(v);
                setPage(0);
              }}
              effortModes={filterOptions?.effortModes}
              effortMode={effortMode}
              onEffortModeChange={(v) => {
                setEffortMode(v);
                setPage(0);
              }}
              providers={filterOptions?.providers}
              provider={provider}
              onProviderChange={(v) => {
                setProvider(v);
                setPage(0);
              }}
              compressionState={compressionState}
              onCompressionStateChange={(next) => {
                setCompressionState(next);
                setSelectedIds([]);
                setSelectedSessions(new Map());
                setExpandedId(null);
                setPage(0);
              }}
            />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 text-xs text-muted-foreground tabular-nums shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            {storageData ? (
              <span className="max-w-[360px] truncate text-[11px] text-muted-foreground tabular-nums">
                Storage: {formatBytes(storageData.jsonlBytes)} session logs +{" "}
                {formatBytes(storageData.databaseBytes)} DB ·{" "}
                {storageData.sessionFileCount.toLocaleString()} files
                {storageData.missingFileCount > 0
                  ? ` (${storageData.missingFileCount.toLocaleString()} missing)`
                  : ""}
              </span>
            ) : null}
            {(costMin != null || costMax != null) && (
              <Badge variant="outline" className="text-micro gap-1 px-1.5 py-0">
                Cost: ${costMin ?? 0}–
                {costMax && costMax < 999999 ? `$${costMax}` : "∞"}
                <button
                  onClick={() => {
                    setCostMin(undefined);
                    setCostMax(undefined);
                    setMinMessages(undefined);
                    setPage(0);
                  }}
                  className="ml-0.5 hover:text-foreground"
                >
                  ×
                </button>
              </Badge>
            )}
            {(() => {
              const activeCount = [
                projectId,
                debouncedSearch,
                dateRange.from,
                dateRange.to,
                costMin != null,
                costMax != null,
                minMessages != null,
                role,
                model,
                agentType,
                effortMode,
                provider,
                compressionState !== "active",
              ].filter(Boolean).length;
              if (activeCount === 0) return null;
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => {
                    setProjectId(undefined);
                    setSearch("");
                    setDateRange({ from: undefined, to: undefined });
                    setCostMin(undefined);
                    setCostMax(undefined);
                    setMinMessages(undefined);
                    setRole(undefined);
                    setModel(undefined);
                    setAgentType(undefined);
                    setEffortMode(undefined);
                    setProvider(undefined);
                    setCompressionState("active");
                    setPage(0);
                  }}
                >
                  <X size={12} />
                  Clear ({activeCount})
                </Button>
              );
            })()}
          </div>
          {summaryMetrics && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-3 text-[11px] text-muted-foreground tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Hash size={11} className="text-muted-foreground/60" />
                {summaryMetrics.totalSessions.toLocaleString()} sessions
              </span>
              <span className="inline-flex items-center gap-1">
                <DollarSign size={11} className="text-muted-foreground/60" />
                {formatCost(summaryMetrics.totalCost)} total
              </span>
              <span className="inline-flex items-center gap-1">
                <TrendingUp size={11} className="text-muted-foreground/60" />
                {formatCost(summaryMetrics.avgCost)} avg
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare size={11} className="text-muted-foreground/60" />
                {summaryMetrics.totalMessages.toLocaleString()} messages
              </span>
            </div>
          )}
        </div>
      </div>

      {error && !data && (
        <div className="text-sm text-destructive">
          Failed to load sessions. Try re-indexing from the header.
        </div>
      )}

      {viewMode === "task" ? (
        <>
          {taskLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {(taskData?.sessions || []).map((session) => (
                <TaskGroup
                  key={session.id}
                  session={session}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelectWithLookup}
                />
              ))}
              {(taskData?.sessions || []).length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  No sessions found
                </div>
              )}
            </div>
          )}
          <TablePagination
            page={page}
            totalPages={taskTotalPages}
            onPageChange={setPage}
          />
        </>
      ) : viewMode === "list" ? (
        <>
          {isLoading ? (
            <div className="space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          ) : (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="table-readable w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                    <th className="w-10 pl-3 pr-1">
                      <input
                        type="checkbox"
                        checked={sessions.length > 0 && sessions.every((s: Session) => selectedIds.includes(s.id))}
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = sessions.some((s: Session) => selectedIds.includes(s.id))
                              && !sessions.every((s: Session) => selectedIds.includes(s.id));
                          }
                        }}
                        onChange={() => {
                          const allOnPage = sessions.every((s: Session) => selectedIds.includes(s.id));
                          if (allOnPage) {
                            // Deselect all on this page
                            const pageIds = new Set(sessions.map((s: Session) => s.id));
                            setSelectedIds((prev) => prev.filter((id) => !pageIds.has(id)));
                            setSelectedSessions((prev) => {
                              const next = new Map(prev);
                              for (const id of pageIds) next.delete(id);
                              return next;
                            });
                          } else {
                            // Select all on this page
                            setSelectedIds((prev) => {
                              const existing = new Set(prev);
                              const added = sessions.filter((s: Session) => !existing.has(s.id)).map((s: Session) => s.id);
                              return [...prev, ...added];
                            });
                            setSelectedSessions((prev) => {
                              const next = new Map(prev);
                              for (const s of sessions) next.set(s.id, s);
                              return next;
                            });
                          }
                        }}
                        className="h-3 w-3 rounded border-border accent-primary cursor-pointer"
                      />
                    </th>
                    <th className="w-6" />
                    {SORT_COLUMNS.map((col) => (
                      <SortHeader
                        key={col.key}
                        column={col}
                        currentSort={sortBy}
                        currentDir={sortDir}
                        onSort={(key, dir) => {
                          setSortBy(key);
                          setSortDir(dir);
                          setPage(0);
                        }}
                      />
                    ))}
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session: Session) => {
                    const projectName = session.project_path
                      ? session.project_path.split("/").pop() ||
                        session.project_path
                      : "—";
                    const isExpanded = expandedId === session.id;
                    const toolRows = isExpanded
                      ? parseToolUsage(session.tool_usage)
                      : [];
                    const models = parseModels(session.model_usage);
                    const prompt =
                      session.summary || session.first_prompt || "";
                    const truncated =
                      prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
                    const cacheWriteUnavailable =
                      session.provider === "codex" &&
                      session.cache_write_tokens === 0;

                    return (
                      <Fragment key={session.id}>
                        <tr className="border-b border-border/30 hover:bg-muted/30 transition-colors group">
                          <td className="py-2 pl-3 pr-1">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(session.id)}
                              onChange={(e) => {
                                if (e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey && lastClickedId) {
                                  // Shift-click: select range
                                  const ids = sessions.map((s: Session) => s.id);
                                  const from = ids.indexOf(lastClickedId);
                                  const to = ids.indexOf(session.id);
                                  if (from !== -1 && to !== -1) {
                                    const [start, end] = from < to ? [from, to] : [to, from];
                                    const rangeIds = ids.slice(start, end + 1);
                                    setSelectedIds((prev) => {
                                      const existing = new Set(prev);
                                      const added = rangeIds.filter((id) => !existing.has(id));
                                      return [...prev, ...added];
                                    });
                                    setSelectedSessions((prev) => {
                                      const next = new Map(prev);
                                      for (const id of rangeIds) {
                                        const s = sessions.find((s: Session) => s.id === id);
                                        if (s) next.set(id, s);
                                      }
                                      return next;
                                    });
                                  }
                                } else {
                                  toggleSelectWithLookup(session.id, session);
                                }
                                setLastClickedId(session.id);
                              }}
                              className="h-3 w-3 rounded border-border accent-primary cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          <td className="py-2 pl-1">
                            <button
                              className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : session.id)
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp size={12} />
                              ) : (
                                <ChevronDown size={12} />
                              )}
                            </button>
                          </td>
                          {/* Date + session info */}
                          <td className="px-3 py-2">
                            <Link
                              href={`/sessions/${session.id}`}
                              className="block"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-foreground/90 truncate max-w-[200px]">
                                  {session.slug || session.id.slice(0, 12)}
                                </span>
                                <span
                                  className="text-meta whitespace-nowrap"
                                  title={format(
                                    new Date(session.modified_at),
                                    "MMM d, yyyy h:mm a",
                                  )}
                                >
                                  {formatDistanceToNow(
                                    new Date(session.modified_at),
                                    { addSuffix: true },
                                  )}
                                </span>
                              </div>
                              {truncated && (
                                <div className="text-muted-foreground/60 truncate max-w-[300px] mt-0.5">
                                  {truncated}
                                </div>
                              )}
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-meta truncate max-w-[120px]">
                                  {projectName}
                                </span>
                                {models.map((m) => (
                                  <span
                                    key={m}
                                    className="inline-block px-1 py-0 rounded bg-muted text-muted-foreground text-micro font-mono"
                                  >
                                    {m}
                                  </span>
                                ))}
                                {session.effort_mode ? (
                                  <Badge
                                    variant="outline"
                                    className="text-micro px-1 py-0"
                                  >
                                    {formatEffortMode(session.effort_mode)}
                                  </Badge>
                                ) : null}
                                {session.session_role === "subagent" && session.subagent_type && (
                                  <Badge variant="secondary" className="text-micro px-1 py-0">
                                    {session.subagent_type}
                                  </Badge>
                                )}
                              </div>
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {session.message_count}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">
                            {formatCost(session.total_cost)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {formatTokens(session.input_tokens)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {formatTokens(session.output_tokens)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {formatTokens(session.cache_read_tokens)}
                          </td>
                          <td
                            className="px-3 py-2 text-right tabular-nums text-muted-foreground"
                            title={
                              cacheWriteUnavailable
                                ? "Codex CLI logs do not currently report cache write tokens."
                                : undefined
                            }
                          >
                            {cacheWriteUnavailable
                              ? "N/A"
                              : formatTokens(session.cache_write_tokens)}
                          </td>
                          <td className="px-1 py-2">
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const isCompressed = !!session.compressed_at;
                                  const ok = await confirm({
                                    title: isCompressed
                                      ? "Restore this compressed session?"
                                      : "Compress this session?",
                                    description:
                                      isCompressed
                                        ? "This brings the session back into your active list."
                                        : "This hides the session from active views without deleting any data. Analytics, costs, and usage metrics remain available.",
                                    confirmLabel: isCompressed
                                      ? "Restore"
                                      : "Compress",
                                    variant: "default",
                                  });
                                  if (!ok) return;
                                  const mutate = isCompressed
                                    ? restoreSession
                                    : compressSession;
                                  mutate.mutate(session.id, {
                                    onSuccess: () => {
                                      setSelectedIds((prev) =>
                                        prev.filter((id) => id !== session.id),
                                      );
                                      setSelectedSessions((prev) => {
                                        const next = new Map(prev);
                                        next.delete(session.id);
                                        return next;
                                      });
                                    },
                                  });
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted/60 text-muted-foreground/70 hover:text-foreground"
                                title={
                                  session.compressed_at
                                    ? "Restore session"
                                    : "Compress session"
                                }
                              >
                                {session.compressed_at ? (
                                  <RotateCcw size={12} />
                                ) : (
                                  <Archive size={12} />
                                )}
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const ok = await confirm({
                                    title: "Hard delete this session?",
                                    description:
                                      "This permanently deletes the session from the index and removes its JSONL log from disk. This cannot be undone.",
                                    confirmLabel: "Hard Delete",
                                    variant: "destructive",
                                  });
                                  if (!ok) return;
                                  deleteSession.mutate(session.id, {
                                    onSuccess: () => {
                                      setSelectedIds((prev) =>
                                        prev.filter((id) => id !== session.id),
                                      );
                                      setSelectedSessions((prev) => {
                                        const next = new Map(prev);
                                        next.delete(session.id);
                                        return next;
                                      });
                                    },
                                  });
                                }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground/70 hover:text-destructive"
                                title="Hard delete session (removes file from disk)"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {/* Expanded tool breakdown */}
                        {isExpanded && toolRows.length === 0 && (
                          <tr className="border-b border-border/60">
                            <td
                              colSpan={11}
                              className="px-4 py-3 bg-muted/20 text-micro text-muted-foreground"
                            >
                              No tool usage data for this session
                            </td>
                          </tr>
                        )}
                        {isExpanded && toolRows.length > 0 && (
                          <tr className="border-b border-border/60">
                            <td colSpan={11} className="px-2 py-2 bg-muted/20">
                              <div className="border-l-2 border-primary/20 pl-3 ml-6">
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
                                      Cache Read
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
                                      className="border-t border-border/60"
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
                                        {t.inputTokens ? (
                                          formatTokens(t.inputTokens)
                                        ) : (
                                          <span className="text-text-tertiary">
                                            —
                                          </span>
                                        )}
                                      </td>
                                      <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                        {t.outputTokens ? (
                                          formatTokens(t.outputTokens)
                                        ) : (
                                          <span className="text-text-tertiary">
                                            —
                                          </span>
                                        )}
                                      </td>
                                      <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                                        {t.cacheReadTokens ? (
                                          formatTokens(t.cacheReadTokens)
                                        ) : (
                                          <span className="text-text-tertiary">
                                            —
                                          </span>
                                        )}
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
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {sessions.length === 0 && (
                    <tr>
                      <td
                        colSpan={11}
                        className="py-8 text-center text-muted-foreground"
                      >
                        No sessions found
                      </td>
                    </tr>
                  )}
                </tbody>
                {pageSummary && (
                  <tfoot>
                    <tr className="bg-muted/20 border-t border-border font-medium text-xs">
                      <td className="py-2 pl-3 pr-1" />
                      <td />
                      <td className="px-3 py-2 text-muted-foreground">
                        Page total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {pageSummary.messages}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">
                        {formatCost(pageSummary.cost)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatTokens(pageSummary.input)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatTokens(pageSummary.output)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatTokens(pageSummary.cacheRead)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {formatTokens(pageSummary.cacheWrite)}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      ) : (
        <>
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  selected={selectedIds.includes(session.id)}
                  onToggleSelect={(id) => toggleSelectWithLookup(id, session)}
                />
              ))}
            </div>
          )}
          <TablePagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </>
      )}
      {/* Floating comparison bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-lg px-5 py-2.5 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {selectedIds.length} session{selectedIds.length > 1 ? "s" : ""}{" "}
            selected
          </span>
          {selectedIds.length > 5 && (
            <span className="text-amber-500 text-xs">
              Large comparisons may reduce quality
            </span>
          )}
          <Button
            size="sm"
            className="rounded-full gap-1.5"
            disabled={selectedIds.length < 1}
            title={
              selectedIds.length < 1
                ? "Select at least 1 session to review"
                : `Review ${selectedIds.length} sessions`
            }
            onClick={() => {
              const ids = selectedIds.join(",");
              router.push(
                `/analyze?ids=${ids}&scope=metrics,summaries`,
              );
            }}
          >
            <Sparkles size={14} />
            Review{selectedIds.length >= 1 ? ` (${selectedIds.length})` : ""}
          </Button>
          {selectedActiveIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full gap-1.5"
              disabled={compressBulk.isPending || deleteBulk.isPending}
              title="Compress selected sessions"
              onClick={async () => {
                const ok = await confirm({
                  title: `Compress ${selectedActiveIds.length} selected session${selectedActiveIds.length === 1 ? "" : "s"}?`,
                  description:
                    "Compressed sessions are hidden from active views and can be restored later. Analytics, costs, and usage metrics are preserved.",
                  confirmLabel: "Compress",
                  variant: "default",
                });
                if (!ok) return;
                compressBulk.mutate(selectedActiveIds, {
                  onSuccess: () => {
                    setSelectedIds([]);
                    setSelectedSessions(new Map());
                    setExpandedId(null);
                  },
                });
              }}
            >
              <Archive size={14} />
              {compressBulk.isPending
                ? "Compressing..."
                : `Compress (${selectedActiveIds.length})`}
            </Button>
          )}
          {selectedCompressedIds.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full gap-1.5"
              disabled={restoreBulk.isPending || deleteBulk.isPending}
              title="Restore selected compressed sessions"
              onClick={async () => {
                const ok = await confirm({
                  title: `Restore ${selectedCompressedIds.length} selected session${selectedCompressedIds.length === 1 ? "" : "s"}?`,
                  description:
                    "This moves selected sessions back into active views.",
                  confirmLabel: "Restore",
                  variant: "default",
                });
                if (!ok) return;
                restoreBulk.mutate(selectedCompressedIds, {
                  onSuccess: () => {
                    setSelectedIds([]);
                    setSelectedSessions(new Map());
                    setExpandedId(null);
                  },
                });
              }}
            >
              <RotateCcw size={14} />
              {restoreBulk.isPending
                ? "Restoring..."
                : `Restore (${selectedCompressedIds.length})`}
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            className="rounded-full gap-1.5"
            disabled={deleteBulk.isPending || compressBulk.isPending || restoreBulk.isPending}
            title="Hard delete selected sessions (removes files from disk)"
            onClick={async () => {
              const ok = await confirm({
                title: `Hard delete ${selectedIds.length} selected session${selectedIds.length === 1 ? "" : "s"}?`,
                description:
                  "This permanently removes selected JSONL session logs from disk and deletes those sessions from the index. This action cannot be undone.",
                confirmLabel: "Hard Delete",
                variant: "destructive",
              });
              if (!ok) return;
              deleteBulk.mutate(selectedIds, {
                onSuccess: () => {
                  setSelectedIds([]);
                  setSelectedSessions(new Map());
                  setExpandedId(null);
                },
              });
            }}
          >
            <Trash2 size={14} />
            {deleteBulk.isPending
              ? "Deleting..."
              : `Hard Delete (${selectedIds.length})`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={compressBulk.isPending || restoreBulk.isPending || deleteBulk.isPending}
            onClick={() => {
              setSelectedIds([]);
              setSelectedSessions(new Map());
            }}
          >
            <X size={14} />
            Clear
          </Button>
        </div>
      )}

      {/* Compare dialog */}
      {selectedIds.length >= 2 && (
        <CompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          sessions={
            selectedIds
              .map((id) => selectedSessions.get(id))
              .filter(Boolean) as Session[]
          }
        />
      )}
    </div>
  );
}
