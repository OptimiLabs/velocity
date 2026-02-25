"use client";

import {
  BarChart,
  Bar,
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

interface ActivityChartProps {
  data: DailyStats[];
  compareData?: Record<string, unknown>[];
  compareLabels?: [string, string];
}

export function ActivityChart({ data, compareData, compareLabels }: ActivityChartProps) {
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
          {isHourly ? "Hourly Activity" : "Daily Activity"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData}>
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
            <YAxis tick={chartTickStyle} width={40} />
            <Tooltip
              contentStyle={chartTooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              labelFormatter={(l: any) =>
                compareData && typeof l === "number" ? `Day ${l}` : String(l)
              }
            />
            <Bar
              dataKey="message_count"
              name={compareData ? `${compareLabels?.[0] ?? "A"} Messages` : "Messages"}
              fill={chartColors.chart2}
              opacity={0.85}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="tool_call_count"
              name={compareData ? `${compareLabels?.[0] ?? "A"} Tool Calls` : "Tool Calls"}
              fill={chartColors.chart3}
              opacity={0.85}
              radius={[2, 2, 0, 0]}
            />
            {compareData && (
              <>
                <Bar
                  dataKey="compare_message_count"
                  name={`${compareLabels?.[1] ?? "B"} Messages`}
                  fill={chartColors.chart2}
                  opacity={0.45}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="compare_tool_call_count"
                  name={`${compareLabels?.[1] ?? "B"} Tool Calls`}
                  fill={chartColors.chart3}
                  opacity={0.45}
                  radius={[2, 2, 0, 0]}
                />
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
