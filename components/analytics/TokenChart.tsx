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
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import type { DailyStats } from "@/types/session";
import { format } from "date-fns";

interface TokenChartProps {
  data: DailyStats[];
  compareData?: Record<string, unknown>[];
  compareLabels?: [string, string];
}

export function TokenChart({ data, compareData, compareLabels }: TokenChartProps) {
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
          {isHourly ? "Hourly Tokens" : "Token Usage"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartGridStroke}
            />
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
              tickFormatter={(v: number) => {
                if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                return String(v);
              }}
              width={50}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => {
                const aLabel = compareLabels?.[0] ?? "Period A";
                const bLabel = compareLabels?.[1] ?? "Period B";
                const labels: Record<string, string> = compareData
                  ? {
                      input_tokens: `${aLabel} Input`,
                      output_tokens: `${aLabel} Output`,
                      compare_input_tokens: `${bLabel} Input`,
                      compare_output_tokens: `${bLabel} Output`,
                    }
                  : {
                      input_tokens: "Input",
                      output_tokens: "Output",
                    };
                return [Number(v ?? 0).toLocaleString(), labels[name] ?? name];
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(l: any) =>
                compareData && typeof l === "number" ? `Day ${l}` : String(l)
              }
            />
            <Area
              type="monotone"
              dataKey="input_tokens"
              stackId="1"
              stroke={chartColors.chart2}
              fill={chartColors.chart2}
              fillOpacity={0.4}
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="output_tokens"
              stackId="1"
              stroke={chartColors.chart4}
              fill={chartColors.chart4}
              fillOpacity={0.4}
              strokeWidth={1.5}
            />
            {compareData && (
              <>
                <Area
                  type="monotone"
                  dataKey="compare_input_tokens"
                  stroke={chartColors.chart2}
                  fill="none"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                  strokeOpacity={0.5}
                />
                <Area
                  type="monotone"
                  dataKey="compare_output_tokens"
                  stroke={chartColors.chart4}
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
