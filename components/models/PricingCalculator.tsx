"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODEL_PRICING } from "@/lib/cost/pricing";
import {
  getModelsWithPricing,
  getProviderLabel,
  type LandscapeModel,
  type ModelProvider,
} from "@/lib/compare/landscape";
import { formatCost } from "@/lib/cost/calculator";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "single" | "compare";

interface CostResult {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

export function PricingCalculator() {
  const landscapeModels = useMemo(() => getModelsWithPricing(), []);

  // Group models by provider for the dropdown
  const groupedModels = useMemo(() => {
    const groups = new Map<ModelProvider, LandscapeModel[]>();
    for (const m of landscapeModels) {
      const list = groups.get(m.provider) ?? [];
      list.push(m);
      groups.set(m.provider, list);
    }
    return groups;
  }, [landscapeModels]);

  const [mode, setMode] = useState<Mode>("compare");
  const [selectedModel, setSelectedModel] = useState(
    landscapeModels[0]?.id ?? "",
  );
  const [inputTokens, setInputTokens] = useState("");
  const [outputTokens, setOutputTokens] = useState("");
  const [cacheReadTokens, setCacheReadTokens] = useState("");
  const [cacheWriteTokens, setCacheWriteTokens] = useState("");

  const inp = parseFloat(inputTokens) || 0;
  const out = parseFloat(outputTokens) || 0;
  const cr = parseFloat(cacheReadTokens) || 0;
  const cw = parseFloat(cacheWriteTokens) || 0;

  const hasTokens = inp > 0 || out > 0 || cr > 0 || cw > 0;

  function calcCost(model: LandscapeModel): CostResult {
    // Use detailed MODEL_PRICING if available (Claude models with cache pricing)
    const detailedPricing = MODEL_PRICING[model.id];
    if (detailedPricing) {
      const input = (inp / 1_000_000) * detailedPricing.input;
      const output = (out / 1_000_000) * detailedPricing.output;
      const cacheRead = (cr / 1_000_000) * detailedPricing.cacheRead;
      const cacheWrite = (cw / 1_000_000) * detailedPricing.cacheWrite;
      return {
        input,
        output,
        cacheRead,
        cacheWrite,
        total: input + output + cacheRead + cacheWrite,
      };
    }
    // Fallback: use landscape pricing (input/output only)
    const input = (inp / 1_000_000) * (model.inputPrice ?? 0);
    const output = (out / 1_000_000) * (model.outputPrice ?? 0);
    return {
      input,
      output,
      cacheRead: 0,
      cacheWrite: 0,
      total: input + output,
    };
  }

  const selectedLandscape = landscapeModels.find((m) => m.id === selectedModel);

  return (
    <div className="space-y-4">
      {/* Toolbar: toggle left, model selector + reset right */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 p-0.5 bg-muted/40 rounded-md">
          <button
            onClick={() => setMode("single")}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              mode === "single"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Single model
          </button>
          <button
            onClick={() => setMode("compare")}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              mode === "compare"
                ? "bg-background text-foreground shadow-sm font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Compare all
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {mode === "single" && (
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-7 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(groupedModels.entries()).map(
                  ([provider, models]) => (
                    <SelectGroup key={provider}>
                      <SelectLabel className="text-micro">
                        {getProviderLabel(provider)}
                      </SelectLabel>
                      {models.map((m) => (
                        <SelectItem
                          key={m.id}
                          value={m.id}
                          className="text-xs font-mono"
                        >
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ),
                )}
              </SelectContent>
            </Select>
          )}
          {hasTokens && (
            <button
              onClick={() => {
                setInputTokens("");
                setOutputTokens("");
                setCacheReadTokens("");
                setCacheWriteTokens("");
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-muted/50 transition-colors"
              title="Reset token values"
            >
              <RotateCcw size={11} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Token inputs */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-micro text-muted-foreground mb-0.5 block">
            Input tokens
          </label>
          <Input
            type="number"
            min={0}
            value={inputTokens}
            onChange={(e) => setInputTokens(e.target.value)}
            placeholder="0"
            className="h-7 text-xs font-mono"
          />
        </div>
        <div>
          <label className="text-micro text-muted-foreground mb-0.5 block">
            Output tokens
          </label>
          <Input
            type="number"
            min={0}
            value={outputTokens}
            onChange={(e) => setOutputTokens(e.target.value)}
            placeholder="0"
            className="h-7 text-xs font-mono"
          />
        </div>
        <div>
          <label className="text-micro text-muted-foreground mb-0.5 block">
            Cache read{" "}
            <span className="text-muted-foreground/50">(Claude only)</span>
          </label>
          <Input
            type="number"
            min={0}
            value={cacheReadTokens}
            onChange={(e) => setCacheReadTokens(e.target.value)}
            placeholder="0"
            className="h-7 text-xs font-mono"
          />
        </div>
        <div>
          <label className="text-micro text-muted-foreground mb-0.5 block">
            Cache write{" "}
            <span className="text-muted-foreground/50">(Claude only)</span>
          </label>
          <Input
            type="number"
            min={0}
            value={cacheWriteTokens}
            onChange={(e) => setCacheWriteTokens(e.target.value)}
            placeholder="0"
            className="h-7 text-xs font-mono"
          />
        </div>
      </div>

      {/* Results */}
      {mode === "compare" ? (
        hasTokens ? (
          <div className="border-t border-border/50 pt-3">
            <div className="text-xs font-medium mb-2">Cost comparison</div>
            <div className="space-y-1.5">
              {landscapeModels.map((model) => {
                const cost = calcCost(model);
                return (
                  <div
                    key={model.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="font-mono text-muted-foreground">
                      {model.label}
                    </span>
                    <div className="flex items-center gap-3 tabular-nums">
                      <span className="text-muted-foreground/60 text-micro">
                        in {formatCost(cost.input)} · out{" "}
                        {formatCost(cost.output)}
                      </span>
                      <span className="font-medium min-w-[52px] text-right">
                        {formatCost(cost.total)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="border-t border-border/50 pt-3 text-xs text-muted-foreground">
            Enter token counts above to compare costs across models.
          </div>
        )
      ) : (
        (() => {
          if (!selectedLandscape) return null;
          const cost = calcCost(selectedLandscape);
          return (
            <div className="border-t border-border/50 pt-2 space-y-1">
              {cost.input > 0 && (
                <div className="flex justify-between text-micro">
                  <span className="text-muted-foreground">Input</span>
                  <span className="tabular-nums">{formatCost(cost.input)}</span>
                </div>
              )}
              {cost.output > 0 && (
                <div className="flex justify-between text-micro">
                  <span className="text-muted-foreground">Output</span>
                  <span className="tabular-nums">
                    {formatCost(cost.output)}
                  </span>
                </div>
              )}
              {cost.cacheRead > 0 && (
                <div className="flex justify-between text-micro">
                  <span className="text-muted-foreground">Cache read</span>
                  <span className="tabular-nums">
                    {formatCost(cost.cacheRead)}
                  </span>
                </div>
              )}
              {cost.cacheWrite > 0 && (
                <div className="flex justify-between text-micro">
                  <span className="text-muted-foreground">Cache write</span>
                  <span className="tabular-nums">
                    {formatCost(cost.cacheWrite)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs font-medium pt-1 border-t border-border/30">
                <span>Total</span>
                <span className="tabular-nums">{formatCost(cost.total)}</span>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
