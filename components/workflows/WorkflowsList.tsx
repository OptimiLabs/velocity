"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/hooks/useConfirm";
import {
  useWorkflows,
  useDeleteWorkflow,
  useBulkDeleteWorkflows,
  useDuplicateWorkflow,
} from "@/hooks/useWorkflows";
import { CreateWorkflowModal } from "@/components/workflows/CreateWorkflowModal";
import { TablePagination } from "@/components/ui/table-pagination";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Plus,
  GitBranch,
  Pencil,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Terminal,
  Sparkles,
  Bot,
  X,
} from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import type { Workflow } from "@/types/workflow";
import type { ConfigProvider } from "@/types/provider";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

const PAGE_SIZE = 20;

type SortKey = "name" | "agents" | "steps" | "updated";

const SORT_COLUMNS = [
  { key: "name", label: "Name", align: "left" },
  { key: "agents", label: "Agents", align: "left" },
  { key: "steps", label: "Steps", align: "right" },
  { key: "updated", label: "Updated", align: "right" },
] as const;

function workflowProviderLabel(provider?: ConfigProvider): string {
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  return "Claude";
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
      className={`py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 cursor-pointer hover:text-foreground transition-colors select-none ${column.align === "left" ? "text-left" : "text-right"}`}
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
          size={11}
          className={isActive ? "text-foreground" : "text-muted-foreground/70"}
        />
      </span>
    </th>
  );
}

function uniqueAgentCount(wf: Workflow): number {
  return new Set(wf.nodes.map((n) => n.agentName).filter(Boolean)).size;
}

function uniqueAgentNames(wf: Workflow): string[] {
  return [...new Set(wf.nodes.map((n) => n.agentName).filter((name): name is string => Boolean(name)))];
}

interface WorkflowsListProps {
  initialSearch?: string;
}

export function WorkflowsList({ initialSearch }: WorkflowsListProps) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { data: workflows, isLoading } = useWorkflows();
  const deleteWorkflow = useDeleteWorkflow();
  const bulkDelete = useBulkDeleteWorkflows();
  const duplicateWorkflow = useDuplicateWorkflow();

  const [search, setSearch] = useState(initialSearch ?? "");
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("DESC");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalMode, setModalMode] = useState<"manual" | "ai" | null>(null);
  const providerScope = useProviderScopeStore((s) => s.providerScope);

  const { filtered, paginated, totalPages } = useMemo(() => {
    let list = workflows ?? [];

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          (w.description ?? "").toLowerCase().includes(q),
      );
    }

    list = list.filter((w) => (w.provider ?? "claude") === providerScope);

    const dir = sortDir === "ASC" ? 1 : -1;
    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "agents":
          return dir * (uniqueAgentCount(a) - uniqueAgentCount(b));
        case "steps":
          return dir * (a.nodes.length - b.nodes.length);
        case "updated":
          return (
            dir *
            (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
          );
        default:
          return 0;
      }
    });

    const tp = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const pg = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return { filtered: list, paginated: pg, totalPages: tp };
  }, [workflows, search, providerScope, sortBy, sortDir, page]);


  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [providerScope]);

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
    setSelected(new Set());
  };
  const handleSort = (key: string, dir: "ASC" | "DESC") => {
    setSortBy(key as SortKey);
    setSortDir(dir);
    setPage(0);
    setSelected(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = paginated.map((w) => w.id);
    const allSelected = pageIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleEdit = (id: string) => {
    router.push(`/workflows/${id}`);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({ title: "Delete this workflow?" });
    if (ok) deleteWorkflow.mutate(id);
  };

  const handleDuplicate = async (id: string) => {
    const copy = await duplicateWorkflow.mutateAsync(id);
    router.push(`/workflows/${copy.id}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search workflows..."
              inputSize="sm"
              containerClassName="w-full sm:w-72 md:w-80"
            />


            <span className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
              {filtered.length} items
              {selected.size > 0 && (
                <span className="text-primary ml-1">
                  • {selected.size} selected
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setModalMode("manual")}
              >
                <Plus size={12} /> New Workflow
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                className="h-7 w-7"
                onClick={() => setModalMode("ai")}
                title="Build with AI"
                aria-label="Build workflow with AI"
              >
                <Sparkles size={12} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="table-readable w-full text-sm">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td colSpan={10} className="py-2 px-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        ) : paginated.length > 0 ? (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="table-readable w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground/80">
                    <th className="py-2.5 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          paginated.length > 0 &&
                          paginated.every((w) => selected.has(w.id))
                        }
                        onChange={toggleSelectAll}
                        className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      />
                    </th>
                    <SortHeader
                      column={SORT_COLUMNS[0]}
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortHeader
                      column={SORT_COLUMNS[1]}
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    <SortHeader
                      column={SORT_COLUMNS[2]}
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-left">
                      Command
                    </th>
                    <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-left">
                      Skill
                    </th>
                    <SortHeader
                      column={SORT_COLUMNS[3]}
                      currentSort={sortBy}
                      currentDir={sortDir}
                      onSort={handleSort}
                    />
                    <th className="py-2 px-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((wf) => (
                    <tr
                      key={wf.id}
                      className="border-b border-border/30 text-[12px] hover:bg-muted/30 transition-colors group cursor-pointer"
                      onClick={() => handleEdit(wf.id)}
                    >
                      {/* Checkbox */}
                      <td
                        className="py-2.5 px-3 w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(wf.id)}
                          onChange={() => toggleSelect(wf.id)}
                          className="accent-primary h-3.5 w-3.5 cursor-pointer"
                        />
                      </td>

                      {/* Name + Description */}
                      <td className="py-2.5 px-3">
                        <div className="min-w-0 max-w-[340px]">
                          <div className="flex items-center gap-2">
                            <GitBranch size={12} className="text-chart-4/90 shrink-0" />
                            <span className="truncate text-[12.5px] font-semibold tracking-tight text-foreground">
                              {wf.name}
                            </span>
                          </div>
                          {wf.description && (
                            <p className="mt-1 line-clamp-1 text-[11px] leading-5 text-muted-foreground/85">
                              {wf.description}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Agents */}
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const names = uniqueAgentNames(wf);
                          if (names.length === 0) return <span className="text-[11px] text-muted-foreground/60">—</span>;
                          return (
                            <div className="flex items-center gap-1">
                              {names.slice(0, 2).map((name) => (
                                <Link key={name} href={`/agents?search=${encodeURIComponent(name)}`}>
                                  <Badge variant="outline" className="text-[10.5px] font-medium gap-1 hover:opacity-80 transition-opacity cursor-pointer">
                                    <Bot size={9} />
                                    {name}
                                  </Badge>
                                </Link>
                              ))}
                              {names.length > 2 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="text-[10.5px] font-medium text-muted-foreground cursor-default">+{names.length - 2}</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="start">
                                      <div className="flex flex-col gap-1">
                                        {names.slice(2).map((n) => (
                                          <span key={n} className="flex items-center gap-1.5 text-xs">
                                            <Bot size={9} /> {n}
                                          </span>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Steps */}
                      <td className="py-2.5 px-3 text-right tabular-nums text-[12px] font-medium text-muted-foreground">
                        {wf.nodes.length}
                      </td>

                      {/* Command */}
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        {wf.commandName ? (
                          <Link href={`/skills?search=${encodeURIComponent(wf.commandName)}`}>
                            <Badge
                              variant="outline"
                              className="gap-1 font-mono text-[10.5px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
                            >
                              <Terminal size={9} />
                              /{wf.commandName}
                            </Badge>
                          </Link>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </td>

                      {/* Skill */}
                      <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                        {wf.activationContext ? (
                          <span className="text-[11px] leading-5 text-muted-foreground truncate block max-w-[180px]">
                            {wf.activationContext}
                          </span>
                        ) : wf.autoSkillEnabled ? (
                          wf.commandName ? (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Link href={`/skills?search=${encodeURIComponent(wf.commandName)}`}>
                                    <Badge variant="violet" className="gap-1 text-[10.5px] font-medium hover:opacity-80 transition-opacity cursor-pointer">
                                      <Sparkles size={9} />
                                      /{wf.commandName}
                                    </Badge>
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>This workflow is deployed as the /{wf.commandName} command. It can be triggered by typing /{wf.commandName} in the console or invoked as a skill by {workflowProviderLabel(wf.provider)}.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="violet" className="gap-1 text-[10.5px] font-medium cursor-default">
                                    <Sparkles size={9} />
                                    Skill enabled
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>This workflow is synced as a skill but has no command name. Configure a command name to make it available as a /command.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">
                            —
                          </span>
                        )}
                      </td>

                      {/* Updated */}
                      <td className="py-2.5 px-3 text-right text-[11px] font-medium text-muted-foreground">
                        {formatDistanceToNow(new Date(wf.updatedAt), {
                          addSuffix: true,
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3">
                        <div
                          className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleEdit(wf.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => handleDuplicate(wf.id)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                            title="Duplicate"
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            onClick={() => handleDelete(wf.id)}
                            className="p-1 rounded text-muted-foreground hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        ) : (
          <EmptyState
            icon={GitBranch}
            title={
              search
                ? "No matching workflows"
                : "No workflows yet"
            }
            description={
              search
                ? "Try adjusting your search."
                : "Create a workflow to orchestrate multi-agent tasks."
            }
            action={
              !search ? (
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setModalMode("manual")}
                >
                  <Plus size={12} />
                  New Workflow
                </Button>
              ) : undefined
            }
          />
        )}

        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-lg px-5 py-2.5">
          <span className="text-xs text-muted-foreground tabular-nums mr-1">
            {selected.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs gap-1.5 h-7 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            disabled={bulkDelete.isPending}
            onClick={async () => {
              const ok = await confirm({
                title: `Delete ${selected.size} workflow${selected.size === 1 ? "" : "s"}?`,
              });
              if (ok) {
                bulkDelete.mutate([...selected], {
                  onSuccess: () => setSelected(new Set()),
                });
              }
            }}
          >
            <Trash2 size={12} /> Delete
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full h-7" onClick={() => setSelected(new Set())}>
            <X size={14} /> Clear
          </Button>
        </div>
      )}

      <CreateWorkflowModal
        open={modalMode !== null}
        onOpenChange={(o) => { if (!o) setModalMode(null); }}
        mode={modalMode ?? "manual"}
      />
    </div>
  );
}
