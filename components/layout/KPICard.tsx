import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KPICardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  subtitle?: string;
  trend?: { pctChange: number; invertTrend?: boolean };
  pulse?: boolean;
  animationDelay?: number;
}

export function KPICard({
  label,
  value,
  icon: Icon,
  color = "text-primary",
  subtitle,
  trend,
  pulse,
  animationDelay,
}: KPICardProps) {
  return (
    <Card
      className="bg-card animate-fade-in-up"
      style={
        animationDelay ? { animationDelay: `${animationDelay}ms` } : undefined
      }
    >
      <CardContent className="px-4 py-3 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-data-label flex items-center gap-1.5 truncate">
            <Icon size={11} className={cn(color, "shrink-0")} />
            {label}
          </span>
          {pulse && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
          )}
        </div>
        <div className="text-data-value truncate">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        {subtitle && (
          <div className="text-micro text-muted-foreground">{subtitle}</div>
        )}
        {trend && trend.pctChange !== 0 && (
          <div
            className={cn(
              "flex items-center gap-1 mt-1 text-micro whitespace-nowrap",
              trend.pctChange > 0
                ? trend.invertTrend
                  ? "text-destructive"
                  : "text-success"
                : trend.invertTrend
                  ? "text-success"
                  : "text-destructive",
            )}
          >
            {(trend.pctChange > 0) !== !!trend.invertTrend ? (
              <TrendingUp size={10} className="shrink-0" />
            ) : (
              <TrendingDown size={10} className="shrink-0" />
            )}
            {Math.abs(trend.pctChange).toFixed(1)}%
          </div>
        )}
      </CardContent>
    </Card>
  );
}
