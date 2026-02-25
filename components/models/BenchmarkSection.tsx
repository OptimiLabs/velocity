"use client";

import { useMemo, useState } from "react";
import {
  BENCHMARK_DATA,
  LANDSCAPE_MODELS,
  type BenchmarkDomain,
  type BenchmarkEntry,
  getModelById,
} from "@/lib/compare/landscape";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DOMAINS: { value: BenchmarkDomain; label: string }[] = [
  { value: "math-science", label: "Math / Science" },
  { value: "coding", label: "Coding" },
  { value: "knowledge", label: "Knowledge" },
  { value: "vision", label: "Vision" },
];

const RANK_COLORS = {
  1: "text-yellow-600 dark:text-yellow-400",
  2: "text-zinc-400 dark:text-zinc-300",
  3: "text-orange-600 dark:text-orange-400",
} as const;

function getRankColor(rank: number): string {
  if (rank <= 3) return RANK_COLORS[rank as 1 | 2 | 3];
  return "text-muted-foreground/50";
}

/** Compute average scores per model across all entries in a domain */
function computeDomainRankings(
  entries: BenchmarkEntry[],
): { modelId: string; avg: number }[] {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const entry of entries) {
    for (const [modelId, score] of Object.entries(entry.scores)) {
      const t = totals.get(modelId) ?? { sum: 0, count: 0 };
      t.sum += score;
      t.count += 1;
      totals.set(modelId, t);
    }
  }
  return Array.from(totals.entries())
    .map(([modelId, { sum, count }]) => ({ modelId, avg: sum / count }))
    .sort((a, b) => b.avg - a.avg);
}

/** Compute per-benchmark rank map: modelId → rank (1-indexed) */
function computeEntryRanks(
  scores: Record<string, number>,
): Map<string, number> {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const ranks = new Map<string, number>();
  sorted.forEach(([id], i) => ranks.set(id, i + 1));
  return ranks;
}

function DomainLeaderboard({
  entries,
  activeModel,
}: {
  entries: BenchmarkEntry[];
  activeModel: string;
}) {
  const rankings = useMemo(() => computeDomainRankings(entries), [entries]);

  if (rankings.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-border/60 bg-muted/10 flex items-center gap-3 flex-wrap">
      {rankings.map(({ modelId, avg }, i) => {
        const rank = i + 1;
        const model = getModelById(modelId);
        const label = model?.label ?? modelId;
        const isActive = activeModel !== "all" && activeModel === modelId;
        return (
          <span
            key={modelId}
            className={cn(
              "text-xs tabular-nums",
              getRankColor(rank),
              isActive && "ring-1 ring-foreground/30 rounded px-1 bg-muted/40",
            )}
          >
            #{rank} {label}{" "}
            <span className="text-muted-foreground/60">
              (avg {avg.toFixed(1)})
            </span>
          </span>
        );
      })}
    </div>
  );
}

function BenchmarkTable({
  entries,
  activeModel,
}: {
  entries: BenchmarkEntry[];
  activeModel: string;
}) {
  // Collect all model IDs that appear in this domain
  const allModelIds = useMemo(() => {
    const ids = new Set<string>();
    entries.forEach((e) => Object.keys(e.scores).forEach((id) => ids.add(id)));
    return Array.from(ids);
  }, [entries]);

  // Filter rows when a specific model is selected
  const modelIds =
    activeModel !== "all"
      ? allModelIds.filter((id) => id === activeModel)
      : allModelIds;

  // Pre-compute per-benchmark ranks (used for coloring)
  const rankMaps = useMemo(
    () =>
      new Map(entries.map((e) => [e.name, computeEntryRanks(e.scores)] as const)),
    [entries],
  );

  // Pre-compute per-benchmark max scores (used for leader highlight)
  const maxScores = useMemo(
    () =>
      new Map(
        entries.map(
          (e) => [e.name, Math.max(...Object.values(e.scores))] as const,
        ),
      ),
    [entries],
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-h-[400px] overflow-y-auto">
        <div className="overflow-x-auto">
          <table className="table-readable w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="text-left py-2.5 px-4 font-medium text-muted-foreground w-[180px]">
                  Model
                </th>
                {entries.map((entry) => (
                  <th
                    key={entry.name}
                    className="text-right py-2.5 px-4 font-medium whitespace-nowrap"
                  >
                    <span className="inline-flex items-center gap-1">
                      {entry.name}
                      {entry.description && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info
                              size={12}
                              className="text-muted-foreground/40 hover:text-muted-foreground cursor-help shrink-0"
                            />
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="max-w-[260px] text-xs"
                          >
                            {entry.description}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelIds.map((modelId) => {
                const model = getModelById(modelId);
                const label = model?.label ?? modelId;

                return (
                  <tr
                    key={modelId}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">
                      {label}
                    </td>
                    {entries.map((entry) => {
                      const score = entry.scores[modelId];
                      if (score === undefined) {
                        return (
                          <td
                            key={entry.name}
                            className="text-right py-2.5 px-4 text-muted-foreground/30"
                          >
                            —
                          </td>
                        );
                      }
                      const ranks = rankMaps.get(entry.name)!;
                      const rank = ranks.get(modelId) ?? 999;
                      const maxScore = maxScores.get(entry.name) ?? 0;
                      const isLeader = score === maxScore;

                      return (
                        <td
                          key={entry.name}
                          className="text-right py-2.5 px-4 relative"
                        >
                          {/* Background fill bar */}
                          <div
                            className={cn(
                              "absolute inset-y-1 right-2 rounded-sm opacity-[0.08]",
                              isLeader ? "bg-green-500" : "bg-foreground",
                            )}
                            style={{
                              width: `${Math.max(score * 0.8, 10)}%`,
                            }}
                          />
                          <span className="relative inline-flex items-center gap-1">
                            <span
                              className={cn("text-micro", getRankColor(rank))}
                            >
                              #{rank}
                            </span>
                            <span
                              className={cn(
                                "tabular-nums font-medium",
                                isLeader &&
                                  "text-green-600 dark:text-green-400",
                              )}
                            >
                              {score.toFixed(1)}%
                            </span>
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface BenchmarkSectionProps {
  activeModel: string;
  onModelChange?: (model: string) => void;
}

export function BenchmarkSection({ activeModel, onModelChange }: BenchmarkSectionProps) {
  const [activeDomain, setActiveDomain] =
    useState<BenchmarkDomain>("math-science");

  const allEntries = useMemo(
    () => BENCHMARK_DATA.filter((b) => b.domain === activeDomain),
    [activeDomain],
  );

  return (
    <div>
      {/* Domain tab bar + model focus */}
      <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {DOMAINS.map((d) => (
            <button
              key={d.value}
              onClick={() => setActiveDomain(d.value)}
              className={cn(
                "px-2.5 py-1 text-xs rounded transition-colors",
                activeDomain === d.value
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {onModelChange && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Focus:</span>
            <Select value={activeModel} onValueChange={onModelChange}>
              <SelectTrigger className="h-7 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All models</SelectItem>
                {LANDSCAPE_MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <DomainLeaderboard entries={allEntries} activeModel={activeModel} />
      <BenchmarkTable entries={allEntries} activeModel={activeModel} />
      <div className="px-4 py-2 border-t border-border/60 bg-muted/10">
        <span className="text-micro text-muted-foreground/60">
          Scores from published benchmarks (Feb 2026). Only models with reported
          scores shown.
        </span>
      </div>
    </div>
  );
}
