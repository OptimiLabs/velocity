"use client";

import { Badge } from "@/components/ui/badge";
import {
  type LandscapeModel,
  type ModelProvider,
  PROVIDER_COLORS,
  getProviderLabel,
  formatContextWindow,
} from "@/lib/compare/landscape";
import { cn } from "@/lib/utils";

interface Props {
  models: LandscapeModel[];
  activeProvider?: ModelProvider | null;
}

function formatPrice(input: number | null, output: number | null): string {
  if (input === null || output === null) return "Open-weight";
  return `$${input < 1 ? input.toFixed(2) : input.toFixed(0)} / $${output < 1 ? output.toFixed(2) : output.toFixed(0)} per 1M`;
}

const STRENGTH_LABELS: Record<string, string> = {
  coding: "Coding",
  "math-science": "Math/Sci",
  reasoning: "Reasoning",
  multimodal: "Multimodal",
  "cost-efficiency": "Cost-efficient",
  "context-length": "Long context",
  "tool-use": "Tool use",
  speed: "Speed",
};

export function ModelOverviewGrid({ models, activeProvider }: Props) {
  const filtered = activeProvider
    ? models.filter((m) => m.provider === activeProvider)
    : models;

  return (
    <div className="max-h-[420px] overflow-y-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((model) => {
          const colors = PROVIDER_COLORS[model.provider];
          return (
            <div
              key={model.id}
              className="rounded-lg border border-border/60 bg-card p-4 space-y-3"
            >
              {/* Provider badge + name */}
              <div>
                <Badge
                  className={cn(
                    "text-micro mb-1.5",
                    colors.bg,
                    colors.text,
                    colors.border,
                  )}
                >
                  {getProviderLabel(model.provider)}
                </Badge>
                <h3 className="font-mono text-sm font-semibold">
                  {model.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {model.keyFeature}
                </p>
              </div>

              {/* Pricing + context */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-mono tabular-nums">
                    {formatPrice(model.inputPrice, model.outputPrice)}
                  </span>
                </div>
                {model.contextWindow > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Context</span>
                    <span className="font-mono tabular-nums">
                      {formatContextWindow(model.contextWindow)}
                      {model.contextNote && (
                        <span className="text-muted-foreground/60 ml-1">
                          ({model.contextNote})
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Strength badges */}
              <div className="flex flex-wrap gap-1">
                {model.strengths.slice(0, 3).map((s) => (
                  <Badge key={s} variant="outline" className="text-micro">
                    {STRENGTH_LABELS[s] ?? s}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
