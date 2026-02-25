"use client";

import { useState, useEffect, useMemo, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatTokens, formatCost, calculateCost } from "@/lib/cost/calculator";
import {
  useBlockUsage,
  useAnalytics,
  useRealUsage,
  useUpdateBlockSettings,
} from "@/hooks/useAnalytics";
import type { RealUsageSection } from "@/hooks/useAnalytics";
import {
  DollarSign,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpen,
  BookMarked,
  MessageSquare,
  Wrench,
  ExternalLink,
  RefreshCw,
  Settings2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { KPICard } from "@/components/layout/KPICard";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";

function ResetCountdown({ resetsAt }: { resetsAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const update = () => {
      const diff = new Date(resetsAt).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("resetting...");
        return;
      }
      const hours = Math.floor(diff / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      if (hours > 0) {
        setRemaining(`${hours}h ${mins}m`);
      } else if (mins > 0) {
        setRemaining(`${mins}m ${secs}s`);
      } else {
        setRemaining(`${secs}s`);
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetsAt]);

  return <span className="tabular-nums">{remaining}</span>;
}

function shortenModel(model: string): string {
  if (model.includes("opus-4-6")) return "Opus 4.6";
  if (model.includes("opus-4-5")) return "Opus 4.5";
  if (model.includes("opus-4-1")) return "Opus 4.1";
  if (model.includes("opus-4")) return "Opus 4";
  if (model.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (model.includes("sonnet-4-5")) return "Sonnet 4.5";
  if (model.includes("sonnet-4")) return "Sonnet 4";
  if (model.includes("3-5-sonnet")) return "Sonnet 3.5";
  if (model.includes("haiku-4-5")) return "Haiku 4.5";
  if (model.includes("3-5-haiku")) return "Haiku 3.5";
  if (model.includes("3-haiku")) return "Haiku 3";
  if (model.includes("3-opus")) return "Opus 3";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

function shortenPath(p: string | null): string {
  if (!p) return "";
  return p
    .replace(/^\/Users\/[^/]+\//, "~/")
    .split("/")
    .slice(-2)
    .join("/");
}

function usageColor(pct: number): string {
  if (pct >= 80) return "bg-destructive";
  if (pct >= 50) return "bg-yellow-500 dark:bg-yellow-400";
  return "bg-chart-3";
}

function usageTextColor(pct: number): string {
  if (pct >= 80) return "text-destructive";
  if (pct >= 50) return "text-yellow-500 dark:text-yellow-400";
  return "text-chart-3";
}

function RealUsageBanner() {
  const { data, isLoading } = useRealUsage();

  // Silently hide on error, loading, or no sections
  if (isLoading || !data || data.error || data.sections.length === 0) {
    return null;
  }

  return (
    <Card className="bg-card border-primary/20">
      <CardContent className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 dark:bg-green-300 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 dark:bg-green-400" />
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Live from Anthropic
            </span>
          </div>
          <span className="text-micro text-text-quaternary tabular-nums">
            Updated {new Date(data.fetchedAt).toLocaleTimeString()}
          </span>
        </div>

        <div className="space-y-2.5">
          {data.sections.map((section: RealUsageSection) => (
            <div key={section.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">
                  {section.label}
                </span>
                <div className="flex items-center gap-2">
                  {section.percentUsed !== null && (
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        usageTextColor(section.percentUsed),
                      )}
                    >
                      {section.percentUsed}% used
                    </span>
                  )}
                  {section.resetsAt && (
                    <span className="text-text-quaternary tabular-nums">
                      resets in <ResetCountdown resetsAt={section.resetsAt} />
                    </span>
                  )}
                </div>
              </div>
              {section.percentUsed !== null && (
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      usageColor(section.percentUsed),
                    )}
                    style={{ width: `${section.percentUsed}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

const BLOCK_DURATION_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
  { value: 300, label: "5 hours (default)" },
  { value: 360, label: "6 hours" },
  { value: 480, label: "8 hours" },
];

export function BlockUsageCard({ headerLeft }: { headerLeft?: ReactNode }) {
  const { data: realUsage } = useRealUsage();
  const updateSettings = useUpdateBlockSettings();
  const [showConfig, setShowConfig] = useState(false);

  // Derive block end from live Anthropic "Current session" section
  const liveBlockSection = useMemo(() => {
    if (!realUsage?.sections?.length) return null;
    return realUsage.sections[0];
  }, [realUsage]);

  const blockTo = liveBlockSection?.resetsAt ?? undefined;
  const { data, isLoading, refetch, isFetching } = useBlockUsage(
    undefined, blockTo, true,
  );

  // "Block X of Y this week" context from live week data
  const weekBlockContext = useMemo(() => {
    if (!realUsage?.sections?.length || !data?.block.startedAt) return null;
    const weekSection = realUsage.sections.find((s) => s.label.toLowerCase().includes("week"));
    if (!weekSection?.resetsAt) return null;
    const weekEnd = new Date(weekSection.resetsAt).getTime();
    const weekStart = weekEnd - 7 * 24 * 60 * 60 * 1000;
    const blockStart = new Date(data.block.startedAt).getTime();
    if (blockStart < weekStart) return null;
    const totalBlocks = Math.ceil((7 * 24 * 60) / (data.resetMinutes));
    const elapsed = blockStart - weekStart;
    const currentBlock = Math.floor(elapsed / (data.resetMinutes * 60_000)) + 1;
    return { current: Math.min(currentBlock, totalBlocks), total: totalBlocks };
  }, [realUsage, data]);

  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const hourlyCost = useMemo(() => {
    if (!data?.block.startedAt || data.block.cost === 0) return null;
    const elapsed = nowTs - new Date(data.block.startedAt).getTime();
    const hours = elapsed / 3_600_000;
    if (hours < 0.083) return null; // ~5 min minimum for stable hourly rate
    return data.block.cost / hours;
  }, [data, nowTs]);

  // Hourly breakdown chart data
  const chartFrom = data?.block.startedAt
    ? format(new Date(data.block.startedAt), "yyyy-MM-dd")
    : null;
  const chartTo = data?.block.resetsAt
    ? format(new Date(data.block.resetsAt), "yyyy-MM-dd")
    : null;
  const hasBlock = !!chartFrom && !!chartTo;

  const { data: hourlyData } = useAnalytics(
    chartFrom ?? "",
    chartTo ?? "",
    {},
    hasBlock,
    "hour",
  );

  const hourlyChartData = useMemo(() => {
    if (!hourlyData?.daily || !data?.block.startedAt) return [];
    const blockStart = new Date(data.block.startedAt);
    blockStart.setMinutes(0, 0, 0);
    const blockStartMs = blockStart.getTime();
    const blockEnd = data.block.resetsAt
      ? new Date(data.block.resetsAt)
      : new Date();
    blockEnd.setMinutes(59, 59, 999);
    const blockEndMs = blockEnd.getTime();
    return hourlyData.daily
      .filter((d) => {
        // SQLite strftime returns UTC strings without 'Z' — append it for correct parsing
        const t = new Date(d.date + "Z").getTime();
        return t >= blockStartMs && t <= blockEndMs;
      })
      .map((d) => ({
        hour: format(new Date(d.date + "Z"), "ha").toLowerCase(),
        fullLabel: format(new Date(d.date + "Z"), "h:mm a"),
        cost: d.total_cost,
      }));
  }, [hourlyData, data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {headerLeft && (
          <div className="flex items-center">{headerLeft}</div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!data) {
    return headerLeft ? (
      <div className="space-y-4">
        <div className="flex items-center">{headerLeft}</div>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-4">
      {/* Live usage from Anthropic */}
      <RealUsageBanner />

      {/* Block header: tabs (left) + block context, time range, reset timer (right) */}
      <div className="flex items-center justify-between">
        {headerLeft && <div className="flex items-center">{headerLeft}</div>}
        <div className="flex items-center gap-3 text-sm ml-auto">
          {weekBlockContext && (
            <span className="text-muted-foreground tabular-nums">
              Block{" "}
              <span className="text-foreground font-medium">
                {weekBlockContext.current}
              </span>
              {" of "}
              <span className="text-foreground font-medium">
                {weekBlockContext.total}
              </span>
              {" this week"}
            </span>
          )}
          {data.block.startedAt && data.block.resetsAt && (
            <>
              {weekBlockContext && <span className="text-border">|</span>}
              <span className="text-muted-foreground">
                Block{" "}
                <span className="text-foreground tabular-nums">
                  {format(new Date(data.block.startedAt), "h:mm a")}
                </span>
                {" – "}
                <span className="text-foreground tabular-nums">
                  {format(new Date(data.block.resetsAt), "h:mm a")}
                </span>
              </span>
              <span className="text-border">|</span>
              <span className="text-muted-foreground">
                Resets in{" "}
                <span className="text-foreground font-medium">
                  <ResetCountdown resetsAt={data.block.resetsAt} />
                </span>
              </span>
            </>
          )}
          <button
            onClick={() => setShowConfig(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings2 size={12} />
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        <KPICard
          label="Est. Cost"
          icon={DollarSign}
          value={formatCost(data.block.cost)}
          color="text-chart-1"
          subtitle={hourlyCost ? `${formatCost(hourlyCost)}/hr` : undefined}
        />
        <KPICard
          label="Input"
          icon={ArrowDownToLine}
          value={formatTokens(data.block.inputTokens)}
          color="text-chart-2"
        />
        <KPICard
          label="Output"
          icon={ArrowUpFromLine}
          value={formatTokens(data.block.outputTokens)}
          color="text-chart-4"
        />
        <KPICard
          label="Cache Read"
          icon={BookOpen}
          value={formatTokens(data.block.cacheReadTokens)}
          color="text-chart-3"
        />
        <KPICard
          label="Cache Write"
          icon={BookMarked}
          value={formatTokens(data.block.cacheWriteTokens)}
          color="text-chart-5"
        />
        <KPICard
          label="Sessions"
          icon={Layers}
          value={data.block.sessions}
          color="text-chart-3"
        />
        <KPICard
          label="Messages"
          icon={MessageSquare}
          value={data.block.messages.toLocaleString()}
          color="text-chart-2"
        />
        <KPICard
          label="Tool Calls"
          icon={Wrench}
          value={data.block.toolCalls.toLocaleString()}
          color="text-chart-4"
        />
      </div>

      {/* Hourly cost + Model breakdown — 2 col grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Hourly cost chart */}
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-section-title">Hourly Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              {hourlyChartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyChartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={chartGridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="hour"
                      tick={chartTickStyle}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={chartTickStyle}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                      width={50}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(v: number | string | undefined) => [
                        formatCost(Number(v ?? 0)),
                        "Cost",
                      ]}
                      labelFormatter={(_label, payload) =>
                        payload?.[0]?.payload?.fullLabel ?? _label
                      }
                    />
                    <Bar
                      dataKey="cost"
                      fill={chartColors.chart1}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-muted-foreground">No hourly data yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Model breakdown */}
        {data.models.length > 0 && (
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-section-title">Block Models</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.models.map((m) => {
                  const mCost = calculateCost(m.model, m.inputTokens, m.outputTokens, m.cacheReadTokens, m.cacheWriteTokens);
                  const allModelsCost = data.models.reduce(
                    (s, x) => s + calculateCost(x.model, x.inputTokens, x.outputTokens, x.cacheReadTokens, x.cacheWriteTokens),
                    0,
                  );
                  const pct =
                    allModelsCost > 0
                      ? Math.round((mCost / allModelsCost) * 100)
                      : 0;
                  return (
                    <div key={m.model} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">
                          {shortenModel(m.model)}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatCost(mCost)} · {m.sessions} session
                          {m.sessions !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex gap-4 text-meta">
                        <span>In: {formatTokens(m.inputTokens)}</span>
                        <span>Out: {formatTokens(m.outputTokens)}</span>
                        <span>CR: {formatTokens(m.cacheReadTokens)}</span>
                        <span>CW: {formatTokens(m.cacheWriteTokens)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top sessions — full width */}
      {data.topSessions.length > 0 && (
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-section-title">
              Top Sessions This Block
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="table-readable w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 pr-3 font-medium">
                      Session
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">Cost</th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      Tokens
                    </th>
                    <th className="text-right py-1.5 px-2 font-medium">
                      Messages
                    </th>
                    <th className="text-right py-1.5 pl-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topSessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/60 hover:bg-muted/30 transition-colors group"
                    >
                      <td className="py-1.5 pr-3 max-w-[200px]">
                        <Link
                          href={`/sessions/${s.id}`}
                          className="flex items-center gap-1.5 text-foreground hover:text-chart-1 transition-colors"
                        >
                          <span className="truncate font-mono text-xs">
                            {s.first_prompt?.slice(0, 50) ||
                              s.slug ||
                              s.id.slice(0, 12)}
                          </span>
                          <ExternalLink
                            size={9}
                            className="opacity-0 group-hover:opacity-50 shrink-0"
                          />
                        </Link>
                        {s.project_path && (
                          <div className="text-micro text-muted-foreground truncate">
                            {shortenPath(s.project_path)}
                          </div>
                        )}
                      </td>
                      <td className="text-right py-1.5 px-2 font-medium text-foreground tabular-nums">
                        {formatCost(s.total_cost)}
                      </td>
                      <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                        {formatTokens(s.input_tokens + s.output_tokens)}
                      </td>
                      <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                        {s.message_count}
                      </td>
                      <td className="text-right py-1.5 pl-2 text-muted-foreground tabular-nums">
                        {format(new Date(s.created_at), "EEE h:mm a")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.block.startedAt && (
              <div className="pt-3 border-t border-border/60 mt-2">
                <Link
                  href={`/sessions?tab=sessions&dateFrom=${encodeURIComponent(data.block.startedAt)}&dateTo=${encodeURIComponent(data.block.resetsAt ?? new Date().toISOString())}&sortBy=created_at&sortDir=DESC`}
                  className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  View all {data.block.sessions} block sessions
                  <ExternalLink size={10} />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Footer note */}
      <p className="text-micro text-muted-foreground text-center">
        Usage limits from Anthropic. Detailed analytics from local session logs.
        {" · "}Refreshes every 60s.
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1 text-text-quaternary hover:text-muted-foreground transition-colors ml-1"
        >
          <RefreshCw size={10} className={isFetching ? "animate-spin" : ""} />
          Refresh now
        </button>
      </p>

      {/* Block settings dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Block Settings</DialogTitle>
            <DialogDescription>
              Configure block duration. This controls the rolling time window used to compute block usage.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Block Duration
              </label>
              <Select
                value={String(data.resetMinutes)}
                onValueChange={(v) => {
                  updateSettings.mutate({ statuslineResetMinutes: Number(v) });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_DURATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-micro text-text-quaternary">
                Anthropic uses 5-hour blocks by default. Change this if your plan uses a different block window.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
