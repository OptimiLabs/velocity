"use client";

import { useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/hooks/useConfirm";
import { useAgents, useSaveAgent, useDeleteAgent } from "@/hooks/useAgents";
import { AgentTableRow } from "@/components/agents/AgentTableRow";
import { AgentEditor } from "@/components/agents/AgentEditor";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { TablePagination } from "@/components/ui/table-pagination";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Bot,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PAGE_SIZE = 20;
const ALL_WORKFLOWS_VALUE = "__all_workflows__";

const SORT_COLUMNS = [
  { key: "name", label: "Name", align: "left" },
  { key: "model", label: "Model", align: "left" },
  { key: "usage", label: "Runs", align: "right" },
  { key: "cost", label: "Avg Cost", align: "right" },
  { key: "recent", label: "Last Used", align: "right" },
] as const;

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

interface AgentsTabProps {
  onBack?: () => void;
  initialSearch?: string;
  provider: ConfigProvider;
}

export function AgentsTab({ onBack, initialSearch, provider }: AgentsTabProps) {
  const { confirm } = useConfirm();
  const queryClient = useQueryClient();
  const { data: agents, isLoading } = useAgents(provider);
  const saveAgent = useSaveAgent();
  const deleteAgent = useDeleteAgent();
  const [editingAgent, setEditingAgent] = useState<Partial<Agent> | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);

  const [search, setSearch] = useState(initialSearch ?? "");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState<"ASC" | "DESC">("ASC");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [workflowFilter, setWorkflowFilter] = useState(ALL_WORKFLOWS_VALUE);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const workflowNamesInAgents = useMemo(() => {
    const names = new Set<string>();
    for (const agent of agents ?? []) {
      for (const workflowName of agent.workflowNames ?? []) {
        const trimmed = workflowName.trim();
        if (trimmed) names.add(trimmed);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [agents]);
  const inWorkflowAgentCount = useMemo(
    () => (agents ?? []).filter((agent) => (agent.workflowNames?.length ?? 0) > 0).length,
    [agents],
  );

  const { filtered, paginated, totalPages } = useMemo(() => {
    let list = agents ?? [];

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description ?? "").toLowerCase().includes(q) ||
          a.tags?.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Source / trigger filter
    if (sourceFilter === "has-skill") {
      list = list.filter((a) => a.skills && a.skills.length > 0);
    } else if (sourceFilter === "in-workflow") {
      list = list.filter((a) => a.workflowNames && a.workflowNames.length > 0);
      if (workflowFilter !== ALL_WORKFLOWS_VALUE) {
        const target = workflowFilter.toLowerCase();
        list = list.filter((a) =>
          (a.workflowNames || []).some((wf) => wf.toLowerCase() === target),
        );
      }
    } else if (sourceFilter !== "all") {
      list = list.filter((a) => (a.source ?? "custom") === sourceFilter);
    }

    // Sort
    const dir = sortDir === "ASC" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const aDisabled = a.enabled === false;
      const bDisabled = b.enabled === false;
      if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
      switch (sortBy) {
        case "name":
          return dir * a.name.localeCompare(b.name);
        case "model":
          return dir * (a.model ?? "").localeCompare(b.model ?? "");
        case "usage":
          return dir * ((a.usageCount ?? 0) - (b.usageCount ?? 0));
        case "cost":
          return dir * ((a.avgCost ?? 0) - (b.avgCost ?? 0));
        case "recent":
          return dir * ((a.lastUsed ?? 0) - (b.lastUsed ?? 0));
        default:
          return 0;
      }
    });

    const tp = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const pg = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    return { filtered: list, paginated: pg, totalPages: tp };
  }, [agents, search, sortBy, sortDir, sourceFilter, workflowFilter, page]);

  // Reset page when filters change
  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(0);
    setSelected(new Set());
  };
  const handleSourceFilter = (v: string) => {
    setSourceFilter(v);
    if (v !== "in-workflow") setWorkflowFilter(ALL_WORKFLOWS_VALUE);
    setPage(0);
    setSelected(new Set());
  };
  const handleWorkflowFilter = (v: string) => {
    setWorkflowFilter(v);
    setPage(0);
    setSelected(new Set());
  };
  const handleSort = (key: string, dir: "ASC" | "DESC") => {
    setSortBy(key);
    setSortDir(dir);
    setPage(0);
    setSelected(new Set());
  };

  const toggleSelect = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageNames = paginated.map((a) => a.name);
    const allSelected = pageNames.every((n) => selected.has(n));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        pageNames.forEach((n) => next.delete(n));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        pageNames.forEach((n) => next.add(n));
        return next;
      });
    }
  };

  const handleCreate = () => {
    setBuilderOpen(true);
  };

  const handleCreateManual = () => {
    setBuilderOpen(false);
    setEditingAgent(null);
    setEditorOpen(true);
  };

  const handleEdit = (agent: Agent) => {
    setEditingAgent(agent);
    setEditorOpen(true);
  };

  const handleDelete = async (agent: Agent) => {
    const ok = await confirm({ title: `Delete agent "${agent.name}"?` });
    if (ok) {
      deleteAgent.mutate({
        name: agent.name,
        provider: (agent.provider || provider) as ConfigProvider,
        projectPath: agent.scope === "project" ? agent.projectPath : undefined,
      });
    }
  };

  const handleSave = (agent: Partial<Agent>) => {
    saveAgent.mutate({ ...agent, provider });
  };

  const handleToggleEnabled = async (agent: Agent) => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: (agent.provider || provider) as ConfigProvider,
          name: agent.name,
          enabled: agent.enabled === false,
          projectPath: agent.scope === "project" ? agent.projectPath : undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to toggle agent");
      }
      await queryClient.invalidateQueries({ queryKey: ["agents"] });
      toast.success(
        `${agent.enabled === false ? "Enabled" : "Disabled"} "${agent.name}"`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle agent");
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    const ok = await confirm({
      title: `Delete ${count} agent${count > 1 ? "s" : ""}?`,
    });
    if (!ok) return;
    await Promise.all(
      Array.from(selected).map((name) => {
        const agent = filtered.find((a) => a.name === name);
        return deleteAgent.mutateAsync({
          name,
          provider: (agent?.provider || provider) as ConfigProvider,
          projectPath: agent?.scope === "project" ? agent.projectPath : undefined,
        });
      }),
    );
    setSelected(new Set());
  };

  const handleDuplicate = (agent: Agent) => {
    setEditingAgent({
      ...agent,
      name: `${agent.name}-copy`,
      filePath: undefined,
    } as Partial<Agent>);
    setEditorOpen(true);
  };

  const handleAIGenerated = (config: Partial<Agent>) => {
    setEditingAgent(config);
    setEditorOpen(true);
  };

  useEffect(() => {
    setSelected(new Set());
    setPage(0);
    setSourceFilter("all");
    setWorkflowFilter(ALL_WORKFLOWS_VALUE);
  }, [provider]);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
              >
                <ArrowLeft size={16} />
              </button>
            )}

            <SearchField
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search inventory..."
              inputSize="sm"
              containerClassName="w-full sm:w-72 md:w-80"
            />

            <Select value={sourceFilter} onValueChange={handleSourceFilter}>
              <SelectTrigger size="sm" className="min-w-[116px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
                <SelectItem value="preset">Built-in</SelectItem>
                <SelectItem value="marketplace">Marketplace</SelectItem>
                <SelectItem value="has-skill">Has skill trigger</SelectItem>
                <SelectItem value="in-workflow">
                  Used in workflows
                  {inWorkflowAgentCount ? ` (${inWorkflowAgentCount})` : ""}
                </SelectItem>
              </SelectContent>
            </Select>

            {sourceFilter === "in-workflow" && workflowNamesInAgents.length > 0 && (
              <>
                <Select value={workflowFilter} onValueChange={handleWorkflowFilter}>
                  <SelectTrigger size="sm" className={cn(
                    "min-w-[124px] text-xs",
                    workflowFilter !== ALL_WORKFLOWS_VALUE &&
                      "ring-1 ring-primary/40 bg-primary/5"
                  )}>
                    <SelectValue placeholder="All workflows" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_WORKFLOWS_VALUE}>All workflows</SelectItem>
                    {workflowNamesInAgents.map((workflowName) => (
                      <SelectItem key={workflowName} value={workflowName}>
                        {workflowName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {workflowFilter !== ALL_WORKFLOWS_VALUE && (
                  <button
                    onClick={() => handleWorkflowFilter(ALL_WORKFLOWS_VALUE)}
                    className="p-1 rounded-md hover:bg-muted text-muted-foreground"
                  >
                    <X size={12} />
                  </button>
                )}
              </>
            )}

            <span className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
              {filtered.length} items
            </span>
          </div>

          <div className="flex items-center">
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={handleCreate}
              >
                <Plus size={12} />
                New Agent
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="table-readable w-full">
                <tbody>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td colSpan={12} className="py-2 px-3">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        ) : paginated.length > 0 ? (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <table className="table-readable w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30 text-muted-foreground">
                    <th className="py-2 px-3 w-8">
                      <input
                        type="checkbox"
                        checked={paginated.length > 0 && paginated.every((a) => selected.has(a.name))}
                        onChange={toggleSelectAll}
                        className="accent-primary h-3.5 w-3.5 cursor-pointer"
                      />
                    </th>
                    <SortHeader column={SORT_COLUMNS[0]} currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader column={SORT_COLUMNS[1]} currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <th className="py-2 px-3 font-medium text-left">Effort</th>
                    <th className="py-2 px-3 font-medium text-left">Tools</th>
                    <th className="py-2 px-3 font-medium text-left">Skills</th>
                    <th className="py-2 px-3 font-medium text-left">Workflows</th>
                    <th className="py-2 px-3 font-medium text-right whitespace-nowrap">
                      Tokens
                    </th>
                    <SortHeader column={SORT_COLUMNS[2]} currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader column={SORT_COLUMNS[3]} currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <SortHeader column={SORT_COLUMNS[4]} currentSort={sortBy} currentDir={sortDir} onSort={handleSort} />
                    <th className="py-2 px-3 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((agent) => (
                    <AgentTableRow
                      key={agent.name}
                      agent={agent}
                      selected={selected.has(agent.name)}
                      onToggleSelect={() => toggleSelect(agent.name)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={handleDuplicate}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  ))}
                </tbody>
              </table>
            </div>
        ) : (
          <EmptyState
            icon={Bot}
            title={
              search || sourceFilter !== "all"
                ? "No matching items"
                : "No inventory items"
            }
            description={
              search || sourceFilter !== "all"
                ? "Try adjusting your search or filters."
                : "Create your first agent to get started."
            }
          />
        )}

        <TablePagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </div>

      <AgentEditor
        agent={editingAgent}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        provider={provider}
      />

      <AgentBuilder
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        onGenerated={handleAIGenerated}
        onCreateManual={handleCreateManual}
        existingAgents={agents?.map((a) => ({ name: a.name, description: a.description ?? "" }))}
        provider={provider}
      />

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-lg px-5 py-2.5">
          <span className="text-xs text-muted-foreground tabular-nums mr-1">
            {selected.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs gap-1.5 h-7 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={handleBulkDelete}
          >
            <Trash2 size={12} /> Delete
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full h-7" onClick={() => setSelected(new Set())}>
            <X size={14} /> Clear
          </Button>
        </div>
      )}
    </div>
  );
}
