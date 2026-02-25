"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ModelUsageRow } from "@/hooks/useAnalytics";
import { formatTokens, formatCost } from "@/lib/cost/calculator";
import { resolveModelPricing } from "@/lib/cost/pricing";
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
  return resolveModelPricing(modelId)?.pricing ?? null;
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
  if (previous == null) {
    return (
      <div className="text-micro text-muted-foreground flex items-center justify-end gap-0.5 leading-none mt-0.5">
        <Minus size={8} />
        0%
      </div>
    );
  }

  if (previous === 0) {
    if (current === 0) {
      return (
        <div className="text-micro text-muted-foreground flex items-center justify-end gap-0.5 leading-none mt-0.5">
          <Minus size={8} />
          0%
        </div>
      );
    }

    return (
      <div
        className={cn(
          "text-micro flex items-center justify-end gap-0.5 leading-none mt-0.5",
          invert ? "text-destructive" : "text-success",
        )}
      >
        <TrendingUp size={8} />
        new
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
  compareLabels?: [string, string];
}

function makeEmptyRow(model: string): ModelUsageRow {
  return {
    model,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    cost: 0,
    messageCount: 0,
    sessionCount: 0,
    unpricedTokens: 0,
  };
}

function formatSignedCost(value: number): string {
  const abs = formatCost(Math.abs(value));
  return `${value >= 0 ? "+" : "-"}${abs}`;
}

export function ModelBreakdownTable({
  data,
  compareData,
  compareLabels,
}: Props) {
  const compareMap = useMemo(() => {
    if (!compareData) return null;
    const map = new Map<string, ModelUsageRow>();
    for (const row of compareData) map.set(row.model, row);
    return map;
  }, [compareData]);

  const mergedRows = useMemo(() => {
    if (!compareMap) {
      return data
        .map((row) => ({ model: row.model, current: row, previous: undefined }))
        .sort((a, b) => b.current.cost - a.current.cost);
    }

    const byModel = new Map<
      string,
      { model: string; current?: ModelUsageRow; previous?: ModelUsageRow }
    >();

    for (const row of data) {
      byModel.set(row.model, { model: row.model, current: row });
    }
    for (const row of compareData ?? []) {
      const existing = byModel.get(row.model);
      byModel.set(row.model, existing ? { ...existing, previous: row } : { model: row.model, previous: row });
    }

    return Array.from(byModel.values()).sort((a, b) => {
      const aCost = Math.max(a.current?.cost ?? 0, a.previous?.cost ?? 0);
      const bCost = Math.max(b.current?.cost ?? 0, b.previous?.cost ?? 0);
      return bCost - aCost;
    });
  }, [data, compareData, compareMap]);

  if (mergedRows.length === 0) return null;

  const labelA = compareLabels?.[0] ?? "Primary";
  const labelB = compareLabels?.[1] ?? "Comparison";

  const totals = data.reduce(
    (acc, row) => ({
      inputTokens: acc.inputTokens + row.inputTokens,
      outputTokens: acc.outputTokens + row.outputTokens,
      reasoningTokens: acc.reasoningTokens + (row.reasoningTokens || 0),
      cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + row.cacheWriteTokens,
      messageCount: acc.messageCount + row.messageCount,
      sessionCount: acc.sessionCount + row.sessionCount,
      cost: acc.cost + row.cost,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
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
      reasoningTokens: acc.reasoningTokens + (row.reasoningTokens || 0),
      cacheReadTokens: acc.cacheReadTokens + row.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + row.cacheWriteTokens,
      messageCount: acc.messageCount + row.messageCount,
      sessionCount: acc.sessionCount + row.sessionCount,
      cost: acc.cost + row.cost,
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      messageCount: 0,
      sessionCount: 0,
      cost: 0,
    },
  );

  const sharedCount = mergedRows.filter((row) => row.current && row.previous).length;
  const onlyCurrentCount = mergedRows.filter((row) => row.current && !row.previous).length;
  const onlyPreviousCount = mergedRows.filter((row) => !row.current && row.previous).length;

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-section-title">Model Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        {compareMap && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
              Shared {sharedCount}
            </span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
              {labelA} only {onlyCurrentCount}
            </span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-1">
              {labelB} only {onlyPreviousCount}
            </span>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="table-readable w-full">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 pr-3 font-medium">Model</th>
                <th className="text-right py-2 px-3 font-medium">Input</th>
                <th className="text-right py-2 px-3 font-medium">Output</th>
                <th className="text-right py-2 px-3 font-medium">Reasoning</th>
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
              {mergedRows.map(({ model, current, previous }) => {
                const row = current ?? makeEmptyRow(model);
                const pricing = getPricing(row.model);
                const prev = previous;
                const providerId = getModelProvider(row.model);
                const providerLabel =
                  getSessionProvider(providerId)?.label ?? providerId;
                const presenceLabel = current && previous
                  ? null
                  : current
                    ? `${labelA} only`
                    : `${labelB} only`;
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
                      {presenceLabel && (
                        <div className="text-meta mt-0.5 text-muted-foreground">
                          {presenceLabel}
                        </div>
                      )}
                      {pricing ? (
                        <div className="text-meta mt-0.5">
                          {formatRate(pricing.input)} →{" "}
                          {formatRate(pricing.output)} · cr{" "}
                          {formatRate(pricing.cacheRead)} / cw{" "}
                          {formatRate(pricing.cacheWrite)}
                        </div>
                      ) : (
                        <div className="text-meta mt-0.5 text-amber-700 dark:text-amber-300">
                          Unpriced model
                        </div>
                      )}
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
                      {formatTokens(row.reasoningTokens || 0)}
                      <Delta
                        current={row.reasoningTokens || 0}
                        previous={prev ? (prev.reasoningTokens || 0) : undefined}
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
                      {prev && (
                        <div className="text-micro text-muted-foreground leading-none mt-0.5">
                          {formatSignedCost(row.cost - prev.cost)}
                        </div>
                      )}
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
                  {formatTokens(totals.reasoningTokens)}
                  <Delta
                    current={totals.reasoningTokens}
                    previous={prevTotals?.reasoningTokens}
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
