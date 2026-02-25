"use client";

import {
  RECOMMENDATIONS,
  PROVIDER_COLORS,
  getModelById,
  getProviderLabel,
} from "@/lib/compare/landscape";
import { cn } from "@/lib/utils";
import { Code, FlaskConical, FileVideo, Zap } from "lucide-react";

const ICONS: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  Code,
  FlaskConical,
  FileVideo,
  Zap,
};

export function RecommendationCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {RECOMMENDATIONS.map((rec) => {
        const Icon = ICONS[rec.iconName] ?? Code;
        const primary = getModelById(rec.primaryModel);
        const secondary = getModelById(rec.secondaryModel);

        return (
          <div
            key={rec.useCase}
            className="rounded-lg border border-border/60 bg-card p-4 space-y-3"
          >
            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted/50 shrink-0">
                <Icon size={16} className="text-muted-foreground" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">{rec.useCase}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {rec.description}
                </p>
              </div>
            </div>

            {/* Model chips */}
            <div className="space-y-2">
              {primary && (
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium",
                    PROVIDER_COLORS[primary.provider].bg,
                    PROVIDER_COLORS[primary.provider].text,
                    PROVIDER_COLORS[primary.provider].border,
                    "border",
                  )}
                >
                  <span className="font-mono">{primary.label}</span>
                  <span className="ml-auto text-micro opacity-70">
                    {getProviderLabel(primary.provider)}
                  </span>
                </div>
              )}
              {secondary && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground bg-muted/30 border border-border/30">
                  <span className="text-micro text-muted-foreground/60">
                    also consider
                  </span>
                  <span className="font-mono">{secondary.label}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
