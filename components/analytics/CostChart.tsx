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
import { format } from "date-fns";

interface CostChartProps {
  data: DailyStats[];
  compareData?: Record<string, unknown>[];
  compareLabels?: [string, string];
}

export function CostChart({ data, compareData, compareLabels }: CostChartProps) {
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
          {isHourly ? "Hourly Cost" : "Daily Cost"}
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
              tickFormatter={(v: number) => `$${v.toFixed(1)}`}
              width={45}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) => {
                const label = compareData
                  ? name === "compare_total_cost"
                    ? (compareLabels?.[1] ?? "Period B")
                    : (compareLabels?.[0] ?? "Period A")
                  : "Cost";
                return [`$${Number(v ?? 0).toFixed(4)}`, label];
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(l: any) =>
                compareData && typeof l === "number" ? `Day ${l}` : String(l)
              }
            />
            <Area
              type="monotone"
              dataKey="total_cost"
              stroke={chartColors.chart1}
              fill={chartColors.chart1}
              fillOpacity={0.25}
              strokeWidth={1.5}
            />
            {compareData && (
              <Area
                type="monotone"
                dataKey="compare_total_cost"
                stroke={chartColors.chart1}
                fill="none"
                strokeWidth={1}
                strokeDasharray="4 3"
                strokeOpacity={0.5}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
