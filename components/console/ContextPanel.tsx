"use client";

import { useState, useMemo, useEffect } from "react";
import { useProjects, useContextBreakdown } from "@/hooks/useAnalytics";
import type { ContextBreakdownCategory } from "@/hooks/useAnalytics";
import { useSessionContext } from "@/hooks/useSessionContext";
import { SystemPromptPreview } from "@/components/context/SystemPromptPreview";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Gauge,
  Zap,
  BarChart3,
  Server,
  Wrench,
  Plug,
  Bot,
  FileText,
  Sparkles,
  MessageSquare,
  Archive,
} from "lucide-react";
import type { ConsoleSession } from "@/types/console";
import type { LucideIcon } from "lucide-react";
import { AUTOCOMPACT_RATIO } from "@/lib/console/constants";

interface ContextPanelProps {
  session?: ConsoleSession | null;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function getFillTextColor(pct: number): string {
  if (pct > 85) return "text-red-400 dark:text-red-300";
  if (pct > 60) return "text-amber-400 dark:text-amber-300";
  return "text-emerald-400 dark:text-emerald-300";
}

// ── Segment color + icon mapping ────────────────────────────────

const CATEGORY_META: Record<string, { color: string; icon: LucideIcon }> = {
  system_prompt: { color: "bg-slate-500", icon: Server },
  system_tools: { color: "bg-blue-500", icon: Wrench },
  mcp_tools: { color: "bg-violet-500", icon: Plug },
  agents: { color: "bg-purple-500", icon: Bot },
  memory: { color: "bg-orange-500", icon: FileText },
  skills: { color: "bg-yellow-500", icon: Sparkles },
  messages: { color: "bg-emerald-500", icon: MessageSquare },
  autocompact: { color: "bg-muted/60", icon: Archive },
};

export function ContextPanel({ session }: ContextPanelProps) {
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const ctx = useSessionContext(session?.id ?? null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const { data: projects } = useProjects();

  // Reset project selection when switching sessions
  useEffect(() => {
    setProjectId("");
  }, [session?.id]);

  const effectiveProjectId =
    projectId || (projects && projects.length > 0 ? projects[0].id : "");

  const { data: breakdown } = useContextBreakdown(
    effectiveProjectId,
    providerScope,
  );

  const fillPct = useMemo(() => {
    if (!ctx.contextWindow || !ctx.lastTurnInputTokens) return 0;
    return Math.min(100, (ctx.lastTurnInputTokens / ctx.contextWindow) * 100);
  }, [ctx.lastTurnInputTokens, ctx.contextWindow]);

  const cacheHitRate = useMemo(() => {
    const total = ctx.turnCacheReadTokens + ctx.turnInputTokens;
    if (total === 0) return 0;
    return (ctx.turnCacheReadTokens / total) * 100;
  }, [ctx.turnCacheReadTokens, ctx.turnInputTokens]);

  const avgTokensPerTurn = useMemo(() => {
    if (ctx.turnCount === 0) return 0;
    return Math.round(
      (ctx.totalInputTokens + ctx.totalOutputTokens) / ctx.turnCount,
    );
  }, [ctx.totalInputTokens, ctx.totalOutputTokens, ctx.turnCount]);

  const hasData = ctx.turnCount > 0;
  const hasTurn = ctx.lastTurnInputTokens > 0;

  // ── Compute segments ────────────────────────────────────────────
  const segments = useMemo(() => {
    const cw = ctx.contextWindow;
    if (!cw) return [];

    const staticTotal = breakdown?.staticTotal ?? 0;
    const autocompactBuffer = Math.round(cw * AUTOCOMPACT_RATIO);
    const messagesTokens = hasTurn
      ? Math.max(0, ctx.lastTurnInputTokens - staticTotal)
      : 0;
    const usedTotal = hasTurn
      ? ctx.lastTurnInputTokens + autocompactBuffer
      : staticTotal;
    const freeSpace = Math.max(0, cw - usedTotal);

    const result: {
      key: string;
      label: string;
      tokens: number;
      pct: number;
      color: string;
      icon: LucideIcon;
      items?: ContextBreakdownCategory["items"];
    }[] = [];

    // Static categories from breakdown
    if (breakdown) {
      for (const cat of breakdown.categories) {
        if (cat.tokens === 0) continue;
        const meta = CATEGORY_META[cat.key];
        result.push({
          key: cat.key,
          label: cat.label,
          tokens: cat.tokens,
          pct: (cat.tokens / cw) * 100,
          color: meta?.color ?? "bg-gray-500",
          icon: meta?.icon ?? FileText,
          items: cat.items,
        });
      }
    }

    // Messages (only after first turn)
    if (hasTurn && messagesTokens > 0) {
      result.push({
        key: "messages",
        label: "Messages",
        tokens: messagesTokens,
        pct: (messagesTokens / cw) * 100,
        color: CATEGORY_META.messages.color,
        icon: CATEGORY_META.messages.icon,
      });
    }

    // Autocompact buffer (only show after first turn when we have real data)
    if (hasTurn) {
      result.push({
        key: "autocompact",
        label: "Autocompact Buffer",
        tokens: autocompactBuffer,
        pct: (autocompactBuffer / cw) * 100,
        color: CATEGORY_META.autocompact.color,
        icon: CATEGORY_META.autocompact.icon,
      });
    }

    // Free space
    if (freeSpace > 0) {
      result.push({
        key: "free",
        label: "Free Space",
        tokens: freeSpace,
        pct: (freeSpace / cw) * 100,
        color: "bg-muted/20",
        icon: Gauge,
      });
    }

    return result;
  }, [breakdown, ctx.contextWindow, ctx.lastTurnInputTokens, hasTurn]);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const modelLabel =
    ctx.model?.replace("claude-", "").replace(/-\d{8}$/, "") ??
    session?.model?.replace("claude-", "").replace(/-\d{8}$/, "") ??
    null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Context</span>
          {modelLabel && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
              {modelLabel}
            </span>
          )}
          {ctx.permissionMode && (
            <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
              {ctx.permissionMode}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Section A — Context Window Breakdown */}
        <div className="px-3 py-3 border-b border-border/30">
          <div className="flex items-center gap-1.5 mb-2">
            <Gauge className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {hasTurn ? "Context Window" : "Estimated Context Budget"}
            </span>
          </div>

          {/* Segmented bar */}
          <div className="h-2.5 rounded-full bg-muted/20 overflow-hidden mb-1.5 flex">
            {segments.map((seg) =>
              seg.pct > 0.1 ? (
                <div
                  key={seg.key}
                  className={`h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full ${seg.color}`}
                  style={{ width: `${seg.pct}%` }}
                  title={`${seg.label}: ${formatTokens(seg.tokens)} (${seg.pct.toFixed(1)}%)`}
                />
              ) : null,
            )}
          </div>

          {/* Summary line */}
          <div className="flex items-baseline justify-between mb-2">
            {hasTurn ? (
              <>
                <span className="text-xs font-mono text-foreground/80">
                  {formatTokens(ctx.lastTurnInputTokens)}{" "}
                  <span className="text-muted-foreground">
                    / {formatTokens(ctx.contextWindow)}
                  </span>
                </span>
                <span
                  className={`text-xs font-semibold font-mono ${getFillTextColor(fillPct)}`}
                >
                  {fillPct.toFixed(1)}%
                </span>
              </>
            ) : (
              <span className="text-xs font-mono text-muted-foreground">
                {formatTokens(breakdown?.staticTotal ?? 0)} static overhead
                <span className="text-muted-foreground/60">
                  {" "}
                  / {formatTokens(ctx.contextWindow)}
                </span>
              </span>
            )}
          </div>

          {/* Context budget alert */}
          {fillPct > 80 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-md bg-amber-500/10 border border-amber-500/20">
              <Gauge className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[10px] text-amber-400 font-medium">
                Approaching context limit — consider /compact
              </span>
            </div>
          )}

          {/* Category drill-downs */}
          <div className="space-y-0.5">
            {segments
              .filter((seg) => seg.key !== "free")
              .map((seg) => {
                const hasItems =
                  seg.items &&
                  seg.items.length > 0 &&
                  seg.key !== "autocompact";
                const isExpanded = expandedCategories.has(seg.key);
                const Icon = seg.icon;

                return (
                  <div key={seg.key}>
                    <button
                      onClick={() => hasItems && toggleCategory(seg.key)}
                      className={`flex items-center gap-1.5 w-full py-1 text-left rounded-sm ${
                        hasItems
                          ? "hover:bg-muted/30 cursor-pointer"
                          : "cursor-default"
                      } transition-colors`}
                    >
                      {hasItems ? (
                        isExpanded ? (
                          <ChevronDown className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                        )
                      ) : (
                        <span className="w-2.5 shrink-0" />
                      )}
                      <span
                        className={`w-2 h-2 rounded-[2px] shrink-0 ${seg.color}`}
                      />
                      <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[10px] text-foreground/80 truncate">
                        {seg.label}
                      </span>
                      <span className="ml-auto text-[10px] font-mono text-muted-foreground shrink-0">
                        {formatTokens(seg.tokens)}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 w-10 text-right shrink-0">
                        {seg.pct.toFixed(1)}%
                      </span>
                    </button>

                    {/* Expanded items */}
                    {hasItems && isExpanded && (
                      <div className="ml-[22px] border-l border-border/30 pl-2 mb-1">
                        {seg.items!.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-1.5 py-0.5"
                          >
                            <Icon className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
                            <span className="text-[10px] text-muted-foreground truncate flex-1">
                              {item.name}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground/80 shrink-0">
                              {formatTokens(item.tokens)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {hasData && (
          <div className="space-y-0">
            {/* Section B — Latest Turn */}
            <div className="px-3 py-3 border-b border-border/30">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Latest Turn
                </span>
                <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                  #{ctx.turnCount}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <StatRow
                  label="Input"
                  value={formatTokens(ctx.turnInputTokens)}
                />
                <StatRow
                  label="Output"
                  value={formatTokens(ctx.turnOutputTokens)}
                />
                <StatRow
                  label="Cache Read"
                  value={formatTokens(ctx.turnCacheReadTokens)}
                />
                <StatRow
                  label="Cache Write"
                  value={formatTokens(ctx.turnCacheWriteTokens)}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Cache hit rate
                </span>
                <span className="text-xs font-mono text-foreground/80">
                  {cacheHitRate.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Turn cost
                </span>
                <span className="text-xs font-mono text-foreground/80">
                  {formatCost(ctx.turnCost)}
                </span>
              </div>
            </div>

            {/* Section C — Session Totals */}
            <div className="px-3 py-3 border-b border-border/30">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Session Totals
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                <StatRow
                  label="Total Tokens"
                  value={formatTokens(
                    ctx.totalInputTokens + ctx.totalOutputTokens,
                  )}
                />
                <StatRow label="Total Cost" value={formatCost(ctx.totalCost)} />
                <StatRow label="Turns" value={ctx.turnCount.toString()} />
                <StatRow
                  label="Avg / Turn"
                  value={formatTokens(avgTokensPerTurn)}
                />
              </div>
            </div>

            {/* Section D — Git Context */}
            {ctx.gitBranch && (
              <div className="px-3 py-3 border-b border-border/30">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <GitBranch className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Git
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-foreground/80">
                    {ctx.gitBranch}
                  </span>
                  {ctx.gitDirty && (
                    <span className="px-1 py-0 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400">
                      dirty
                    </span>
                  )}
                  {ctx.isWorktree && (
                    <span className="px-1 py-0 rounded text-[9px] font-medium bg-blue-500/15 text-blue-400">
                      worktree
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section E — Instruction Files (collapsible) */}
        <div className="border-t border-border/30">
          <button
            onClick={() => setInstructionsOpen((o) => !o)}
            className="flex items-center gap-1.5 w-full px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
          >
            {instructionsOpen ? (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
            <BookOpen className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Instruction Files
            </span>
            {projects && projects.length > 0 && instructionsOpen && (
              <div className="ml-auto">
                <Select value={effectiveProjectId} onValueChange={setProjectId}>
                  <SelectTrigger className="h-6 w-auto min-w-[140px] text-[10px] gap-1">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </button>
          {instructionsOpen && (
            <SystemPromptPreview projectId={effectiveProjectId} />
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-mono text-foreground/80">{value}</span>
    </div>
  );
}
