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
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";
import type { ToolUsageEntry } from "@/types/session";

export function ToolUsageChart({ data }: { data: ToolUsageEntry[] }) {
  if (data.length === 0) return null;

  const sorted = [...data].sort((a, b) => b.count - a.count);

  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(120, sorted.length * 28)}
    >
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ left: 0, right: 8, top: 4, bottom: 4 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartGridStroke}
          opacity={0.3}
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ ...chartTickStyle, fontSize: 9 }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={chartTickStyle}
          width={70}
        />
        <Tooltip
          contentStyle={chartTooltipStyle}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(v: any) => [Number(v ?? 0), "Calls"]}
        />
        <Bar
          dataKey="count"
          fill={chartColors.chart2}
          radius={[0, 4, 4, 0]}
          barSize={16}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
