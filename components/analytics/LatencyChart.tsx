"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyStats } from "@/types/session";
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import { formatLatency } from "@/lib/cost/calculator";
import { format } from "date-fns";

interface LatencyChartProps {
  data: DailyStats[];
  compareData?: Record<string, unknown>[];
  compareLabels?: [string, string];
}

export function LatencyChart({
  data,
  compareData,
  compareLabels,
}: LatencyChartProps) {
  const chartData = compareData ?? data;
  const isHourly =
    chartData.length > 0 &&
    String((chartData[0] as Record<string, unknown>).date ?? "").includes(" ");
  const xKey = compareData
    ? (compareData[0] as Record<string, unknown>)?.dayIndex != null
      ? "dayIndex"
      : "date"
    : "date";

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">
          {isHourly ? "Hourly Latency" : "Message Latency"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartGridStroke} />
            <XAxis
              dataKey={xKey}
              tick={chartTickStyle}
              tickFormatter={(v: string | number) => {
                if (typeof v === "number") return `Day ${v}`;
                const s = String(v);
                if (s.includes(" ")) {
                  const [datePart, timePart] = s.split(" ");
                  const hour = parseInt(timePart);
                  const suffix = hour < 12 ? "am" : "pm";
                  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                  return `${format(new Date(datePart), "MMM d")} ${h12}${suffix}`;
                }
                return format(new Date(s + "T00:00"), "MMM d");
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={chartTickStyle}
              tickFormatter={(v: number) => formatLatency(v)}
              width={45}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => {
                const isCompareP95 = name === "compare_avg_p95_latency_ms";
                const isCompareAvg = name === "compare_avg_latency_ms";
                const isP95 = name === "avg_p95_latency_ms" || isCompareP95;
                let label: string;
                if (compareData) {
                  const period =
                    isCompareAvg || isCompareP95
                      ? (compareLabels?.[1] ?? "Comparison")
                      : (compareLabels?.[0] ?? "Primary");
                  label = `${isP95 ? "p95" : "Avg"} (${period})`;
                } else {
                  label = isP95 ? "p95 Latency" : "Avg Latency";
                }
                return [formatLatency(Number(v ?? 0)), label];
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(l: any) =>
                compareData && typeof l === "number" ? `Day ${l}` : String(l)
              }
            />
            {/* p95 — lighter, rendered first so avg overlays on top */}
            <Area
              type="monotone"
              dataKey="avg_p95_latency_ms"
              stroke={chartColors.chart4}
              fill={chartColors.chart4}
              fillOpacity={0.12}
              strokeWidth={1}
            />
            {/* Avg — solid primary */}
            <Area
              type="monotone"
              dataKey="avg_latency_ms"
              stroke={chartColors.chart5}
              fill={chartColors.chart5}
              fillOpacity={0.25}
              strokeWidth={1.5}
            />
            {compareData && (
              <>
                <Area
                  type="monotone"
                  dataKey="compare_avg_p95_latency_ms"
                  stroke={chartColors.chart4}
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="compare_avg_latency_ms"
                  stroke={chartColors.chart5}
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.5}
                />
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
