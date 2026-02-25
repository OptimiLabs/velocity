"use client";

import { use, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageList } from "@/components/sessions/MessageList";
import { SessionSidebar } from "@/components/sessions/SessionSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Terminal, GitBranch, Network, Clock3, Timer, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatCost, formatTokens, getTotalTokens } from "@/lib/cost/calculator";
import { format } from "date-fns";
import {
  computeCacheEfficiency,
  computeCostPerMessage,
} from "@/lib/cost/analysis";
import { mergeStreamingTranscriptMessages } from "@/lib/sessions/transcript-normalizer";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { Session } from "@/types/session";
import { useAppSettings, useUpdateAppSettings } from "@/hooks/useAppSettings";

interface ChildSession {
  id: string;
  subagent_type: string | null;
  total_cost: number;
  created_at: string;
  summary: string | null;
  first_prompt: string | null;
}

interface ParentSession {
  id: string;
  summary: string | null;
  first_prompt: string | null;
}

interface SessionWithRelations extends Session {
  children?: ChildSession[];
  parent?: ParentSession | null;
}

interface MessagesResponse {
  messages: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function shortenProjectPath(value: string | null): string {
  if (!value) return "";
  return value.replace(/^\/Users\/[^/]+/, "~");
}

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function readUsageTokenValue(
  usage: Record<string, unknown> | undefined,
  keys: string[],
): number {
  if (!usage) return 0;
  for (const key of keys) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function getLoadedCacheTotals(messages: unknown[]): {
  read: number;
  write: number;
} {
  let read = 0;
  let write = 0;

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const msg = message as { message?: { usage?: Record<string, unknown> } };
    const usage = msg.message?.usage;
    if (!usage || typeof usage !== "object") continue;

    read += readUsageTokenValue(usage, [
      "cache_read_input_tokens",
      "cache_read_tokens",
      "cached_input_tokens",
      "cacheReadInputTokens",
      "cacheReadTokens",
      "cachedInputTokens",
    ]);
    write += readUsageTokenValue(usage, [
      "cache_creation_input_tokens",
      "cache_creation_tokens",
      "cache_write_input_tokens",
      "cache_write_tokens",
      "cacheCreationInputTokens",
      "cacheCreationTokens",
      "cacheWriteInputTokens",
      "cacheWriteTokens",
    ]);
  }

  return { read, write };
}

function MetricTile({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/70 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      <div className={emphasize ? "mt-1 text-base font-semibold tabular-nums" : "mt-1 text-sm font-medium tabular-nums"}>
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-muted-foreground/60">
          {hint}
        </div>
      )}
    </div>
  );
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [allMessages, setAllMessages] = useState<unknown[]>([]);
  const [oldestLoadedPage, setOldestLoadedPage] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [autoLoadAll, setAutoLoadAll] = useState(false);
  const autoLoadPrefReadyRef = useRef(false);
  const appAutoLoadInitializedRef = useRef(false);
  const lastPersistedAutoLoadRef = useRef<boolean | null>(null);
  const { data: appSettings } = useAppSettings();
  const updateAppSettings = useUpdateAppSettings();

  // Hydrate auto-load preference from app settings (fallback: localStorage)
  useEffect(() => {
    if (appAutoLoadInitializedRef.current) return;

    const settingValue = appSettings?.sessionAutoLoadAll;
    if (typeof settingValue === "boolean") {
      setAutoLoadAll(settingValue);
      lastPersistedAutoLoadRef.current = settingValue;
      appAutoLoadInitializedRef.current = true;
      autoLoadPrefReadyRef.current = true;
      return;
    }

    const stored = localStorage.getItem("session-autoload-all");
    const fallback = stored === "true";
    setAutoLoadAll(fallback);
    lastPersistedAutoLoadRef.current = fallback;
    appAutoLoadInitializedRef.current = true;
    autoLoadPrefReadyRef.current = true;
  }, [appSettings?.sessionAutoLoadAll]);

  useEffect(() => {
    if (!autoLoadPrefReadyRef.current) return;
    localStorage.setItem("session-autoload-all", String(autoLoadAll));
    if (lastPersistedAutoLoadRef.current === autoLoadAll) return;
    lastPersistedAutoLoadRef.current = autoLoadAll;
    updateAppSettings.mutate({ sessionAutoLoadAll: autoLoadAll });
  }, [autoLoadAll, updateAppSettings]);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session", id],
    queryFn: async (): Promise<SessionWithRelations> => {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error("Session not found");
      return res.json();
    },
  });

  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["session-messages", id],
    queryFn: async (): Promise<MessagesResponse> => {
      const res = await fetch(`/api/sessions/${id}/messages`);
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!session,
  });

  // Initialize allMessages when first page loads
  const messages =
    allMessages.length > 0 ? allMessages : messagesData?.messages || [];
  const normalizedMessages = useMemo(
    () => mergeStreamingTranscriptMessages(messages as Array<{
      type: string;
      [key: string]: unknown;
    }>),
    [messages],
  );
  const loadedMessageCount = normalizedMessages.length;
  const effectiveTotalMessages = messagesData
    ? Math.max(messagesData.total, loadedMessageCount)
    : loadedMessageCount;
  const pagination = messagesData
    ? {
        total: effectiveTotalMessages,
        page: oldestLoadedPage ?? messagesData.page,
        totalPages: Math.max(
          messagesData.totalPages,
          Math.ceil(effectiveTotalMessages / Math.max(messagesData.pageSize, 1)),
        ),
        hasMore: (oldestLoadedPage ?? messagesData.page) > 1,
      }
    : undefined;

  // Shared helper: fetch a single page and prepend it
  const fetchAndPrependPage = useCallback(
    async (pageNum: number): Promise<boolean> => {
      const res = await fetch(
        `/api/sessions/${id}/messages?page=${pageNum}`,
      );
      if (!res.ok) return false;
      const data: MessagesResponse = await res.json();

      setAllMessages((prev) => {
        const current =
          prev.length > 0 ? prev : messagesData?.messages || [];
        return [...data.messages, ...current];
      });
      setOldestLoadedPage(pageNum);
      return true;
    },
    [id, messagesData],
  );

  const loadOlder = useCallback(async () => {
    if (!messagesData || loadingOlder) return;
    const nextPage = (oldestLoadedPage ?? messagesData.page) - 1;
    if (nextPage < 1) return;

    setLoadingOlder(true);
    try {
      await fetchAndPrependPage(nextPage);
    } finally {
      setLoadingOlder(false);
    }
  }, [messagesData, oldestLoadedPage, loadingOlder, fetchAndPrependPage]);

  // Incremental load-all: walks backward one page at a time so the UI updates progressively
  const loadAllRef = useRef(false);
  const loadAll = useCallback(async () => {
    if (!messagesData || loadAllRef.current) return;
    loadAllRef.current = true;
    setLoadingAll(true);

    try {
      let current = oldestLoadedPage ?? messagesData.page;
      while (current > 1) {
        const nextPage = current - 1;
        const ok = await fetchAndPrependPage(nextPage);
        if (!ok) break;
        current = nextPage;
      }
    } finally {
      setLoadingAll(false);
      loadAllRef.current = false;
    }
  }, [messagesData, oldestLoadedPage, fetchAndPrependPage]);

  // Auto-load: when enabled and initial data arrives with more pages, start loading
  useEffect(() => {
    if (!autoLoadAll || !messagesData || messagesData.page <= 1) return;
    if (loadAllRef.current || loadingAll) return;
    // Only trigger if we haven't already loaded everything
    const currentOldest = oldestLoadedPage ?? messagesData.page;
    if (currentOldest <= 1) return;
    loadAll();
  }, [autoLoadAll, messagesData, oldestLoadedPage, loadAll, loadingAll]);

  if (sessionLoading) {
    return (
      <PageContainer>
        <PageScaffold
          title="Session Detail"
          subtitle="Loading session transcript, metrics, and related context."
        >
          <div className="space-y-4 rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5">
            <Skeleton className="h-8 w-48" />
            <div className="flex gap-6">
              <Skeleton className="flex-1 h-96" />
              <Skeleton className="w-64 h-96" />
            </div>
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  if (!session) {
    return (
      <PageContainer>
        <PageScaffold
          title="Session Detail"
          subtitle="Session transcript and metadata are unavailable."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5">
            <div className="text-center py-12">
              <div className="text-sm text-muted-foreground mb-4">
                Session not found
              </div>
              <Link href="/sessions?tab=sessions">
                <Button variant="outline" size="sm">
                  <ArrowLeft size={14} />
                  Back to sessions
                </Button>
              </Link>
            </div>
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  const cacheEff = computeCacheEfficiency(session);
  const cachePct = cacheEff.hitRate * 100;
  const costPerMsg = computeCostPerMessage(session);
  const tags = parseTags(session.tags);
  const sessionPathLabel = shortenProjectPath(session.project_path);
  const totalTokens = getTotalTokens(session);
  const loadedCacheTotals = getLoadedCacheTotals(normalizedMessages);
  const effectiveCacheRead = Math.max(
    session.cache_read_tokens,
    loadedCacheTotals.read,
  );
  const effectiveCacheWrite = Math.max(
    session.cache_write_tokens,
    loadedCacheTotals.write,
  );
  const cacheHint = effectiveCacheWrite > 0
    ? `${formatTokens(effectiveCacheRead)} read · ${formatTokens(effectiveCacheWrite)} write`
    : `${formatTokens(effectiveCacheRead)} read`;
  const visibleMessageCount = loadedMessageCount;
  const remainingMessages = Math.max(
    0,
    effectiveTotalMessages - visibleMessageCount,
  );

  return (
    <PageContainer>
      <PageScaffold
        title="Session Detail"
        subtitle="Inspect transcript history, performance metrics, and linked subagent sessions for this run."
        actions={
          <Link href="/sessions?tab=sessions">
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <ArrowLeft size={14} />
              Back
            </Button>
          </Link>
        }
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-border/50 bg-card/60 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-border/35 bg-background/15">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {session.id.slice(0, 12)}
                </Badge>
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {session.session_role}
                </Badge>
                {session.provider && (
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {session.provider}
                  </Badge>
                )}
                {session.subagent_type && (
                  <Badge variant="secondary" className="text-[10px]">
                    {session.subagent_type}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
                <h2 className="text-base sm:text-lg font-semibold tracking-tight truncate">
                  {session.slug || session.id.slice(0, 12)}
                </h2>
              </div>
              {(session.summary || session.first_prompt) && (
                <p className="text-sm text-muted-foreground/80 max-w-4xl leading-relaxed">
                  {session.summary || session.first_prompt}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {session.git_branch && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2 py-1">
                    <GitBranch size={11} />
                    <span className="font-mono">{session.git_branch}</span>
                  </span>
                )}
                {sessionPathLabel && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2 py-1 max-w-full"
                    title={session.project_path || ""}
                  >
                    <span className="truncate">{sessionPathLabel}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2 py-1">
                  <Clock3 size={11} />
                  {format(new Date(session.created_at), "MMM d, yyyy HH:mm")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-2 py-1">
                  <Timer size={11} />
                  Updated {format(new Date(session.modified_at), "HH:mm")}
                </span>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tags.slice(0, 10).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      #{tag}
                    </Badge>
                  ))}
                  {tags.length > 10 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{tags.length - 10}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() =>
                  router.push(
                    `/analyze?ids=${encodeURIComponent(session.id)}&scope=metrics,summaries`,
                  )
                }
              >
                <Sparkles size={13} />
                Review Session
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() =>
                  router.push(
                    `/?resume=${session.id}&cwd=${encodeURIComponent(session.project_path || "")}`,
                  )
                }
              >
                <Terminal size={13} />
                Open in Console
              </Button>
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5 bg-card/15">
          <MetricTile label="Cost" value={formatCost(session.total_cost)} emphasize />
          <MetricTile label="Messages" value={session.message_count.toLocaleString()} />
          <MetricTile label="Tools" value={session.tool_call_count.toLocaleString()} />
          <MetricTile label="Tokens" value={formatTokens(totalTokens)} />
          <MetricTile
            label="Cache"
            value={`${cachePct.toFixed(0)}%`}
            hint={cacheHint}
          />
          <MetricTile label="$/msg" value={formatCost(costPerMsg)} />
          <MetricTile
            label="Duration"
            value={formatDuration(session.session_duration_ms)}
          />
          <MetricTile
            label="Reply Latency"
            value={
              session.avg_latency_ms > 0
                ? `${Math.round(session.avg_latency_ms)}ms`
                : "—"
            }
            hint={
              session.p95_latency_ms > 0
                ? `per turn · p95 ${Math.round(session.p95_latency_ms)}ms`
                : "per user→assistant turn"
            }
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-card/50 shadow-sm px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="text-[10px]">
            Transcript View
          </Badge>
          <span className="text-muted-foreground">
            {messagesLoading
              ? "Loading messages…"
              : `${visibleMessageCount.toLocaleString()} loaded`}
          </span>
          {messagesData && (
            <span className="text-muted-foreground/70">
              of {effectiveTotalMessages.toLocaleString()} total
            </span>
          )}
          {remainingMessages > 0 && !loadingAll && (
            <span className="text-amber-600 dark:text-amber-400">
              {remainingMessages.toLocaleString()} older hidden
            </span>
          )}
          {loadingAll && (
            <span className="inline-flex items-center gap-1 text-primary">
              <Sparkles size={11} />
              Loading all pages…
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={autoLoadAll}
              onCheckedChange={setAutoLoadAll}
              aria-label="Auto-load all session pages"
            />
            Auto-load full transcript
          </label>
        </div>
      </div>

      {/* Parent link (subagent → parent session) */}
      {session.session_role === "subagent" && session.parent && (
        <Link
          href={`/sessions/${session.parent.id}`}
          className="flex items-center gap-2.5 px-4 py-3 bg-card/60 border border-border/50 rounded-2xl shadow-sm hover:bg-muted/40 transition-colors"
        >
          <GitBranch size={14} className="text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            Subagent of{" "}
            <span className="font-medium text-foreground/80">
              {session.parent.summary ||
                session.parent.first_prompt?.slice(0, 80) ||
                session.parent.id.slice(0, 12)}
            </span>
          </span>
          {session.subagent_type && (
            <Badge
              variant="secondary"
              className="text-meta ml-auto"
            >
              {session.subagent_type}
            </Badge>
          )}
        </Link>
      )}

      {/* Children list (parent session → subagents) */}
      {session.children &&
        session.children.length > 0 && (
          <div className="rounded-2xl border border-border/50 bg-card/50 shadow-sm p-3.5 space-y-2.5">
            <h4 className="text-xs font-medium text-muted-foreground/80 flex items-center gap-1.5">
              <Network size={12} />
              {session.children.length} Child Session{session.children.length !== 1 ? "s" : ""}
            </h4>
            <div className="grid gap-1.5">
              {session.children.map((child) => (
                <Link
                  key={child.id}
                  href={`/sessions/${child.id}`}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 bg-background/50 border border-border/40 rounded-lg hover:bg-muted/40 hover:border-border/60 transition-colors text-xs"
                >
                  {child.subagent_type && (
                    <Badge
                      variant="secondary"
                      className="text-meta shrink-0"
                    >
                      {child.subagent_type}
                    </Badge>
                  )}
                  <span className="truncate text-foreground/80">
                    {child.summary ||
                      child.first_prompt?.slice(0, 80) ||
                      child.id.slice(0, 12)}
                  </span>
                  <span className="tabular-nums text-muted-foreground ml-auto shrink-0">
                    {formatCost(child.total_cost)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
            <div className="min-w-0 overflow-hidden rounded-2xl border border-border/50 bg-card/55 shadow-sm p-4 sm:p-5">
              {messagesLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-20" />
                  ))}
                </div>
              ) : (
                <MessageList
                  messages={
                    (messages || []) as Parameters<
                      typeof MessageList
                    >[0]["messages"]
                  }
                  pagination={pagination}
                  onLoadOlder={loadOlder}
                  loadingOlder={loadingOlder}
                  onLoadAll={loadAll}
                  loadingAll={loadingAll}
                />
              )}
            </div>
            <div className="xl:sticky xl:top-4">
              <SessionSidebar session={session} />
            </div>
          </div>
        </div>
      </PageScaffold>
    </PageContainer>
  );
}
