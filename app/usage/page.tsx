"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { UsageDashboard } from "@/components/usage/UsageDashboard";
import {
  useBlockUsage,
  useRealUsage,
  useWeekSettings,
  useUpdateBlockSettings,
} from "@/hooks/useAnalytics";
import {
  CalendarRange,
  Clock3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { computeWeekBounds } from "@/lib/usage/time-bounds";
import { format } from "date-fns";
import type { ConfigProvider } from "@/types/provider";
import {
  getAllSessionProviders,
  getSessionProvider,
} from "@/lib/providers/session-registry";
import {
  parseUsageProvider,
  USAGE_PROVIDER_STORAGE_KEY,
} from "@/lib/usage/provider-filter";

type Preset = "block" | "week" | "7d" | "30d" | "custom";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "block", label: "This Block" },
  { id: "week", label: "This Week" },
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "custom", label: "Custom" },
];

const WEEK_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function toLocalDatetime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatHourLabel(hour: number): string {
  const p = hour < 12 ? "AM" : "PM";
  const d = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${d}:00 ${p}`;
}

function ResetCountdown({ resetsAt }: { resetsAt: string }) {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const update = () => {
      const diff = new Date(resetsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining("resetting..."); return; }
      const hours = Math.floor(diff / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      const secs = Math.floor((diff % 60_000) / 1000);
      setRemaining(hours > 0 ? `${hours}h ${mins}m` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [resetsAt]);
  return <span className="tabular-nums">{remaining}</span>;
}

export default function UsagePage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePreset, setActivePreset] = useState<Preset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [storedUsageProvider, setStoredUsageProvider] =
    useState<ConfigProvider | null>(null);
  const provider = parseUsageProvider(searchParams.get("provider")) ?? storedUsageProvider;
  const sessionProviders = getAllSessionProviders();
  const shouldLoadLiveUsage = activePreset === "block";
  const shouldLoadBlockData = activePreset === "block";
  const updateSettings = useUpdateBlockSettings();

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  // Block data
  const { data: realUsage } = useRealUsage(shouldLoadLiveUsage);
  const realUsageSections = realUsage?.sections ?? [];
  const liveBlockResetsAt = realUsageSections[0]?.resetsAt ?? undefined;
  const liveWeekResetsAt =
    realUsageSections.find((s) => s.label.toLowerCase().includes("week"))
      ?.resetsAt ?? null;
  const { data: blockData } = useBlockUsage(
    undefined,
    liveBlockResetsAt,
    shouldLoadBlockData,
    provider,
  );

  // Week data
  const { data: weekSettings } = useWeekSettings();
  const weekStartDay = weekSettings?.statuslineWeekStartDay ?? 0;
  const weekStartHour = weekSettings?.statuslineWeekStartHour ?? 0;
  const weekBounds = useMemo(() => {
    if (liveWeekResetsAt) {
      const end = new Date(liveWeekResetsAt);
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        from: start.toISOString(),
        to: end.toISOString(),
        startDate: start,
        endDate: end,
      };
    }
    const bounds = computeWeekBounds(weekStartDay, weekStartHour, new Date(nowMs));
    return {
      from: bounds.weekFrom,
      to: bounds.weekTo,
      startDate: bounds.weekStartDate,
      endDate: bounds.weekEndDate,
    };
  }, [liveWeekResetsAt, weekStartDay, weekStartHour, nowMs]);

  const { from, to } = useMemo(() => {
    switch (activePreset) {
      case "block": {
        const blockFrom =
          blockData?.block.startedAt ??
          new Date(nowMs - 5 * 60 * 60 * 1000).toISOString();
        const blockTo =
          blockData?.block.resetsAt ?? new Date(nowMs).toISOString();
        return { from: blockFrom, to: blockTo };
      }
      case "week":
        return { from: weekBounds.from, to: weekBounds.to };
      case "7d": {
        return {
          from: new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date(nowMs).toISOString(),
        };
      }
      case "30d": {
        return {
          from: new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date(nowMs).toISOString(),
        };
      }
      case "custom":
        return {
          from: customFrom
            ? new Date(customFrom).toISOString()
            : new Date(nowMs - 24 * 60 * 60 * 1000).toISOString(),
          to: customTo
            ? new Date(customTo).toISOString()
            : new Date(nowMs).toISOString(),
        };
    }
  }, [activePreset, blockData, weekBounds, customFrom, customTo, nowMs]);

  const customRangeInvalid =
    activePreset === "custom" && new Date(from).getTime() > new Date(to).getTime();

  const displayFrom = customFrom || toLocalDatetime(new Date(from));
  const displayTo = customTo || toLocalDatetime(new Date(to));
  const activePresetLabel =
    PRESETS.find((preset) => preset.id === activePreset)?.label ?? activePreset;
  const providerLabel = provider
    ? (getSessionProvider(provider)?.label ?? provider)
    : "All providers";
  const rangeSummary = useMemo(() => {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return {
      concise: `${format(fromDate, "MMM d, h:mm a")} - ${format(
        toDate,
        "MMM d, h:mm a",
      )}`,
      detailed: `${format(fromDate, "EEE MMM d, yyyy h:mm a")} - ${format(
        toDate,
        "EEE MMM d, yyyy h:mm a",
      )}`,
    };
  }, [from, to]);

  const windowSourceText =
    activePreset === "block"
      ? "Live block boundaries from Anthropic usage data (with local fallback)."
      : activePreset === "week"
        ? "Week boundaries come from your saved week-start settings."
        : activePreset === "custom"
          ? "Manual time window applied directly to local session analytics."
          : "Rolling local time window based on current time.";

  const handlePresetSelect = (preset: Preset) => {
    setActivePreset(preset);
  };

  const handleProviderChange = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const parsed = parseUsageProvider(value);
      setStoredUsageProvider(parsed);
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
    [pathname, router, searchParams],
  );

  return (
    <PageContainer>
      <PageScaffold
        title="Usage"
        subtitle="Track costs, token usage, and block/week trends from local session data with reviewable time windows."
        filters={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-md border border-border/60 bg-background/70 p-0.5">
                {PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={activePreset === preset.id ? "default" : "ghost"}
                    size="xs"
                    className="h-7 px-2.5"
                    onClick={() => handlePresetSelect(preset.id)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <div className="sm:ml-auto">
                <Select
                  value={provider ?? "all"}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger
                    size="sm"
                    className="h-7 min-w-[170px] border-border/60 bg-card/60 text-xs"
                  >
                    <SelectValue placeholder="All providers" />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">All providers</SelectItem>
                    {sessionProviders.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <CalendarRange size={11} />
                      Active Window
                    </span>
                    <Badge variant="outline">{activePresetLabel}</Badge>
                    <Badge variant="outline">{providerLabel}</Badge>
                    {customRangeInvalid && (
                      <Badge variant="destructive">Invalid range</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground tabular-nums">
                    {rangeSummary.detailed}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {windowSourceText}
                  </p>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {activePreset === "block" &&
                    blockData?.block.startedAt &&
                    blockData?.block.resetsAt && (
                      <>
                        <div className="inline-flex items-center gap-1.5">
                          <Clock3 size={12} />
                          <span className="text-foreground tabular-nums">
                            {format(
                              new Date(blockData.block.startedAt),
                              "h:mm a",
                            )}{" "}
                            -{" "}
                            {format(
                              new Date(blockData.block.resetsAt),
                              "h:mm a",
                            )}
                          </span>
                        </div>
                        <div>
                          Resets in{" "}
                          <span className="font-medium text-foreground">
                            <ResetCountdown resetsAt={blockData.block.resetsAt} />
                          </span>
                        </div>
                      </>
                    )}

                  {activePreset === "week" && (
                    <>
                      <div>
                        Week starts{" "}
                        <span className="text-foreground">
                          {WEEK_DAYS[weekStartDay]}
                        </span>
                      </div>
                      <div>
                        At{" "}
                        <span className="text-foreground tabular-nums">
                          {formatHourLabel(weekStartHour)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/50 bg-card/40 p-3">
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Week Boundary Settings
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Shared with the app-header Usage menu for weekly window fallback.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Start day</span>
                    <Select
                      value={String(weekStartDay)}
                      onValueChange={(value) =>
                        updateSettings.mutate({
                          statuslineWeekStartDay: parseInt(value, 10),
                        })
                      }
                      disabled={updateSettings.isPending}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 text-xs border-border/60 bg-card/60"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEK_DAYS.map((day, index) => (
                          <SelectItem key={day} value={String(index)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Start time</span>
                    <Select
                      value={String(weekStartHour)}
                      onValueChange={(value) =>
                        updateSettings.mutate({
                          statuslineWeekStartHour: parseInt(value, 10),
                        })
                      }
                      disabled={updateSettings.isPending}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 text-xs border-border/60 bg-card/60"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, hour) => (
                          <SelectItem key={hour} value={String(hour)}>
                            {formatHourLabel(hour)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                </div>
              </div>
            </div>

            {activePreset === "custom" && (
              <div className="rounded-xl border border-border/50 bg-card/40 p-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    Custom Time Window
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Set an exact local time range for cost/token analytics.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">From</span>
                    <Input
                      type="datetime-local"
                      value={displayFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">To</span>
                    <Input
                      type="datetime-local"
                      value={displayTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </label>
                </div>
                {customRangeInvalid && (
                  <p className="text-xs text-destructive">
                    The start time must be before the end time.
                  </p>
                )}
              </div>
            )}
          </div>
        }
      >
        {customRangeInvalid ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            Custom range is invalid. Update the window settings to continue.
          </div>
        ) : (
          <UsageDashboard
            from={from}
            to={to}
            provider={provider ?? undefined}
          />
        )}
      </PageScaffold>
    </PageContainer>
  );
}
