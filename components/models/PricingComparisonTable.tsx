"use client";

import { useMemo, useState } from "react";
import {
  type ModelProvider,
  PROVIDER_COLORS,
  getProviderLabel,
  getModelsWithPricing,
  formatContextWindow,
} from "@/lib/compare/landscape";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type SortKey = "label" | "inputPrice" | "outputPrice" | "contextWindow";
type SortDir = "asc" | "desc";

function formatPrice(v: number): string {
  if (v < 1) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(2)}`;
}

function SortIcon({
  col,
  sortKey,
  sortDir,
}: {
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  if (sortKey !== col)
    return <ArrowUpDown size={11} className="text-muted-foreground/40" />;
  return sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />;
}

function RelativeBadge({ value, min }: { value: number; min: number }) {
  if (min <= 0) return null;
  const mult = value / min;
  if (mult <= 1.01) {
    return (
      <span className="ml-1.5 text-micro px-1 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400">
        min
      </span>
    );
  }
  if (mult >= 3) {
    return (
      <span className="ml-1.5 text-micro px-1 py-0.5 rounded bg-red-500/10 text-red-500">
        {mult.toFixed(1)}x
      </span>
    );
  }
  if (mult >= 1.5) {
    return (
      <span className="ml-1.5 text-micro px-1 py-0.5 rounded bg-muted text-muted-foreground">
        {mult.toFixed(1)}x
      </span>
    );
  }
  return null;
}

interface PricingComparisonTableProps {
  activeModel: string;
  activeProvider?: ModelProvider | null;
}

export function PricingComparisonTable({
  activeModel,
  activeProvider,
}: PricingComparisonTableProps) {
  const allModels = useMemo(() => getModelsWithPricing(), []);
  const models = useMemo(
    () =>
      activeProvider
        ? allModels.filter((m) => m.provider === activeProvider)
        : allModels,
    [allModels, activeProvider],
  );
  const [sortKey, setSortKey] = useState<SortKey>("outputPrice");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const sorted = useMemo(() => {
    const base =
      activeModel !== "all"
        ? models.filter((m) => m.id === activeModel)
        : models;

    return [...base].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;
      if (sortKey === "label") {
        aVal = a.label;
        bVal = b.label;
      } else {
        aVal = (a[sortKey] as number) ?? 0;
        bVal = (b[sortKey] as number) ?? 0;
      }
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [models, activeModel, sortKey, sortDir]);

  // Compute min values for relative badges (always from full set)
  const minInput = useMemo(
    () => Math.min(...models.map((m) => m.inputPrice!)),
    [models],
  );
  const minOutput = useMemo(
    () => Math.min(...models.map((m) => m.outputPrice!)),
    [models],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // If the selected model doesn't have pricing, show a message
  if (activeModel !== "all" && sorted.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
        This model has variable pricing
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table-readable w-full text-xs">
        <thead>
          <tr className="border-b border-border/40">
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground sticky left-0 bg-background z-10">
              <button
                onClick={() => toggleSort("label")}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                Model{" "}
                <SortIcon col="label" sortKey={sortKey} sortDir={sortDir} />
              </button>
            </th>
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
              Provider
            </th>
            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
              <button
                onClick={() => toggleSort("inputPrice")}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
              >
                Input / 1M{" "}
                <SortIcon
                  col="inputPrice"
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </button>
            </th>
            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
              <button
                onClick={() => toggleSort("outputPrice")}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
              >
                Output / 1M{" "}
                <SortIcon
                  col="outputPrice"
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </button>
            </th>
            <th className="text-right py-2.5 px-4 font-medium text-muted-foreground">
              <button
                onClick={() => toggleSort("contextWindow")}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors ml-auto"
              >
                Context{" "}
                <SortIcon
                  col="contextWindow"
                  sortKey={sortKey}
                  sortDir={sortDir}
                />
              </button>
            </th>
            <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">
              Best for
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m) => {
            const colors = PROVIDER_COLORS[m.provider];
            return (
              <tr
                key={m.id}
                className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="py-2.5 px-4 font-mono font-medium sticky left-0 bg-background z-10 whitespace-nowrap">
                  {m.label}
                </td>
                <td className="py-2.5 px-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        colors.bg,
                        colors.border,
                        "border",
                      )}
                    />
                    <span className="text-muted-foreground">
                      {getProviderLabel(m.provider)}
                    </span>
                  </span>
                </td>
                <td className="text-right py-2.5 px-4 tabular-nums whitespace-nowrap">
                  <span className="font-medium">
                    {formatPrice(m.inputPrice!)}
                  </span>
                  <RelativeBadge value={m.inputPrice!} min={minInput} />
                </td>
                <td className="text-right py-2.5 px-4 tabular-nums whitespace-nowrap">
                  <span className="font-medium">
                    {formatPrice(m.outputPrice!)}
                  </span>
                  <RelativeBadge value={m.outputPrice!} min={minOutput} />
                </td>
                <td className="text-right py-2.5 px-4 tabular-nums font-mono">
                  {formatContextWindow(m.contextWindow)}
                </td>
                <td className="py-2.5 px-4 text-muted-foreground max-w-[200px] truncate">
                  {m.keyFeature}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
