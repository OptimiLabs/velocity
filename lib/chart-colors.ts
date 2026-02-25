export const chartColors = {
  chart1: "var(--chart-1)",
  chart2: "var(--chart-2)",
  chart3: "var(--chart-3)",
  chart4: "var(--chart-4)",
  chart5: "var(--chart-5)",
} as const;

export const chartTickStyle = {
  fontSize: 10,
  fill: "var(--chart-tick)",
} as const;
export const chartGridStroke = "var(--chart-grid)" as const;
export const chartTooltipStyle = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  fontSize: "11px",
  boxShadow: "0 4px 12px oklch(0 0 0 / 20%)",
} as const;
