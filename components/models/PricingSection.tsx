"use client";

import { useState } from "react";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingComparisonTable } from "@/components/models/PricingComparisonTable";
import { PricingCalculator } from "@/components/models/PricingCalculator";

type PricingTab = "comparison" | "calculator";

interface PricingSectionProps {
  activeModel: string;
}

export function PricingSection({ activeModel }: PricingSectionProps) {
  const [activeTab, setActiveTab] = useState<PricingTab>("comparison");

  return (
    <div className="rounded-lg border border-border/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign size={14} className="text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Pricing</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeTab === "comparison"
                ? "Per-million-token pricing across all models with known rates"
                : "Enter token counts to estimate costs across all models"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-md">
          <button
            onClick={() => setActiveTab("comparison")}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              activeTab === "comparison"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Comparison
          </button>
          <button
            onClick={() => setActiveTab("calculator")}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              activeTab === "calculator"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Calculator
          </button>
        </div>
      </div>

      {activeTab === "comparison" ? (
        <PricingComparisonTable activeModel={activeModel} />
      ) : (
        <div className="p-4">
          <PricingCalculator />
        </div>
      )}

      <div className="px-4 py-2 border-t border-border/60 bg-muted/10">
        <span className="text-micro text-muted-foreground/60">
          {activeTab === "comparison"
            ? "Models with variable pricing (Codex, Deep Think) excluded. Click column headers to sort."
            : "Cache pricing available for Claude models only. Other models use standard input/output rates."}
        </span>
      </div>
    </div>
  );
}
