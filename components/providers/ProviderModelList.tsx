"use client";

import { Badge } from "@/components/ui/badge";
import type { ProviderModel } from "@/lib/providers/catalog";

interface ProviderModelListProps {
  models: ProviderModel[];
}

function formatPrice(price: number | null): string {
  if (price === null) return "—";
  if (price < 0.1) return `$${price.toFixed(3)}`;
  return `$${price.toFixed(2)}`;
}

const STRENGTH_COLORS: Record<string, string> = {
  coding: "bg-violet-500/15 text-violet-400 dark:text-violet-300 border-violet-500/20",
  reasoning: "bg-blue-500/15 text-blue-400 dark:text-blue-300 border-blue-500/20",
  "math-science": "bg-amber-500/15 text-amber-400 dark:text-amber-300 border-amber-500/20",
  multimodal: "bg-pink-500/15 text-pink-400 dark:text-pink-300 border-pink-500/20",
  "cost-efficiency": "bg-emerald-500/15 text-emerald-400 dark:text-emerald-300 border-emerald-500/20",
  "context-length": "bg-cyan-500/15 text-cyan-400 dark:text-cyan-300 border-cyan-500/20",
  "tool-use": "bg-orange-500/15 text-orange-400 dark:text-orange-300 border-orange-500/20",
  speed: "bg-lime-500/15 text-lime-400 dark:text-lime-300 border-lime-500/20",
};

export function ProviderModelList({ models }: ProviderModelListProps) {
  if (models.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-3">
        No models cataloged for this provider.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Available Models
      </div>
      <div className="space-y-2">
        {models.map((model) => (
          <div
            key={model.id}
            className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border bg-muted/20"
          >
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium text-foreground truncate">
                {model.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {model.strengths.slice(0, 3).map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className={`text-xs px-1.5 py-0 ${STRENGTH_COLORS[s] ?? ""}`}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0 space-y-0.5">
              <div className="text-xs tabular-nums text-muted-foreground">
                {model.contextFormatted} ctx
              </div>
              <div className="text-xs text-text-tertiary tabular-nums">
                {formatPrice(model.inputPrice)} /{" "}
                {formatPrice(model.outputPrice)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
