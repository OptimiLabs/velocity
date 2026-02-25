"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MODEL_PRICING } from "@/lib/cost/pricing";
import { ChevronDown, ChevronRight } from "lucide-react";

function formatModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
  return `${(tokens / 1_000).toFixed(0)}K`;
}

export function ModelPricingTable() {
  const [open, setOpen] = useState(false);

  const models = Object.entries(MODEL_PRICING).sort(
    ([, a], [, b]) => b.output - a.output,
  );

  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 cursor-pointer text-left w-full"
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <CardTitle className="text-section-title">
            Pricing Reference
          </CardTitle>
        </button>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="table-readable w-full">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-medium">Model</th>
                  <th className="text-right py-2 px-3 font-medium">
                    Input $/M
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    Output $/M
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    Cache Read $/M
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    Cache Write 5m $/M
                  </th>
                  <th className="text-right py-2 px-3 font-medium">
                    Cache Write 1h $/M
                  </th>
                  <th className="text-right py-2 pl-3 font-medium">Context</th>
                </tr>
              </thead>
              <tbody>
                {models.map(([model, pricing]) => (
                  <tr key={model} className="border-b border-border/30">
                    <td className="py-2 pr-3 font-mono" title={model}>
                      {formatModelName(model)}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      ${pricing.input.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      ${pricing.output.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      ${pricing.cacheRead.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      ${pricing.cacheWrite.toFixed(2)}
                    </td>
                    <td className="text-right py-2 px-3 text-muted-foreground">
                      ${pricing.cacheWrite1h.toFixed(2)}
                    </td>
                    <td className="text-right py-2 pl-3 text-muted-foreground">
                      {formatContextWindow(pricing.contextWindow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
