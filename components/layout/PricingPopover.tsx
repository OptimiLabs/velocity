"use client";

import { useState } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, Calculator, Table2 } from "lucide-react";
import { MODEL_PRICING } from "@/lib/cost/pricing";
import { formatCost } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";

type Tab = "table" | "calculator";

function formatModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  return `${(tokens / 1_000).toFixed(0)}K`;
}

function PricingTable() {
  const models = Object.entries(MODEL_PRICING).sort(
    ([, a], [, b]) => b.output - a.output,
  );

  return (
    <div className="overflow-x-auto">
      <table className="table-readable table-readable-compact w-full text-micro">
        <thead>
          <tr className="border-b border-border/50 text-muted-foreground">
            <th className="text-left py-1.5 pr-2 font-medium">Model</th>
            <th className="text-right py-1.5 px-1.5 font-medium">Input</th>
            <th className="text-right py-1.5 px-1.5 font-medium">Output</th>
            <th className="text-right py-1.5 px-1.5 font-medium">Cache R</th>
            <th className="text-right py-1.5 px-1.5 font-medium">Cache W</th>
            <th className="text-right py-1.5 pl-1.5 font-medium">Ctx</th>
          </tr>
        </thead>
        <tbody>
          {models.map(([model, pricing]) => (
            <tr key={model} className="border-b border-border/20">
              <td
                className="py-1.5 pr-2 font-mono truncate max-w-[100px]"
                title={model}
              >
                {formatModelName(model)}
              </td>
              <td className="text-right py-1.5 px-1.5 tabular-nums text-muted-foreground">
                ${pricing.input.toFixed(2)}
              </td>
              <td className="text-right py-1.5 px-1.5 tabular-nums text-muted-foreground">
                ${pricing.output.toFixed(2)}
              </td>
              <td className="text-right py-1.5 px-1.5 tabular-nums text-muted-foreground">
                ${pricing.cacheRead.toFixed(2)}
              </td>
              <td className="text-right py-1.5 px-1.5 tabular-nums text-muted-foreground">
                ${pricing.cacheWrite.toFixed(2)}
              </td>
              <td className="text-right py-1.5 pl-1.5 tabular-nums text-muted-foreground">
                {formatContextWindow(pricing.contextWindow)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-micro text-muted-foreground/50 mt-1.5">
        All prices per million tokens. Cache Write = 5-min TTL rate.
      </div>
    </div>
  );
}

function PricingCalculator() {
  const modelKeys = Object.keys(MODEL_PRICING);
  const [selectedModel, setSelectedModel] = useState(modelKeys[0]);
  const [inputTokens, setInputTokens] = useState("");
  const [outputTokens, setOutputTokens] = useState("");
  const [cacheReadTokens, setCacheReadTokens] = useState("");
  const [cacheWriteTokens, setCacheWriteTokens] = useState("");

  const pricing = MODEL_PRICING[selectedModel];

  const inp = parseFloat(inputTokens) || 0;
  const out = parseFloat(outputTokens) || 0;
  const cr = parseFloat(cacheReadTokens) || 0;
  const cw = parseFloat(cacheWriteTokens) || 0;

  const cost = {
    input: (inp / 1_000_000) * pricing.input,
    output: (out / 1_000_000) * pricing.output,
    cacheRead: (cr / 1_000_000) * pricing.cacheRead,
    cacheWrite: (cw / 1_000_000) * pricing.cacheWrite,
    total:
      (inp / 1_000_000) * pricing.input +
      (out / 1_000_000) * pricing.output +
      (cr / 1_000_000) * pricing.cacheRead +
      (cw / 1_000_000) * pricing.cacheWrite,
  };

  return (
    <div className="space-y-3">
      <Select value={selectedModel} onValueChange={setSelectedModel}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {modelKeys.map((m) => (
            <SelectItem key={m} value={m} className="text-xs font-mono">
              {formatModelName(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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
            Cache read
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
            Cache write
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

      {/* Cost breakdown */}
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
            <span className="tabular-nums">{formatCost(cost.output)}</span>
          </div>
        )}
        {cost.cacheRead > 0 && (
          <div className="flex justify-between text-micro">
            <span className="text-muted-foreground">Cache read</span>
            <span className="tabular-nums">{formatCost(cost.cacheRead)}</span>
          </div>
        )}
        {cost.cacheWrite > 0 && (
          <div className="flex justify-between text-micro">
            <span className="text-muted-foreground">Cache write</span>
            <span className="tabular-nums">{formatCost(cost.cacheWrite)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs font-medium pt-1 border-t border-border/30">
          <span>Total</span>
          <span className="tabular-nums">{formatCost(cost.total)}</span>
        </div>
      </div>
    </div>
  );
}

export function PricingPopover() {
  const [tab, setTab] = useState<Tab>("table");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          title="Pricing reference & calculator"
        >
          <DollarSign size={13} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-[380px] p-0">
        {/* Tab bar */}
        <div className="flex items-center border-b border-border/50 px-3 pt-2 pb-0">
          <button
            onClick={() => setTab("table")}
            className={cn(
              "flex items-center gap-1.5 px-2 pb-2 text-xs font-medium border-b-2 transition-colors",
              tab === "table"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Table2 size={12} />
            Pricing
          </button>
          <button
            onClick={() => setTab("calculator")}
            className={cn(
              "flex items-center gap-1.5 px-2 pb-2 text-xs font-medium border-b-2 transition-colors",
              tab === "calculator"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Calculator size={12} />
            Calculator
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          {tab === "table" ? <PricingTable /> : <PricingCalculator />}
        </div>
      </PopoverContent>
    </Popover>
  );
}
