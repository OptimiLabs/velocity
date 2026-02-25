"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Webhook,
  Server,
  Trash2,
  Plus,
  ExternalLink,
  Filter,
  Pencil,
  X,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HookEditor, type HookConfig } from "@/components/settings/HookEditor";
import type { ClaudeSettings, MCPServerConfig } from "@/lib/claude-settings";
import type { HookRule } from "@/lib/hooks/matcher";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandRow {
  id: string;
  source: "hook" | "mcp-server";
  label: string; // event name or server name
  command: string;
  type: "command" | "prompt" | "agent";
  matcher?: string;
  timeout?: number;
  async?: boolean;
  // Back-references for editing/deleting hooks
  event?: string;
  ruleIndex?: number;
  hookIndex?: number;
  // Back-reference for MCP servers
  serverName?: string;
  disabled?: boolean; // MCP server is in disabledMcpServers
}

type SourceFilter = "all" | "hook" | "mcp";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenHookRules(hooks: Record<string, HookRule[]>): CommandRow[] {
  const rows: CommandRow[] = [];
  for (const [event, rules] of Object.entries(hooks)) {
    if (!Array.isArray(rules)) continue;
    rules.forEach((rule, ri) => {
      if (!rule.hooks || !Array.isArray(rule.hooks)) return;
      rule.hooks.forEach((hook, hi) => {
        const cmd =
          hook.type === "command"
            ? (hook.command ?? "")
            : (hook.prompt?.slice(0, 120) ?? "");
        rows.push({
          id: `hook-${event}-${ri}-${hi}`,
          source: "hook",
          label: event,
          command: cmd,
          type: hook.type,
          matcher: rule.matcher,
          timeout: hook.timeout,
          async: hook.async,
          event,
          ruleIndex: ri,
          hookIndex: hi,
        });
      });
    });
  }
  return rows;
}

function flattenMcpServers(
  servers: Record<string, MCPServerConfig> | undefined,
  disabled: boolean,
): CommandRow[] {
  if (!servers) return [];
  const rows: CommandRow[] = [];
  for (const [name, config] of Object.entries(servers)) {
    if (!config.command) continue;
    const cmd = [config.command, ...(config.args ?? [])].join(" ");
    rows.push({
      id: `mcp-${disabled ? "off" : "on"}-${name}`,
      source: "mcp-server",
      label: name,
      command: cmd,
      type: "command",
      serverName: name,
      disabled,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CommandsTableProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

export function CommandsTable({ settings, onUpdate }: CommandsTableProps) {
  const searchParams = useSearchParams();
  const highlightEvent = searchParams.get("event");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingHook, setEditingHook] = useState<{
    event: string;
    ruleIndex?: number;
    hookIndex?: number;
    hook?: HookConfig;
    matcher?: string;
  } | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const highlightAssigned = useRef(false);

  const hooks = useMemo(
    () => (settings.hooks || {}) as Record<string, HookRule[]>,
    [settings.hooks],
  );

  // Build unified rows
  const allRows = useMemo<CommandRow[]>(() => {
    const hookRows = flattenHookRules(hooks);
    const mcpRows = flattenMcpServers(settings.mcpServers, false);
    const disabledMcpRows = flattenMcpServers(
      settings.disabledMcpServers,
      true,
    );
    return [...hookRows, ...mcpRows, ...disabledMcpRows];
  }, [hooks, settings.mcpServers, settings.disabledMcpServers]);

  // Apply source filter
  const rows = useMemo(() => {
    if (sourceFilter === "all") return allRows;
    return allRows.filter((r) =>
      sourceFilter === "hook" ? r.source === "hook" : r.source === "mcp-server",
    );
  }, [allRows, sourceFilter]);

  // Only hook rows are selectable
  const selectableRows = useMemo(
    () => rows.filter((r) => r.source === "hook"),
    [rows],
  );

  // Auto-scroll to highlighted event row
  useEffect(() => {
    if (highlightEvent && highlightRef.current) {
      highlightRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [highlightEvent, rows]);

  // --- Selection handlers ---

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const ids = selectableRows.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  // --- CRUD handlers ---

  const saveHook = async (
    hook: HookConfig,
    meta: { events: string[]; matcher: string },
    ruleIndex?: number,
    hookIndex?: number,
  ) => {
    if (ruleIndex !== undefined && hookIndex !== undefined) {
      const targetEvent = meta.events[0];
      const eventRules: HookRule[] = [...(hooks[targetEvent] || [])];
      const rule = { ...eventRules[ruleIndex] };
      const hks = [...rule.hooks];
      hks[hookIndex] = hook;
      rule.hooks = hks;
      if (meta.matcher) rule.matcher = meta.matcher;
      else delete rule.matcher;
      eventRules[ruleIndex] = rule;
      await onUpdate({ hooks: { ...hooks, [targetEvent]: eventRules } });
    } else {
      const newRule: HookRule = { hooks: [hook] };
      if (meta.matcher) newRule.matcher = meta.matcher;
      const updatedHooks = { ...hooks };
      for (const ev of meta.events) {
        updatedHooks[ev] = [...(updatedHooks[ev] || []), newRule];
      }
      await onUpdate({ hooks: updatedHooks });
    }
    setEditingHook(null);
  };

  const deleteHook = async (
    event: string,
    ruleIndex: number,
    hookIndex: number,
  ) => {
    const eventRules: HookRule[] = [...(hooks[event] || [])];
    const rule = { ...eventRules[ruleIndex] };
    const hks = [...rule.hooks];
    hks.splice(hookIndex, 1);

    if (hks.length === 0) {
      eventRules.splice(ruleIndex, 1);
    } else {
      rule.hooks = hks;
      eventRules[ruleIndex] = rule;
    }

    const next = { ...hooks };
    if (eventRules.length === 0) {
      delete next[event];
    } else {
      next[event] = eventRules;
    }
    await onUpdate({ hooks: next });
  };

  const bulkDeleteHooks = async () => {
    // Collect the hook rows that are selected
    const toDelete = rows.filter(
      (r) => r.source === "hook" && selected.has(r.id),
    );
    if (toDelete.length === 0) return;

    // Group by event, then sort by ruleIndex desc + hookIndex desc
    // so we can splice from the end without shifting earlier indices
    const byEvent = new Map<
      string,
      { ruleIndex: number; hookIndex: number }[]
    >();
    for (const row of toDelete) {
      const arr = byEvent.get(row.event!) ?? [];
      arr.push({ ruleIndex: row.ruleIndex!, hookIndex: row.hookIndex! });
      byEvent.set(row.event!, arr);
    }

    const next = { ...hooks };
    for (const [event, deletions] of byEvent) {
      // Sort descending so higher indices are removed first
      deletions.sort(
        (a, b) => b.ruleIndex - a.ruleIndex || b.hookIndex - a.hookIndex,
      );

      const eventRules: HookRule[] = (next[event] || []).map((r) => ({
        ...r,
        hooks: [...r.hooks],
      }));

      for (const { ruleIndex, hookIndex } of deletions) {
        eventRules[ruleIndex].hooks.splice(hookIndex, 1);
      }

      // Clean up empty rules
      const cleaned = eventRules.filter((r) => r.hooks.length > 0);
      if (cleaned.length === 0) {
        delete next[event];
      } else {
        next[event] = cleaned;
      }
    }

    await onUpdate({ hooks: next });
    setSelected(new Set());
  };

  // --- Filter chips ---

  const hookCount = allRows.filter((r) => r.source === "hook").length;
  const mcpCount = allRows.filter((r) => r.source === "mcp-server").length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          {(
            [
              { key: "all", label: "All", count: allRows.length },
              { key: "hook", label: "Hooks", count: hookCount },
              { key: "mcp", label: "MCP Servers", count: mcpCount },
            ] as const
          ).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => {
                setSourceFilter(key);
                setSelected(new Set());
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                sourceFilter === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1 opacity-70">{count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="text-xs gap-1"
            onClick={() => setEditingHook({ event: "PreToolUse" })}
          >
            <Plus size={12} /> New Command
          </Button>
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            No commands configured yet.
          </p>
          <Button
            size="sm"
            className="text-xs gap-1"
            onClick={() => setEditingHook({ event: "PreToolUse" })}
          >
            <Plus size={12} /> New Command
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 px-3">
                  <input
                    type="checkbox"
                    checked={
                      selectableRows.length > 0 &&
                      selectableRows.every((r) => selected.has(r.id))
                    }
                    onChange={toggleSelectAll}
                    className="accent-primary h-3.5 w-3.5 cursor-pointer"
                  />
                </TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[140px]">Event / Server</TableHead>
                <TableHead>Command</TableHead>
                <TableHead className="w-[100px]">Matcher</TableHead>
                <TableHead className="w-[80px]">Timeout</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const isHighlighted =
                  highlightEvent && row.event === highlightEvent;
                const isHook = row.source === "hook";
                return (
                  <TableRow
                    key={row.id}
                    ref={
                      isHighlighted
                        ? (el) => {
                            if (el && !highlightAssigned.current) {
                              highlightAssigned.current = true;
                              highlightRef.current = el;
                            }
                          }
                        : undefined
                    }
                    className={
                      isHighlighted
                        ? "bg-primary/5 ring-1 ring-primary/20"
                        : row.disabled
                          ? "opacity-50"
                          : ""
                    }
                  >
                    {/* Checkbox */}
                    <TableCell
                      className="px-3 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isHook ? (
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          className="accent-primary h-3.5 w-3.5 cursor-pointer"
                        />
                      ) : (
                        <span className="block w-3.5" />
                      )}
                    </TableCell>

                    {/* Source */}
                    <TableCell>
                      <Badge variant="outline" className="text-meta gap-1">
                        {row.source === "hook" ? (
                          <Webhook size={10} />
                        ) : (
                          <Server size={10} />
                        )}
                        {row.source === "hook" ? "hook" : "mcp"}
                      </Badge>
                    </TableCell>

                    {/* Event / Server */}
                    <TableCell>
                      <span className="font-mono text-xs">{row.label}</span>
                      {row.disabled && (
                        <Badge variant="secondary" className="text-meta ml-1.5">
                          disabled
                        </Badge>
                      )}
                    </TableCell>

                    {/* Command */}
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-mono text-xs truncate block max-w-[400px]">
                              {row.command}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="max-w-[500px] font-mono text-xs break-all"
                          >
                            {row.command}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>

                    {/* Matcher */}
                    <TableCell>
                      {row.matcher ? (
                        <Badge variant="secondary" className="text-meta">
                          {row.matcher}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Timeout */}
                    <TableCell className="text-xs tabular-nums">
                      {row.timeout ? `${row.timeout}ms` : "—"}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      {row.source === "hook" ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() =>
                              setEditingHook({
                                event: row.event!,
                                ruleIndex: row.ruleIndex,
                                hookIndex: row.hookIndex,
                                hook: {
                                  type: row.type,
                                  command:
                                    row.type === "command"
                                      ? row.command
                                      : undefined,
                                  prompt:
                                    row.type !== "command"
                                      ? row.command
                                      : undefined,
                                  timeout: row.timeout,
                                  async: row.async,
                                },
                                matcher: row.matcher,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5"
                          >
                            <Pencil size={11} />
                            Edit
                          </button>
                          <button
                            onClick={() =>
                              deleteHook(
                                row.event!,
                                row.ruleIndex!,
                                row.hookIndex!,
                              )
                            }
                            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ) : (
                        <Link
                          href="/mcp"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          View
                          <ExternalLink size={10} />
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Hook Editor Modal */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full border border-border bg-background/95 backdrop-blur-sm shadow-lg px-5 py-2.5">
          <span className="text-xs text-muted-foreground tabular-nums mr-1">
            {selected.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs gap-1.5 h-7 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            onClick={bulkDeleteHooks}
          >
            <Trash2 size={12} /> Delete
          </Button>
          <Button variant="ghost" size="sm" className="rounded-full h-7" onClick={() => setSelected(new Set())}>
            <X size={14} /> Clear
          </Button>
        </div>
      )}

      {editingHook && (
        <HookEditor
          event={editingHook.event}
          hook={editingHook.hook}
          initialMatcher={editingHook.matcher}
          onSave={(hook, meta) =>
            saveHook(hook, meta, editingHook.ruleIndex, editingHook.hookIndex)
          }
          onCancel={() => setEditingHook(null)}
        />
      )}
    </div>
  );
}
