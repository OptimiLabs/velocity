"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ModelUsageRow } from "@/hooks/useAnalytics";

interface Totals {
  total_cost: number;
  total_messages: number;
  total_sessions: number;
  total_tool_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
}

interface Recommendation {
  severity: "info" | "warning" | "tip";
  title: string;
  detail: string;
}

const severityDotColor = {
  tip: "bg-success",
  warning: "bg-yellow-500",
  info: "bg-blue-400",
};

function generateRecommendations(
  totals: Totals,
  previousTotals?: Totals,
  models?: ModelUsageRow[],
): Recommendation[] {
  const recs: Recommendation[] = [];

  // Cache hit rate
  const cacheHitRate =
    totals.total_cache_read_tokens +
      totals.total_input_tokens +
      (totals.total_cache_write_tokens || 0) >
    0
      ? totals.total_cache_read_tokens /
        (totals.total_input_tokens +
          totals.total_cache_read_tokens +
          (totals.total_cache_write_tokens || 0))
      : 0;

  if (cacheHitRate < 0.3 && totals.total_input_tokens > 10000) {
    recs.push({
      severity: "warning",
      title: "Low cache utilization",
      detail: `Cache hit rate is ${(cacheHitRate * 100).toFixed(0)}%. Structuring prompts for caching could save ${((1 - cacheHitRate) * 0.9 * totals.total_cost * 0.1).toFixed(2)} or more.`,
    });
  }

  // Cost trending up
  if (previousTotals && previousTotals.total_cost > 0) {
    const costGrowth =
      ((totals.total_cost - previousTotals.total_cost) /
        previousTotals.total_cost) *
      100;
    if (costGrowth > 20) {
      recs.push({
        severity: "warning",
        title: "Rising costs",
        detail: `Costs are up ${costGrowth.toFixed(0)}% vs the previous period. Review expensive sessions for optimization opportunities.`,
      });
    }
  }

  // Model concentration
  if (models && models.length > 0) {
    const totalModelCost = models.reduce((s, m) => s + m.cost, 0);
    const topModel = models[0];
    if (topModel && totalModelCost > 0) {
      const topPct = topModel.cost / totalModelCost;
      if (topPct > 0.8) {
        recs.push({
          severity: "tip",
          title: "Single model dominance",
          detail: `${topModel.model.replace("claude-", "")} accounts for ${(topPct * 100).toFixed(0)}% of costs. Consider using cheaper models for simpler tasks.`,
        });
      }
    }
  }

  // High tool usage per session
  const avgToolsPerSession =
    totals.total_sessions > 0
      ? totals.total_tool_calls / totals.total_sessions
      : 0;
  if (avgToolsPerSession > 30) {
    recs.push({
      severity: "tip",
      title: "High tool usage per session",
      detail: `Average ${avgToolsPerSession.toFixed(0)} tool calls/session. Subagent delegation can parallelize and reduce total tokens.`,
    });
  }

  // Output-heavy
  const outputRatio =
    totals.total_input_tokens > 0
      ? totals.total_output_tokens / totals.total_input_tokens
      : 0;
  if (outputRatio > 3 && totals.total_output_tokens > 100000) {
    recs.push({
      severity: "info",
      title: "Output-heavy usage",
      detail: `Output tokens are ${outputRatio.toFixed(1)}x input. Output costs 3-5x more — shorter responses or code-only output can reduce costs.`,
    });
  }

  return recs;
}

interface OptimizationRecommendationsProps {
  totals: Totals;
  previousTotals?: Totals;
  models?: ModelUsageRow[];
}

export function OptimizationRecommendations({
  totals,
  previousTotals,
  models,
}: OptimizationRecommendationsProps) {
  const recs = generateRecommendations(totals, previousTotals, models);

  if (recs.length === 0) return null;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">
          Optimization Recommendations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {recs.map((r, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-1 w-2 h-2 rounded-full shrink-0",
                  severityDotColor[r.severity],
                )}
              />
              <div className="text-xs">
                <span className="font-medium">{r.title}</span>
                <span className="text-muted-foreground ml-1.5">{r.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
