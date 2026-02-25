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
import {
  chartColors,
  chartTickStyle,
  chartTooltipStyle,
  chartGridStroke,
} from "@/lib/chart-colors";

interface ProjectCost {
  name: string;
  total_cost: number;
  session_count: number;
  total_tokens: number;
}

export function ProjectCostChart({ data }: { data: ProjectCost[] }) {
  if (data.length === 0) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Cost by Project</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer
          width="100%"
          height={Math.max(200, data.length * 36)}
        >
          <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartGridStroke}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={chartTickStyle}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={chartTickStyle}
              width={120}
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`$${Number(v ?? 0).toFixed(4)}`, "Cost"]}
            />
            <Bar
              dataKey="total_cost"
              fill={chartColors.chart1}
              radius={[0, 4, 4, 0]}
              barSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
