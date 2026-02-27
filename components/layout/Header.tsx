"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useIndexer } from "@/hooks/useSessions";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import {
  useAutoIndexInterval,
  useAutoIndex,
  INTERVAL_PRESETS,
} from "@/hooks/useAutoIndexInterval";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  ChevronDown,
  Zap,
  Clock,
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  Trash2,
  Square,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";
import {
  useBlockUsage,
  useProviderAnalytics,
  useRealUsage,
  useWeekSettings,
  useUpdateBlockSettings,
} from "@/hooks/useAnalytics";
import Link from "next/link";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeWeekBounds } from "@/lib/usage/time-bounds";
import type { ConfigProvider } from "@/types/provider";
import {
  getSessionProvider,
} from "@/lib/providers/session-registry";
import {
  parseUsageProvider,
  USAGE_PROVIDER_STORAGE_KEY,
} from "@/lib/usage/provider-filter";
import { useConsole } from "@/components/providers/ConsoleProvider";
import {
  type ProcessingJob,
  useProcessingStore,
} from "@/stores/processingStore";

const pageTitles: Record<string, string> = {
  "/": "Console",
  "/sessions": "Sessions",
  "/analyze": "Review",
  "/analytics/tools": "Tool Usage",
  "/analytics/explore": "Explore",
  "/analytics": "Analytics",
  "/usage": "Usage",
  "/models": "Models",
  "/agents": "Agents",
  "/routing": "Routing",
  "/marketplace": "Marketplace",
  "/settings": "Settings",
  "/plugins": "Plugins",
  "/mcp": "MCP Servers",
  "/skills": "Skills",
  "/hooks": "Hooks",
  "/commands": "Commands",
  "/tools": "Tools",
  "/library": "Library",
  "/workflows": "Workflows",
  "/context": "Context",
};

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function formatHourLabel(hour: number): string {
  const p = hour < 12 ? "AM" : "PM";
  const d = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${d}:00 ${p}`;
}

function getUsageProviderLabel(provider: ConfigProvider | null): string {
  if (!provider) return "All providers";
  return getSessionProvider(provider)?.label ?? provider;
}

function formatDurationLabel(ms: number): string {
  const clamped = Math.max(0, ms);
  const seconds = Math.floor(clamped / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

function formatRelativeLabel(ts: number, now: number): string {
  const diffMs = Math.max(0, now - ts);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function jobStatusLabel(job: ProcessingJob): string {
  if (job.status === "running") return "Running";
  if (job.status === "completed") return "Completed";
  if (job.status === "failed") return "Failed";
  return "Canceled";
}

function jobStatusIcon(job: ProcessingJob) {
  if (job.status === "running") {
    return <Loader2 size={12} className="animate-spin text-blue-500" />;
  }
  if (job.status === "completed") {
    return <CheckCircle2 size={12} className="text-emerald-500" />;
  }
  if (job.status === "failed") {
    return <XCircle size={12} className="text-red-500" />;
  }
  return <Ban size={12} className="text-muted-foreground" />;
}

function BlockResetCountdown({ resetsAt, startedAt }: { resetsAt: string; startedAt?: string }) {
  const [resetStr, setResetStr] = useState<string | null>(null);
  useEffect(() => {
    const update = () => {
      const diff = new Date(resetsAt).getTime() - Date.now();
      if (diff <= 0) { setResetStr(null); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      setResetStr(h > 0 ? `${h}h${m}m` : `${m}m`);
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [resetsAt]);
  if (!resetStr) return null;
  return (
    <div className="flex items-center gap-1.5 text-meta text-muted-foreground">
      <Clock className="w-2.5 h-2.5" />
      {startedAt && (
        <>
          Started{" "}
          {new Date(startedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
          {" · "}
        </>
      )}
      Resets in {resetStr}
    </div>
  );
}

interface HeaderProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Header({ collapsed, onToggleCollapse }: HeaderProps) {
  const { wsState } = useConsole();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const indexer = useIndexer();
  const { data: stats } = useDashboardStats();
  const {
    interval,
    setInterval: setAutoInterval,
    loaded,
  } = useAutoIndexInterval();
  const [reindexPhase, setReindexPhase] = useState<string | null>(null);
  const [reindexMenuOpen, setReindexMenuOpen] = useState(false);
  const [reindexMode, setReindexMode] = useState<"incremental" | "rebuild" | "nuke">("incremental");
  const [blockPopoverOpen, setBlockPopoverOpen] = useState(false);
  const [processingPopoverOpen, setProcessingPopoverOpen] = useState(false);
  const [jobClockNow, setJobClockNow] = useState(() => Date.now());
  const isUsageRoute = pathname.startsWith("/usage");
  const shouldLoadUsageDetails = blockPopoverOpen;
  const shouldLoadWeekSettings = blockPopoverOpen || isUsageRoute;
  const [storedUsageProvider, setStoredUsageProvider] =
    useState<ConfigProvider | null>(null);
  const usageProvider = parseUsageProvider(searchParams.get("provider"));
  const selectedUsageProvider = usageProvider ?? storedUsageProvider;
  const { data: blockData } = useBlockUsage(
    undefined,
    undefined,
    true,
    selectedUsageProvider,
  );
  const { data: realUsage } = useRealUsage(shouldLoadUsageDetails);
  const { data: weekSettings } = useWeekSettings(shouldLoadWeekSettings);
  const updateSettings = useUpdateBlockSettings();
  const processingJobs = useProcessingStore((s) => s.jobs);
  const clearFinishedJobs = useProcessingStore((s) => s.clearFinished);
  const cancelProcessingJob = useProcessingStore((s) => s.cancelJob);
  const weekStartDay = weekSettings?.statuslineWeekStartDay ?? 0;
  const weekStartHour = weekSettings?.statuslineWeekStartHour ?? 0;
  const selectedUsageProviderLabel = getUsageProviderLabel(selectedUsageProvider);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = parseUsageProvider(
      window.localStorage.getItem(USAGE_PROVIDER_STORAGE_KEY),
    );
    setStoredUsageProvider(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (storedUsageProvider) {
      window.localStorage.setItem(
        USAGE_PROVIDER_STORAGE_KEY,
        storedUsageProvider,
      );
    } else {
      window.localStorage.removeItem(USAGE_PROVIDER_STORAGE_KEY);
    }
  }, [storedUsageProvider]);

  // Derive flat shape for template compatibility
  const blockUsage = blockData
    ? {
        cost: blockData.block.cost,
        sessions: blockData.block.sessions,
        outputTokens: blockData.block.outputTokens,
        inputTokens: blockData.block.inputTokens,
        cacheReadTokens: blockData.block.cacheReadTokens,
        cacheWriteTokens: blockData.block.cacheWriteTokens,
        resetsAt: blockData.block.resetsAt,
        startedAt: blockData.block.startedAt as string | undefined,
        resetMinutes: blockData.resetMinutes,
      }
    : null;

  // Live Anthropic usage — first section's percentage
  const livePct = realUsage?.sections?.[0]?.percentUsed ?? null;
  const liveSections = realUsage?.sections ?? [];
  const liveWeekResetsAt =
    liveSections.find((section) =>
      section.label.toLowerCase().includes("week"),
    )?.resetsAt ?? null;
  const liveError = realUsage?.error ?? null;
  const showLiveUsageForSelection =
    selectedUsageProvider === null || selectedUsageProvider === "claude";
  const providerWindow = useMemo(() => {
    if (liveWeekResetsAt) {
      const end = new Date(liveWeekResetsAt);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { from: start.toISOString(), to: end.toISOString(), label: "Live week" };
    }
    const fallback = computeWeekBounds(weekStartDay, weekStartHour);
    return {
      from: fallback.weekFrom,
      to: fallback.weekTo,
      label: "This week",
    };
  }, [liveWeekResetsAt, weekStartDay, weekStartHour]);
  const { data: providerData, isLoading: providerLoading } = useProviderAnalytics(
    providerWindow.from,
    providerWindow.to,
    {},
    blockPopoverOpen || isUsageRoute,
  );
  const providerRows = useMemo(() => {
    return (providerData?.byProvider ?? [])
      .slice()
      .sort((a, b) => b.totalCost - a.totalCost || b.sessionCount - a.sessionCount);
  }, [providerData?.byProvider]);
  const providerTotalCost = useMemo(
    () => providerRows.reduce((sum, row) => sum + row.totalCost, 0),
    [providerRows],
  );
  const hasSessionUsage = (blockUsage?.sessions ?? 0) > 0;
  const usageValue =
    showLiveUsageForSelection && livePct !== null
      ? `${livePct}%`
      : hasSessionUsage
        ? formatCost(blockUsage?.cost ?? 0)
        : "—";
  const usageValueClass =
    showLiveUsageForSelection && livePct !== null
      ? livePct >= 90
        ? "border-red-500/30 bg-red-500/10 text-red-400 dark:text-red-300"
        : livePct >= 70
          ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-500 dark:text-yellow-300"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300"
      : hasSessionUsage
        ? "border-border/60 bg-background/80 text-foreground"
        : "border-border/50 bg-background/60 text-muted-foreground";
  const runningProcessingJobs = useMemo(
    () =>
      processingJobs
        .filter((job) => job.status === "running")
        .sort((a, b) => b.startedAt - a.startedAt),
    [processingJobs],
  );
  const recentProcessingJobs = useMemo(
    () =>
      processingJobs
        .filter((job) => job.status !== "running")
        .sort(
          (a, b) =>
            (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt),
        )
        .slice(0, 24),
    [processingJobs],
  );
  const runningProcessingCount = runningProcessingJobs.length;
  const hasFailedProcessing = recentProcessingJobs.some(
    (job) => job.status === "failed",
  );

  useEffect(() => {
    if (runningProcessingCount === 0) return;
    const timer = window.setInterval(() => setJobClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [runningProcessingCount]);

  useEffect(() => {
    if (!processingPopoverOpen) return;
    setJobClockNow(Date.now());
  }, [processingPopoverOpen, processingJobs.length]);

  // Mount the auto-index timer
  useAutoIndex(interval);

  const title =
    pageTitles[pathname] ||
    pageTitles[
      Object.keys(pageTitles).find(
        (p) => p !== "/" && pathname.startsWith(p),
      ) || ""
    ] ||
    "";
  const wsConnected = wsState === "connected";
  const wsStatusLabel =
    wsState === "connected"
      ? "WS connected"
      : wsState === "connecting"
        ? "WS connecting"
        : wsState === "reconnecting"
          ? "WS reconnecting"
          : "WS disconnected";

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["sessions"] });
    queryClient.invalidateQueries({ queryKey: ["sessions-grouped"] });
    queryClient.invalidateQueries({ queryKey: ["sessions-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-projects"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-models"] });
    queryClient.invalidateQueries({ queryKey: ["analytics-tools"] });
  }, [queryClient]);

  const handleUsageProviderChange = useCallback(
    (value: string) => {
      const parsed = parseUsageProvider(value);
      setStoredUsageProvider(parsed);
      if (!isUsageRoute) return;
      const params = new URLSearchParams(searchParams.toString());
      if (parsed) {
        params.set("provider", parsed);
      } else {
        params.delete("provider");
      }
      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [isUsageRoute, searchParams, pathname, router],
  );

  const handleReindex = useCallback(
    async (mode: "incremental" | "rebuild" | "nuke" = "incremental") => {
      setReindexMenuOpen(false);

      // Destructive modes are one-shot — reset to incremental immediately
      // so the next button click won't accidentally re-run rebuild/nuke
      if (mode !== "incremental") {
        setReindexMode("incremental");
      }

      if (mode === "incremental") {
        setReindexPhase("Syncing");
        try {
          await indexer.incrementalSync();
          invalidateAll();
        } catch {}
      } else if (mode === "rebuild") {
        setReindexPhase("Rebuilding");
        try {
          await indexer.rebuild();
          invalidateAll();
        } catch {}
      } else {
        setReindexPhase("Clearing");
        try {
          await indexer.nukeAndRebuild();
          invalidateAll();
        } catch {}
      }

      // Instructions scan (includes routing files via fullScan)
      setReindexPhase("Instructions");
      try {
        await fetch("/api/instructions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "scan" }),
        });
        queryClient.invalidateQueries({ queryKey: ["instructions"] });
      } catch {}

      // Routing graph refresh (derives edges from instruction_files)
      setReindexPhase("Routing graph");
      try {
        const res = await fetch("/api/routing/scan?provider=all", {
          method: "POST",
        });
        if (res.ok) {
          await res.text();
          queryClient.invalidateQueries({ queryKey: ["routing-graph"] });
          queryClient.invalidateQueries({ queryKey: ["routing-entrypoints"] });
        }
      } catch {}

      setReindexPhase(null);
    },
    [indexer, queryClient, invalidateAll],
  );

  return (
    <header className="h-12 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center">
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="mr-2.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
            >
              {collapsed ? (
                <PanelLeft size={14} strokeWidth={1.5} />
              ) : (
                <PanelLeftClose size={14} strokeWidth={1.5} />
              )}
            </button>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold tracking-tight">
                {title}
              </h2>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!wsConnected && (
            <div
              className="hidden items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-400 sm:flex"
              title="Live terminal WebSocket is unavailable. Console live actions are paused, and AI Assist flows that rely on CLI execution may fail until reconnect."
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
              </span>
              {wsStatusLabel}
            </div>
          )}
          <Popover
            open={processingPopoverOpen}
            onOpenChange={setProcessingPopoverOpen}
          >
            <PopoverTrigger asChild>
              <button
                className="group flex h-8 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 text-xs transition-colors hover:bg-muted/50 data-[state=open]:border-primary/30 data-[state=open]:bg-primary/5"
                title="View AI processing activity and history"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-border/50 bg-background/70">
                  {runningProcessingCount > 0 ? (
                    <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                  ) : (
                    <Activity className="h-3 w-3 text-muted-foreground" />
                  )}
                </span>
                <span className="font-medium text-foreground/85">
                  Processing
                </span>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 font-medium tabular-nums",
                    runningProcessingCount > 0
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300"
                      : hasFailedProcessing
                        ? "border-red-500/30 bg-red-500/10 text-red-500 dark:text-red-300"
                        : "border-border/60 bg-background/80 text-muted-foreground",
                  )}
                >
                  {runningProcessingCount > 0
                    ? `${runningProcessingCount} running`
                    : `${recentProcessingJobs.length} recent`}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-[360px] overflow-hidden rounded-xl border-border/70 bg-card/95 p-0 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border/50 bg-background/85 px-3 py-2.5">
                <div className="min-w-0 space-y-0.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                    AI Processing
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Tracks currently running AI assists across app features.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearFinishedJobs}
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Trash2 size={11} />
                  Clear
                </button>
              </div>
              <ScrollArea className="max-h-[420px]">
                <div className="space-y-3 p-2.5">
                  <section className="space-y-1.5">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Running now
                    </div>
                    {runningProcessingJobs.length === 0 ? (
                      <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
                        No active processing jobs.
                      </div>
                    ) : (
                      runningProcessingJobs.map((job) => (
                        <div
                          key={job.id}
                          className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {job.title}
                              </p>
                              {job.subtitle && (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {job.subtitle}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  cancelProcessingJob(
                                    job.id,
                                    "Stopped from AI Processing panel",
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                                title="Stop this running job"
                              >
                                <Square size={10} />
                                Stop
                              </button>
                              {jobStatusIcon(job)}
                            </div>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {job.provider ? `${job.provider} · ` : ""}
                              {jobStatusLabel(job)}
                            </span>
                            <span>
                              {formatDurationLabel(jobClockNow - job.startedAt)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </section>

                  <section className="space-y-1.5">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Recent history
                    </div>
                    {recentProcessingJobs.length === 0 ? (
                      <div className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
                        No completed jobs yet.
                      </div>
                    ) : (
                      recentProcessingJobs.map((job) => (
                        <div
                          key={job.id}
                          className="rounded-md border border-border/60 bg-background/70 px-2.5 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-foreground">
                                {job.title}
                              </p>
                              {job.subtitle && (
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {job.subtitle}
                                </p>
                              )}
                              {job.error && (
                                <p className="mt-0.5 line-clamp-2 text-[11px] text-red-500/90 dark:text-red-300">
                                  {job.error}
                                </p>
                              )}
                            </div>
                            {jobStatusIcon(job)}
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {job.provider ? `${job.provider} · ` : ""}
                              {jobStatusLabel(job)}
                            </span>
                            <span>
                              {job.durationMs != null
                                ? formatDurationLabel(job.durationMs)
                                : formatRelativeLabel(
                                    job.finishedAt ?? job.startedAt,
                                    jobClockNow,
                                  )}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </section>
                </div>
              </ScrollArea>
            </PopoverContent>
          </Popover>
          {blockUsage && (
            <div className="flex items-center gap-2">
              <Popover
                open={blockPopoverOpen}
                onOpenChange={setBlockPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <button
                    className="group flex h-8 items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2.5 text-xs transition-colors hover:bg-muted/50 data-[state=open]:border-primary/30 data-[state=open]:bg-primary/5"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-md border border-border/50 bg-background/70">
                      <Zap className="h-3 w-3 text-yellow-500 dark:text-yellow-400" />
                    </span>
                    <span className="font-medium text-foreground/85">Usage</span>
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 font-medium tabular-nums",
                        usageValueClass,
                      )}
                    >
                      {usageValue}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="bottom"
                  align="end"
                  className="w-[304px] overflow-hidden rounded-xl border-border/70 bg-card/95 p-0 shadow-xl"
                >
                  <div className="border-b border-border/50 bg-background/85 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                        Usage Snapshot
                      </span>
                      <span
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
                          usageValueClass,
                        )}
                      >
                        {usageValue}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 p-2.5">
                    <section className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-foreground">
                          Provider Filter
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                          {providerWindow.label}
                        </span>
                      </div>
                      {providerLoading ? (
                        <p className="text-xs text-muted-foreground">
                          Loading provider usage...
                        </p>
                      ) : providerRows.length > 0 ? (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => handleUsageProviderChange("all")}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors",
                              selectedUsageProvider === null
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border/60 bg-background/70 text-muted-foreground hover:text-foreground hover:border-border",
                            )}
                          >
                            <span className="font-medium">All providers</span>
                            <span className="tabular-nums">
                              {formatCost(providerTotalCost)}
                            </span>
                          </button>
                          {providerRows.map((row) => {
                            const provider = parseUsageProvider(row.provider);
                            const isActive = selectedUsageProvider === provider;
                            const providerLabel = provider
                              ? (getSessionProvider(provider)?.label ?? row.provider)
                              : row.provider;
                            const share =
                              providerTotalCost > 0
                                ? Math.round((row.totalCost / providerTotalCost) * 100)
                                : null;
                            return (
                              <button
                                key={row.provider}
                                type="button"
                                onClick={() => handleUsageProviderChange(row.provider)}
                                className={cn(
                                  "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs transition-colors",
                                  isActive
                                    ? "border-primary/40 bg-primary/10 text-primary"
                                    : "border-border/60 bg-background/70 text-muted-foreground hover:text-foreground hover:border-border",
                                )}
                              >
                                <span className="font-medium">
                                  {providerLabel}
                                </span>
                                <span className="tabular-nums">
                                  {formatCost(row.totalCost)}
                                  {share !== null ? ` · ${share}%` : ""}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No provider usage found in this window.
                        </p>
                      )}
                    </section>
                    {/* Live Anthropic usage bars */}
                    {showLiveUsageForSelection && liveSections.length > 0 && (
                      <section className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 dark:bg-green-300 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500 dark:bg-green-400" />
                          </span>
                          <span className="text-[11px] font-medium text-muted-foreground">Live from Anthropic</span>
                        </div>
                        {liveSections.map((section) => (
                          <div key={section.label} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground font-medium">{section.label}</span>
                              {section.percentUsed !== null && (
                                <span
                                  className={`font-medium tabular-nums ${
                                    section.percentUsed >= 80
                                      ? "text-red-400 dark:text-red-300"
                                      : section.percentUsed >= 50
                                        ? "text-yellow-400 dark:text-yellow-300"
                                        : "text-green-400 dark:text-green-300"
                                  }`}
                                >
                                  {section.percentUsed}%
                                </span>
                              )}
                            </div>
                            {section.percentUsed !== null && (
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    section.percentUsed >= 80
                                      ? "bg-red-500 dark:bg-red-400"
                                      : section.percentUsed >= 50
                                        ? "bg-yellow-500 dark:bg-yellow-400"
                                        : "bg-green-500 dark:bg-green-400"
                                  }`}
                                  style={{ width: `${section.percentUsed}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </section>
                    )}
                    {!showLiveUsageForSelection && (
                      <section className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">
                          Live Anthropic usage is only available for Claude.
                          Showing local session metrics for {selectedUsageProviderLabel}.
                        </p>
                      </section>
                    )}
                    {showLiveUsageForSelection && liveSections.length === 0 && (
                      <section className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">
                          Live usage is unavailable right now
                          {liveError ? ` (${liveError})` : ""}. Showing local session metrics below.
                        </p>
                      </section>
                    )}

                    <section className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          {Math.round(blockUsage.resetMinutes / 60)}h Block Analytics ·{" "}
                          {selectedUsageProviderLabel}
                        </span>
                        <span className="text-meta text-muted-foreground">
                          {blockUsage.sessions} sessions
                        </span>
                      </div>

                      {blockUsage.sessions > 0 ? (
                        <div className="space-y-2">
                          <div className="text-xs tabular-nums">
                            <span className="text-foreground font-medium">
                              {formatCost(blockUsage.cost)}
                            </span>
                            <span className="text-muted-foreground"> est. cost</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                              <div className="text-muted-foreground text-meta">Input</div>
                              <div className="font-medium">{formatTokens(blockUsage.inputTokens)}</div>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                              <div className="text-muted-foreground text-meta">Output</div>
                              <div className="font-medium">{formatTokens(blockUsage.outputTokens)}</div>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                              <div className="text-muted-foreground text-meta">Cache read</div>
                              <div className="font-medium">{formatTokens(blockUsage.cacheReadTokens)}</div>
                            </div>
                            <div className="rounded-md border border-border/50 bg-background/70 px-2 py-1.5">
                              <div className="text-muted-foreground text-meta">Cache write</div>
                              <div className="font-medium">{formatTokens(blockUsage.cacheWriteTokens)}</div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No sessions in the last {Math.round(blockUsage.resetMinutes / 60)} hours
                        </p>
                      )}

                      {blockUsage.resetsAt && (
                        <BlockResetCountdown resetsAt={blockUsage.resetsAt} startedAt={blockUsage.startedAt} />
                      )}

                      <div className="flex items-center justify-between rounded-md border border-border/50 bg-background/70 px-2 py-1.5 text-xs">
                        <span className="text-muted-foreground">Block duration</span>
                        <span className="font-medium tabular-nums">{blockUsage.resetMinutes}m</span>
                      </div>
                    </section>

                    <section className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
                      <div>
                        <p className="text-xs font-medium text-foreground">Week Boundary</p>
                        <p className="text-[11px] text-muted-foreground">
                          Used when live weekly usage resets are unavailable.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Start day</span>
                          <Select
                            value={String(weekStartDay)}
                            onValueChange={(v) =>
                              updateSettings.mutate({
                                statuslineWeekStartDay: parseInt(v, 10),
                              })
                            }
                          >
                            <SelectTrigger size="sm" className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WEEK_DAYS.map((day, i) => (
                                <SelectItem key={day} value={String(i)}>
                                  {day}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                        <label className="space-y-1">
                          <span className="text-[11px] text-muted-foreground">Start time</span>
                          <Select
                            value={String(weekStartHour)}
                            onValueChange={(v) =>
                              updateSettings.mutate({
                                statuslineWeekStartHour: parseInt(v, 10),
                              })
                            }
                          >
                            <SelectTrigger size="sm" className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, h) => (
                                <SelectItem key={h} value={String(h)}>
                                  {formatHourLabel(h)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                    </section>

                    <Link
                      href="/usage"
                      onClick={() => setBlockPopoverOpen(false)}
                      className="flex h-8 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background/75 text-xs font-medium text-foreground transition-colors hover:bg-muted/60"
                    >
                      <Zap size={12} />
                      Open Usage Dashboard
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-2 py-1">
          {stats?.lastIndexedAt && (
            <span
              className="hidden text-xs font-mono text-muted-foreground lg:inline"
              title={new Date(stats.lastIndexedAt).toString()}
            >
              indexed{" "}
              {new Date(stats.lastIndexedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground rounded-r-none pr-1.5"
              onClick={() => handleReindex(reindexMode)}
              disabled={!!reindexPhase}
            >
              <RefreshCw
                size={12}
                className={reindexPhase ? "animate-spin" : ""}
              />
              {reindexPhase
                ? reindexPhase + "..."
                : reindexMode === "incremental"
                  ? "Sync"
                  : reindexMode === "rebuild"
                    ? "Rebuild"
                    : "Nuke"}
            </Button>
            <Popover open={reindexMenuOpen} onOpenChange={setReindexMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-5 p-0 text-muted-foreground hover:text-foreground rounded-l-none border-l border-border/30"
                  disabled={!!reindexPhase}
                >
                  <ChevronDown size={10} />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="end"
                className="w-[220px] p-1"
              >
                <button
                  className={`w-full text-left px-2.5 py-2 rounded-sm hover:bg-muted transition-colors ${reindexMode === "incremental" ? "bg-muted/50" : ""}`}
                  onClick={() => { setReindexMode("incremental"); setReindexMenuOpen(false); }}
                >
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    Incremental sync
                    {reindexMode === "incremental" && <span className="text-micro text-primary">&#10003;</span>}
                  </div>
                  <div className="text-micro text-muted-foreground">
                    Only new & changed sessions
                  </div>
                </button>
                <button
                  className={`w-full text-left px-2.5 py-2 rounded-sm hover:bg-muted transition-colors ${reindexMode === "rebuild" ? "bg-muted/50" : ""}`}
                  onClick={() => { setReindexMode("rebuild"); setReindexMenuOpen(false); }}
                >
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    Full rebuild
                    {reindexMode === "rebuild" && <span className="text-micro text-primary">&#10003;</span>}
                  </div>
                  <div className="text-micro text-muted-foreground">
                    Re-parse all session files
                  </div>
                </button>
                <div className="border-t border-border/50 my-1" />
                <button
                  className={`w-full text-left px-2.5 py-2 rounded-sm hover:bg-destructive/10 transition-colors group ${reindexMode === "nuke" ? "bg-destructive/5" : ""}`}
                  onClick={() => { setReindexMode("nuke"); setReindexMenuOpen(false); }}
                >
                  <div className="text-xs font-medium text-destructive flex items-center gap-1.5">
                    Clear & rebuild
                    {reindexMode === "nuke" && <span className="text-micro">&#10003;</span>}
                  </div>
                  <div className="text-micro text-muted-foreground group-hover:text-destructive/70">
                    Delete all data, rebuild from scratch
                  </div>
                </button>
              </PopoverContent>
            </Popover>
          </div>
          {loaded && (
            <select
              className="h-7 rounded-md border border-border/60 bg-background/80 px-2 text-xs text-muted-foreground"
              value={String(interval)}
              onChange={(e) => setAutoInterval(Number(e.target.value))}
            >
              {INTERVAL_PRESETS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          </div>
        </div>
      </div>
    </header>
  );
}
