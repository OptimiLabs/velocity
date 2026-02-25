"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  chartColors,
  chartTickStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { useSessions } from "@/hooks/useSessions";
import { X, ChevronRight, ExternalLink } from "lucide-react";
import type { AnalyticsFilters, CostDistribution } from "@/hooks/useAnalytics";
import Link from "next/link";

interface SessionCostDistributionProps {
  data: CostDistribution;
  dateFrom?: string;
  dateTo?: string;
  projectId?: string;
  filters?: AnalyticsFilters;
  compareData?: CostDistribution;
  compareLabels?: [string, string];
}

/** Map histogram bucket labels to SQL-matching cost ranges.
 *  Histogram SQL uses CASE with <= thresholds, so buckets are:
 *  $0-1: cost > 0 AND cost <= 1, $1-5: cost > 1 AND cost <= 5, etc. */
const BUCKET_RANGES: Record<string, { min: number; max: number }> = {
  "$0-1": { min: 0, max: 1 },
  "$1-5": { min: 1, max: 5 },
  "$5-10": { min: 5, max: 10 },
  "$10-25": { min: 10, max: 25 },
  "$25-50": { min: 25, max: 50 },
  "$50+": { min: 50, max: 999999 },
};

function parseBucket(bucket: string): { min: number; max: number } | null {
  return BUCKET_RANGES[bucket] ?? null;
}

export function SessionCostDistribution({
  data,
  dateFrom,
  dateTo,
  projectId,
  filters,
  compareData,
  compareLabels,
}: SessionCostDistributionProps) {
  // Auto-select the most expensive bucket (last non-zero) on mount/data change
  const defaultBucket = useMemo(() => {
    for (let i = data.histogram.length - 1; i >= 0; i--) {
      if (data.histogram[i].count > 0) return data.histogram[i].bucket;
    }
    return null;
  }, [data.histogram]);

  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  useEffect(() => {
    setSelectedBucket(defaultBucket);
  }, [defaultBucket]);

  const costRange = useMemo(() => {
    if (!selectedBucket) return null;
    return parseBucket(selectedBucket);
  }, [selectedBucket]);

  const { data: bucketSessions, isLoading: sessionsLoading } = useSessions({
    sortBy: "cost",
    sortDir: "DESC",
    limit: 8,
    dateFrom,
    dateTo,
    projectId,
    provider: filters?.provider,
    role: filters?.roles?.join(",") || undefined,
    agentType: filters?.agentTypes?.join(",") || undefined,
    model: filters?.models?.join(",") || undefined,
    modelOp: filters?.modelOp,
    costMin: costRange?.min,
    costMax: costRange?.max,
    minMessages: 1,
    enabled: !!costRange,
  });

  const histogramCount = useMemo(() => {
    if (!selectedBucket) return 0;
    return data.histogram.find((h) => h.bucket === selectedBucket)?.count ?? 0;
  }, [selectedBucket, data.histogram]);

  const percentiles = [
    { label: "p50", value: data.p50, compare: compareData?.p50 },
    { label: "p75", value: data.p75, compare: compareData?.p75 },
    { label: "p90", value: data.p90, compare: compareData?.p90 },
    { label: "p99", value: data.p99, compare: compareData?.p99 },
    { label: "max", value: data.max, compare: compareData?.max },
  ];

  const compareHistMap = useMemo(() => {
    if (!compareData) return null;
    const map = new Map<string, number>();
    for (const h of compareData.histogram) map.set(h.bucket, h.count);
    return map;
  }, [compareData]);

  const handleBarClick = useCallback((entry: { bucket: string }) => {
    setSelectedBucket((prev) => (prev === entry.bucket ? null : entry.bucket));
  }, []);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-section-title">
            Session Cost Distribution
          </CardTitle>
          {selectedBucket && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2 gap-1"
              onClick={() => setSelectedBucket(null)}
            >
              <X size={10} />
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Percentile badges */}
        <div className="flex flex-wrap gap-2">
          {percentiles.map((p) => (
            <Badge
              key={p.label}
              variant="outline"
              className="text-xs tabular-nums gap-1.5"
            >
              <span className="text-muted-foreground">{p.label}</span>
              {formatCost(p.value)}
              {p.compare != null && (
                <span className="text-muted-foreground/60">
                  (was {formatCost(p.compare)})
                </span>
              )}
            </Badge>
          ))}
        </div>

        {/* Compare legend */}
        {compareData && compareLabels && (
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: chartColors.chart4, opacity: 0.85 }} />
              {compareLabels[0]}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: chartColors.chart2, opacity: 0.5 }} />
              {compareLabels[1]}
            </span>
          </div>
        )}

        {/* Histogram */}
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={
              compareHistMap
                ? data.histogram.map((h) => ({
                    ...h,
                    compareCount: compareHistMap.get(h.bucket) ?? 0,
                  }))
                : data.histogram
            }
            margin={{ left: -10 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartGridStroke}
              opacity={0.3}
            />
            <XAxis dataKey="bucket" tick={chartTickStyle} />
            <YAxis tick={chartTickStyle} allowDecimals={false} />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              barSize={compareHistMap ? 16 : 36}
              cursor="pointer"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onClick={(data: any) => {
                if (data?.bucket) handleBarClick(data);
              }}
            >
              {data.histogram.map((entry) => (
                <Cell
                  key={entry.bucket}
                  fill={
                    entry.bucket === selectedBucket
                      ? chartColors.chart1
                      : chartColors.chart4
                  }
                  opacity={
                    selectedBucket && entry.bucket !== selectedBucket
                      ? 0.4
                      : 0.85
                  }
                />
              ))}
            </Bar>
            {compareHistMap && (
              <Bar
                dataKey="compareCount"
                radius={[4, 4, 0, 0]}
                barSize={16}
                fill={chartColors.chart2}
                opacity={0.5}
              />
            )}
          </BarChart>
        </ResponsiveContainer>

        {/* Clickable bucket buttons */}
        <div className="flex gap-1.5 flex-wrap">
          {data.histogram.map((entry) => {
            const cmpCount = compareHistMap?.get(entry.bucket);
            return (
              <button
                key={entry.bucket}
                onClick={() => handleBarClick(entry)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs tabular-nums transition-colors",
                  entry.bucket === selectedBucket
                    ? "bg-primary text-primary-foreground"
                    : entry.count > 0
                      ? "bg-muted text-foreground hover:bg-muted/80"
                      : "bg-muted/50 text-muted-foreground/40 cursor-default",
                )}
                disabled={entry.count === 0 && (cmpCount ?? 0) === 0}
              >
                {entry.bucket}{" "}
                <span className={entry.bucket === selectedBucket ? "text-primary-foreground/70" : "text-muted-foreground"}>
                  ({entry.count}{cmpCount != null ? ` / ${cmpCount}` : ""})
                </span>
              </button>
            );
          })}
        </div>

        {/* Drill-down: sessions in selected bucket */}
        {selectedBucket && (
          <div className="border-t border-border/30 pt-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ChevronRight size={12} />
              <span>
                Sessions in{" "}
                <span className="text-foreground font-medium">
                  {selectedBucket}
                </span>
              </span>
              <Badge variant="outline" className="text-micro px-1.5 py-0">
                {histogramCount} total
              </Badge>
            </div>

            {sessionsLoading ? (
              <div className="text-micro text-muted-foreground py-4 text-center">
                Loading sessions...
              </div>
            ) : bucketSessions && bucketSessions.sessions.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="table-readable w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/30 text-muted-foreground">
                        <th className="text-left py-1.5 pr-3 font-medium">
                          Session
                        </th>
                        <th className="text-right py-1.5 px-2 font-medium">
                          Cost
                        </th>
                        <th className="text-right py-1.5 px-2 font-medium">
                          Input
                        </th>
                        <th className="text-right py-1.5 px-2 font-medium">
                          Output
                        </th>
                        <th className="text-right py-1.5 px-2 font-medium">
                          Cache
                        </th>
                        <th className="text-right py-1.5 px-2 font-medium">
                          Msgs
                        </th>
                        <th className="text-right py-1.5 pl-2 font-medium">
                          Tools
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucketSessions.sessions.map((s) => {
                        const totalIn =
                          s.input_tokens +
                          (s.cache_read_tokens || 0) +
                          (s.cache_write_tokens || 0);
                        const cacheRate =
                          totalIn > 0
                            ? ((s.cache_read_tokens || 0) / totalIn) * 100
                            : 0;
                        return (
                          <tr
                            key={s.id}
                            className="border-b border-border/20 hover:bg-muted/30 transition-colors group"
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
                            </td>
                            <td className="text-right py-1.5 px-2 text-foreground font-medium tabular-nums">
                              {formatCost(s.total_cost)}
                            </td>
                            <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                              {formatTokens(s.input_tokens)}
                            </td>
                            <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                              {formatTokens(s.output_tokens)}
                            </td>
                            <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                              {cacheRate.toFixed(1)}%
                            </td>
                            <td className="text-right py-1.5 px-2 text-muted-foreground tabular-nums">
                              {s.message_count}
                            </td>
                            <td className="text-right py-1.5 pl-2 text-muted-foreground tabular-nums">
                              {s.tool_call_count}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {histogramCount > 8 && costRange && (
                  <Link
                    href={`/sessions?tab=sessions&sortBy=cost&sortDir=DESC&costMin=${costRange.min}&costMax=${costRange.max}&minMessages=1${dateFrom ? `&dateFrom=${dateFrom}` : ""}${dateTo ? `&dateTo=${dateTo}` : ""}${projectId ? `&projectId=${projectId}` : ""}`}
                    className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1.5"
                  >
                    See all {histogramCount} sessions
                    <ChevronRight size={12} />
                  </Link>
                )}
              </>
            ) : (
              <div className="text-micro text-muted-foreground py-4 text-center">
                No sessions in this range
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
