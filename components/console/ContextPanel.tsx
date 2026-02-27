"use client";

import { useState, useMemo, useEffect } from "react";
import { useProjects } from "@/hooks/useAnalytics";
import { useSessionContext } from "@/hooks/useSessionContext";
import { SystemPromptPreview } from "@/components/context/SystemPromptPreview";
import { useConsole } from "@/components/providers/ConsoleProvider";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import { useConsoleLayoutStore } from "@/stores/consoleLayoutStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BookOpen,
  GitBranch,
  Zap,
  BarChart3,
} from "lucide-react";
import type { ConsoleSession } from "@/types/console";
import type { ConfigProvider } from "@/types/provider";
import {
  inferProviderFromCommand,
  inferProviderFromModel,
} from "@/lib/console/cli-launch";
import type { Project } from "@/types/session";

interface ContextPanelProps {
  session?: ConsoleSession | null;
  terminalId?: string;
}

const PROVIDER_OPTIONS: ReadonlyArray<{
  value: ConfigProvider;
  label: string;
}> = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatCost(n: number): string {
  if (n < 0.01 && n > 0) return "<$0.01";
  return `$${n.toFixed(2)}`;
}

function shortenCwd(cwd: string): string {
  if (!cwd) return cwd;
  const normalized = cwd.replace(/\\/g, "/");
  if (normalized.includes("/.claude/projects/")) {
    return "~/.claude/projects/<session-store>";
  }
  if (/^[A-Za-z]:\\Users\\/.test(cwd)) {
    return cwd.replace(/^[A-Za-z]:\\Users\\[^\\]+/, "~");
  }
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

function getProjectRootPath(project: Project): string | null {
  if (typeof project.realPath === "string" && project.realPath.trim()) {
    return project.realPath.trim();
  }
  if (typeof project.path === "string" && project.path.trim()) {
    const raw = project.path.trim();
    const normalized = raw.replace(/\\/g, "/");
    // Ignore Claude's internal transcript store paths for project matching.
    if (!normalized.includes("/.claude/projects/")) return raw;
  }
  return null;
}

export function ContextPanel({ session, terminalId }: ContextPanelProps) {
  const { sessions, activeSession } = useConsole();
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const terminals = useConsoleLayoutStore((s) => s.terminals);
  const fallbackSessionId = session?.id ?? null;
  const targetTerminalId = terminalId ?? session?.terminalId ?? null;
  const targetTerminalMeta = useMemo(() => {
    if (targetTerminalId && terminals[targetTerminalId]) {
      return terminals[targetTerminalId];
    }
    if (!fallbackSessionId) return undefined;
    return Object.values(terminals).find((meta) => meta.sessionId === fallbackSessionId);
  }, [fallbackSessionId, targetTerminalId, terminals]);
  const targetSession = useMemo(() => {
    const metaSessionId = targetTerminalMeta?.sessionId;
    if (metaSessionId && sessions.has(metaSessionId)) {
      return sessions.get(metaSessionId) ?? null;
    }
    if (fallbackSessionId && sessions.has(fallbackSessionId)) {
      return sessions.get(fallbackSessionId) ?? session ?? null;
    }
    return session ?? activeSession ?? null;
  }, [
    activeSession,
    fallbackSessionId,
    session,
    sessions,
    targetTerminalMeta?.sessionId,
  ]);
  const ctx = useSessionContext(targetSession?.id ?? null);
  const [projectId, setProjectId] = useState<string>("");
  const [previewProvider, setPreviewProvider] =
    useState<ConfigProvider>(providerScope);
  const { data: projects, refetch: refetchProjects } = useProjects();

  // Keep project selection anchored to the active terminal folder/session.
  useEffect(() => {
    setProjectId("");
  }, [activeSession?.id, activeSession?.cwd, targetSession?.id, targetTerminalMeta?.cwd]);

  // Pull latest projects so instruction preview follows indexer/background updates.
  useEffect(() => {
    if (!targetTerminalMeta?.cwd && !targetSession?.cwd) return;
    void refetchProjects();
  }, [refetchProjects, targetSession?.cwd, targetTerminalMeta?.cwd]);

  const sessionCommand = useMemo(() => {
    const pieces = [
      targetTerminalMeta?.command ?? "",
      ...(targetTerminalMeta?.args ?? []),
    ];
    return pieces.join(" ").trim();
  }, [targetTerminalMeta?.args, targetTerminalMeta?.command]);
  const activeCwd = targetTerminalMeta?.cwd ?? targetSession?.cwd ?? null;
  const runtimeModel =
    ctx.model ?? targetTerminalMeta?.model ?? targetSession?.model ?? null;
  const runtimeProvider = useMemo<ConfigProvider | null>(() => {
    if (targetSession?.provider) return targetSession.provider;
    const providerFromCommand = inferProviderFromCommand(sessionCommand);
    if (providerFromCommand) return providerFromCommand;
    const providerFromModel = inferProviderFromModel(runtimeModel);
    if (providerFromModel) return providerFromModel;
    return null;
  }, [runtimeModel, sessionCommand, targetSession?.provider]);
  const runtimeModelProvider = inferProviderFromModel(runtimeModel);
  const showRuntimeModel =
    !!runtimeModel &&
    (!runtimeProvider ||
      !runtimeModelProvider ||
      runtimeModelProvider === runtimeProvider);

  useEffect(() => {
    setPreviewProvider(runtimeProvider ?? providerScope);
  }, [runtimeProvider, providerScope, targetSession?.id, targetTerminalId]);
  const effectiveProvider = previewProvider;
  const sessionProjectId = useMemo(() => {
    if (!projects || projects.length === 0) return "";
    const currentCwd = activeCwd;
    if (!currentCwd) return "";
    const cwd = currentCwd.replace(/\\/g, "/");
    let bestMatch: (typeof projects)[number] | null = null;
    let bestMatchPathLength = -1;
    for (const project of projects) {
      const projectRoot = getProjectRootPath(project);
      if (!projectRoot) continue;
      const projectPath = projectRoot.replace(/\\/g, "/");
      if (cwd === projectPath || cwd.startsWith(`${projectPath}/`)) {
        if (!bestMatch || projectPath.length > bestMatchPathLength) {
          bestMatch = project;
          bestMatchPathLength = projectPath.length;
        }
      }
    }
    return bestMatch?.id ?? "";
  }, [activeCwd, projects]);
  const effectiveProjectId = projectId || sessionProjectId;

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

  const modelLabel =
    showRuntimeModel && runtimeModel
      ? runtimeModel.replace(/-\d{8}$/, "")
      : null;
  const runtimeProviderLabel = runtimeProvider
    ? PROVIDER_OPTIONS.find((option) => option.value === runtimeProvider)?.label ??
      runtimeProvider
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Runtime</span>
          {runtimeProviderLabel && (
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
              {runtimeProviderLabel}
            </span>
          )}
          {modelLabel && (
            <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
              {modelLabel}
            </span>
          )}
          {ctx.permissionMode && (
            <span className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-medium text-muted-foreground">
              {ctx.permissionMode}
            </span>
          )}
        </div>
        <div className="mt-1 text-[10px] font-mono text-muted-foreground truncate">
          {activeCwd ? shortenCwd(activeCwd) : "No folder detected"}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasData && (
          <div className="px-3 py-3 border-b border-border/30">
            <div className="text-[10px] text-muted-foreground">
              Runtime metrics will populate as this terminal emits usage updates.
            </div>
          </div>
        )}

        {hasData && (
          <div className="space-y-0">
            {/* Section A — Latest Turn */}
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

            {/* Section B — Session Totals */}
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

            {/* Section C — Git Context */}
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

        {/* Section D — Instruction Files */}
        <div className="border-t border-border/30">
          <div className="flex items-center gap-1.5 w-full px-3 py-2.5 text-left border-b border-border/30">
            <BookOpen className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Instruction Files
            </span>
            {activeCwd && (
              <span
                className="max-w-[180px] truncate rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                title={activeCwd}
              >
                {shortenCwd(activeCwd)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/70 p-0.5">
                {PROVIDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPreviewProvider(option.value)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                      effectiveProvider === option.value
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                    }`}
                    title={`Show ${option.label} instruction context`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {projects && projects.length > 0 && (
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
              )}
            </div>
          </div>
          {effectiveProjectId ? (
            <SystemPromptPreview
              projectId={effectiveProjectId}
              provider={effectiveProvider}
            />
          ) : (
            <div className="px-3 py-3 text-xs text-muted-foreground">
              No project detected for this session yet.
            </div>
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
