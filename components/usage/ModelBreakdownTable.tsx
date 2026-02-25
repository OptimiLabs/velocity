"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelUsageRow } from "@/hooks/useAnalytics";
import { formatTokens, formatCost } from "@/lib/cost/calculator";
import { MODEL_PRICING, DEFAULT_PRICING } from "@/lib/cost/pricing";
import { getAllSessionProviders, getSessionProvider } from "@/lib/providers/session-registry";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function formatModelName(model: string): string {
  if (model.startsWith("claude-")) {
    return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
  }
  return model;
}

function getModelProvider(model: string): string {
  const providers = getAllSessionProviders();
  for (const provider of providers) {
    if (provider.modelPrefixes.some((prefix) => model.startsWith(prefix))) {
      return provider.id;
    }
  }
  return "claude";
}

function getPricing(modelId: string) {
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];
  const key = Object.keys(MODEL_PRICING).find((k) => modelId.startsWith(k));
  return key ? MODEL_PRICING[key] : DEFAULT_PRICING;
}

function formatRate(n: number): string {
  return n < 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(0)}`;
}

function Delta({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous?: number;
  invert?: boolean;
}) {
  if (previous == null || previous === 0) {
    return (
      <div className="text-micro text-muted-foreground flex items-center justify-end gap-0.5 leading-none mt-0.5">
        <Minus size={8} />
        0%
      </div>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.1) {
    return (
      <div className="text-micro text-muted-foreground flex items-center justify-end gap-0.5 leading-none mt-0.5">
        <Minus size={8} />
        0%
      </div>
    );
  }

  const isUp = pct > 0;
  return (
    <div
      className={cn(
        "text-micro flex items-center justify-end gap-0.5 leading-none mt-0.5",
        isUp
          ? invert
            ? "text-destructive"
            : "text-success"
          : invert
            ? "text-success"
            : "text-destructive",
      )}
    >
      {isUp ? <TrendingUp size={8} /> : <TrendingDown size={8} />}
      {isUp ? "+" : ""}
      {Math.abs(pct).toFixed(1)}%
    </div>
  );
}

interface Props {
  data: ModelUsageRow[];
  compareData?: ModelUsageRow[];
}

export function ModelBreakdownTable({ data, compareData }: Props) {
  const compareMap = useMemo(() => {
    if (!compareData) return null;
    const map = new Map<string, ModelUsageRow>();
    for (const row of compareData) map.set(row.model, row);
    return map;
  }, [compareData]);

  if (data.length === 0) return null;

  const totals = data.reduce(
    (acc, row) => ({
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + row.cacheWriteTokens,
      messageCount: acc.messageCount + row.messageCount,
      sessionCount: acc.sessionCount + row.sessionCount,
      cost: acc.cost + row.cost,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      messageCount: 0,
      sessionCount: 0,
      cost: 0,
    },
  );

  const prevTotals = compareData?.reduce(
    (acc, row) => ({
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + row.cacheWriteTokens,
      messageCount: acc.messageCount + row.messageCount,
      sessionCount: acc.sessionCount + row.sessionCount,
      cost: acc.cost + row.cost,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      messageCount: 0,
      sessionCount: 0,
      cost: 0,
    },
  );

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Model Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="table-readable w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Model</th>
                <th className="text-right py-2 px-3 font-medium">Input</th>
                <th className="text-right py-2 px-3 font-medium">Output</th>
                <th className="text-right py-2 px-3 font-medium">Cache Read</th>
                <th className="text-right py-2 px-3 font-medium">
                  Cache Write
                </th>
                <th className="text-right py-2 px-3 font-medium">Messages</th>
                <th className="text-right py-2 px-3 font-medium">Sessions</th>
                <th className="text-right py-2 pl-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const pricing = getPricing(row.model);
                const prev = compareMap?.get(row.model);
                const providerId = getModelProvider(row.model);
                const providerLabel =
                  getSessionProvider(providerId)?.label ?? providerId;
                return (
                  <tr
                    key={row.model}
                    className="border-b border-border/60 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-2 pr-3" title={row.model}>
                      <div className="font-mono truncate">
                        {formatModelName(row.model)}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                        {providerLabel}
                      </div>
                      <div className="text-meta mt-0.5">
                        {formatRate(pricing.input)} →{" "}
                        {formatRate(pricing.output)} · cr{" "}
                        {formatRate(pricing.cacheRead)} / cw{" "}
                        {formatRate(pricing.cacheWrite)}
                      </div>
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {formatTokens(row.inputTokens)}
                      <Delta
                        current={row.inputTokens}
                        previous={prev?.inputTokens}
                      />
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {formatTokens(row.outputTokens)}
                      <Delta
                        current={row.outputTokens}
                        previous={prev?.outputTokens}
                      />
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {formatTokens(row.cacheReadTokens)}
                      <Delta
                        current={row.cacheReadTokens}
                        previous={prev?.cacheReadTokens}
                      />
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {formatTokens(row.cacheWriteTokens)}
                      <Delta
                        current={row.cacheWriteTokens}
                        previous={prev?.cacheWriteTokens}
                      />
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {row.messageCount.toLocaleString()}
                      <Delta
                        current={row.messageCount}
                        previous={prev?.messageCount}
                      />
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      {row.sessionCount.toLocaleString()}
                      <Delta
                        current={row.sessionCount}
                        previous={prev?.sessionCount}
                      />
                    </td>
                    <td className="text-right py-2 pl-3 font-medium text-foreground">
                      {formatCost(row.cost)}
                      <Delta current={row.cost} previous={prev?.cost} invert />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-medium text-foreground">
                <td className="py-2 pr-3">Total</td>
                <td className="text-right py-2 px-3">
                  {formatTokens(totals.inputTokens)}
                  <Delta
                    current={totals.inputTokens}
                    previous={prevTotals?.inputTokens}
                  />
                </td>
                <td className="text-right py-2 px-3">
                  {formatTokens(totals.outputTokens)}
                  <Delta
                    current={totals.outputTokens}
                    previous={prevTotals?.outputTokens}
                  />
                </td>
                <td className="text-right py-2 px-3">
                  {formatTokens(totals.cacheReadTokens)}
                  <Delta
                    current={totals.cacheReadTokens}
                    previous={prevTotals?.cacheReadTokens}
                  />
                </td>
                <td className="text-right py-2 px-3">
                  {formatTokens(totals.cacheWriteTokens)}
                  <Delta
                    current={totals.cacheWriteTokens}
                    previous={prevTotals?.cacheWriteTokens}
                  />
                </td>
                <td className="text-right py-2 px-3">
                  {totals.messageCount.toLocaleString()}
                  <Delta
                    current={totals.messageCount}
                    previous={prevTotals?.messageCount}
                  />
                </td>
                <td className="text-right py-2 px-3">
                  {totals.sessionCount.toLocaleString()}
                  <Delta
                    current={totals.sessionCount}
                    previous={prevTotals?.sessionCount}
                  />
                </td>
                <td className="text-right py-2 pl-3">
                  {formatCost(totals.cost)}
                  <Delta
                    current={totals.cost}
                    previous={prevTotals?.cost}
                    invert
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
