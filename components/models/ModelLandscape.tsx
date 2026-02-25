"use client";

import { useMemo, useState } from "react";
import {
  LANDSCAPE_MODELS,
  type ModelProvider,
  PROVIDER_COLORS,
  getProviderLabel,
} from "@/lib/compare/landscape";
import { cn } from "@/lib/utils";
import { PricingComparisonTable } from "@/components/models/PricingComparisonTable";
import { PricingCalculator } from "@/components/models/PricingCalculator";
import { BenchmarkSection } from "@/components/models/BenchmarkSection";
import { ProviderFeatureMatrix } from "@/components/models/ProviderFeatureMatrix";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type MainTab = "models" | "benchmarks" | "providers";
type ModelsView = "table" | "calculator";

export function ModelLandscape() {
  const [activeModel, setActiveModel] = useState<string>("all");
  const [mainTab, setMainTab] = useState<MainTab>("models");
  const [modelsView, setModelsView] = useState<ModelsView>("table");
  const [activeProvider, setActiveProvider] = useState<ModelProvider | null>(
    null,
  );

  const providers = useMemo(() => {
    const seen = new Set<ModelProvider>();
    for (const m of LANDSCAPE_MODELS) seen.add(m.provider);
    return [...seen];
  }, []);

  return (
    <div className="space-y-6">
      {/* Main tab bar + model focus filter */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-md w-fit">
          <button
            onClick={() => setMainTab("models")}
            className={cn(
              "px-3 py-1.5 text-xs rounded transition-colors",
              mainTab === "models"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Models
          </button>
          <button
            onClick={() => setMainTab("benchmarks")}
            className={cn(
              "px-3 py-1.5 text-xs rounded transition-colors",
              mainTab === "benchmarks"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Benchmarks
          </button>
          <button
            onClick={() => setMainTab("providers")}
            className={cn(
              "px-3 py-1.5 text-xs rounded transition-colors",
              mainTab === "providers"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Providers
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Focus on:</span>
          <Select value={activeModel} onValueChange={setActiveModel}>
            <SelectTrigger className="h-7 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {LANDSCAPE_MODELS.map((m) => (
                <SelectItem
                  key={m.id}
                  value={m.id}
                  className="text-xs font-mono"
                >
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Provider filter pills — directly above content */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setActiveProvider(null)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-full border transition-colors",
            activeProvider === null
              ? "bg-foreground text-background border-foreground font-medium"
              : "bg-muted/50 text-muted-foreground border-border/60 hover:text-foreground hover:border-border",
          )}
        >
          All
        </button>
        {providers.map((p) => {
          const colors = PROVIDER_COLORS[p];
          const isActive = activeProvider === p;
          return (
            <button
              key={p}
              onClick={() => setActiveProvider(isActive ? null : p)}
              className={cn(
                "px-2.5 py-1 text-xs rounded-full border transition-colors",
                isActive
                  ? cn(colors.bg, colors.text, colors.border, "font-medium")
                  : "bg-muted/50 text-muted-foreground border-border/60 hover:text-foreground hover:border-border",
              )}
            >
              {getProviderLabel(p)}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {mainTab === "models" && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                {activeModel !== "all"
                  ? LANDSCAPE_MODELS.find((m) => m.id === activeModel)?.label
                  : activeProvider
                    ? `${getProviderLabel(activeProvider)} models`
                    : "All models"}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Compare pricing and capabilities across providers
              </p>
            </div>
            <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-md">
              <button
                onClick={() => setModelsView("table")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded transition-colors",
                  modelsView === "table"
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Table
              </button>
              <button
                onClick={() => setModelsView("calculator")}
                className={cn(
                  "px-2.5 py-1 text-xs rounded transition-colors",
                  modelsView === "calculator"
                    ? "bg-background text-foreground shadow-sm font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Calculator
              </button>
            </div>
          </div>

          {modelsView === "table" ? (
            <PricingComparisonTable activeModel={activeModel} activeProvider={activeProvider} />
          ) : (
            <div className="p-4">
              <PricingCalculator />
            </div>
          )}
        </div>
      )}

      {mainTab === "benchmarks" && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
            <h3 className="text-sm font-semibold">Benchmark comparison</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Head-to-head performance on standardized benchmarks
            </p>
          </div>

          <BenchmarkSection activeModel={activeModel} onModelChange={setActiveModel} />
        </div>
      )}

      {mainTab === "providers" && (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
            <h3 className="text-sm font-semibold">Provider feature comparison</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on latest CLI versions as of Feb 2026
            </p>
          </div>

          <ProviderFeatureMatrix />
        </div>
      )}
    </div>
  );
}
