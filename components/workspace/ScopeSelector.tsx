"use client";

import type { ScopeOptions } from "@/types/session";
import type { ComparePreview } from "@/hooks/useSessions";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  FileText,
  MessageSquare,
  Bot,
  Wrench,
  AlertTriangle,
  Info,
  Layers,
} from "lucide-react";

type BooleanScopeKey =
  | "metrics"
  | "summaries"
  | "userPrompts"
  | "assistantResponses"
  | "toolDetails";

interface ScopeOptionConfig {
  key: BooleanScopeKey;
  label: string;
  description: string | ((limit: number) => string);
  icon: typeof BarChart3;
}

const SCOPE_OPTIONS: ScopeOptionConfig[] = [
  {
    key: "metrics",
    label: "Metrics",
    description: "Cost, tokens, tools, models",
    icon: BarChart3,
  },
  {
    key: "summaries",
    label: "Summaries",
    description: "Summary + first prompt",
    icon: FileText,
  },
  {
    key: "userPrompts",
    label: "User prompts",
    description: (limit: number) =>
      limit === -1 ? "All user messages" : `Up to ${limit} user messages`,
    icon: MessageSquare,
  },
  {
    key: "assistantResponses",
    label: "Responses",
    description: (limit: number) =>
      limit === -1 ? "All assistant texts" : `Up to ${limit} assistant texts`,
    icon: Bot,
  },
  {
    key: "toolDetails",
    label: "Tool details",
    description: "Files, skills, agents, MCP",
    icon: Wrench,
  },
];

const MESSAGE_LIMITS = [
  { value: 25, label: "25" },
  { value: 50, label: "50" },
  { value: 100, label: "100" },
  { value: 250, label: "250" },
  { value: -1, label: "All" },
];

type ScopePresetId = "lean" | "balanced" | "deep";

interface ScopePreset {
  id: ScopePresetId;
  label: string;
  description: string;
  values: ScopeOptions;
}

interface ScopeSelectorProps {
  scope: ScopeOptions;
  onScopeChange: (scope: ScopeOptions) => void;
  preview: ComparePreview | null;
  isLoadingPreview: boolean;
  cumulativeCost: number;
}

export function ScopeSelector({
  scope,
  onScopeChange,
  preview,
  isLoadingPreview,
  cumulativeCost,
}: ScopeSelectorProps) {
  const highTokenWarning =
    scope.userPrompts &&
    scope.assistantResponses &&
    preview &&
    preview.estimatedInputTokens > 20000;

  const messageLimit = scope.messageLimit ?? 50;
  const samplingStrategy = scope.samplingStrategy ?? "first";
  const showMessageControls = scope.userPrompts || scope.assistantResponses;

  const presets: ScopePreset[] = [
    {
      id: "lean",
      label: "Lean",
      description: "Metrics + summaries only",
      values: {
        metrics: true,
        summaries: true,
        userPrompts: false,
        assistantResponses: false,
        toolDetails: false,
        messageLimit: 25,
        samplingStrategy: "first",
        multiRoundSummarization: false,
      },
    },
    {
      id: "balanced",
      label: "Balanced",
      description: "Most useful default mix",
      values: {
        metrics: true,
        summaries: true,
        userPrompts: true,
        assistantResponses: false,
        toolDetails: true,
        messageLimit: 50,
        samplingStrategy: "first-last",
        multiRoundSummarization: false,
      },
    },
    {
      id: "deep",
      label: "Deep",
      description: "Full context analysis",
      values: {
        metrics: true,
        summaries: true,
        userPrompts: true,
        assistantResponses: true,
        toolDetails: true,
        messageLimit: 100,
        samplingStrategy: "first-last",
        multiRoundSummarization: true,
      },
    },
  ];

  const activePreset =
    presets.find((p) => {
      const v = p.values;
      return (
        scope.metrics === v.metrics &&
        scope.summaries === v.summaries &&
        scope.userPrompts === v.userPrompts &&
        scope.assistantResponses === v.assistantResponses &&
        scope.toolDetails === v.toolDetails &&
        (scope.messageLimit ?? 50) === (v.messageLimit ?? 50) &&
        (scope.samplingStrategy ?? "first") === (v.samplingStrategy ?? "first") &&
        (scope.multiRoundSummarization ?? false) ===
          (v.multiRoundSummarization ?? false)
      );
    })?.id ?? null;

  const samplingDescription =
    samplingStrategy === "first-last" && messageLimit !== -1
      ? `First ${Math.ceil(messageLimit / 2)} + last ${Math.floor(messageLimit / 2)} messages`
      : samplingStrategy === "first-last"
        ? "All messages (limit is unlimited)"
        : messageLimit === -1
          ? "All messages"
          : `First ${messageLimit} messages`;

  return (
    <div className="space-y-5">
      {/* Scope checkboxes */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
          Scope
        </div>
        <p className="text-micro text-muted-foreground/60 px-1 pb-0.5">
          Choose what data is sent to AI for analysis
        </p>
        <div className="flex flex-wrap gap-1 px-1 pb-1">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                "px-2 py-1 rounded-md text-micro transition-colors",
                activePreset === preset.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted",
              )}
              onClick={() => onScopeChange({ ...preset.values })}
              title={preset.description}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {SCOPE_OPTIONS.map((opt) => {
          const tokens = preview?.scopeBreakdown?.[opt.key];
          return (
            <label
              key={opt.key}
              className={cn(
                "flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/40",
                scope[opt.key] && "bg-muted/30",
              )}
            >
              <input
                type="checkbox"
                checked={scope[opt.key]}
                onChange={() =>
                  onScopeChange({ ...scope, [opt.key]: !scope[opt.key] })
                }
                className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <opt.icon
                    size={12}
                    className="text-muted-foreground shrink-0"
                  />
                  <span className="text-xs font-medium">{opt.label}</span>
                </div>
                <div className="text-micro text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span>
                    {typeof opt.description === "function"
                      ? opt.description(messageLimit)
                      : opt.description}
                  </span>
                  {scope[opt.key] && tokens != null && (
                    <span className="text-muted-foreground/60 tabular-nums">
                      +{formatTokens(tokens)} ctx
                    </span>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Message limit + Sampling — only shown when prompts or responses are enabled */}
      {showMessageControls && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              Message Limit
            </div>
            <Select
              value={String(messageLimit)}
              onValueChange={(v) =>
                onScopeChange({ ...scope, messageLimit: Number(v) })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESSAGE_LIMITS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={String(opt.value)}
                    className="text-xs"
                  >
                    {opt.label} messages
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
              Sampling
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                  samplingStrategy === "first"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
                onClick={() =>
                  onScopeChange({ ...scope, samplingStrategy: "first" })
                }
              >
                First only
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors",
                  samplingStrategy === "first-last"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
                )}
                onClick={() =>
                  onScopeChange({ ...scope, samplingStrategy: "first-last" })
                }
              >
                First + Last
              </button>
            </div>
            <p className="text-micro text-muted-foreground/60 px-1">
              {samplingDescription}
            </p>
          </div>
        </div>
      )}

      {/* Warning */}
      {highTokenWarning && (
        <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
          <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-amber-600 dark:text-amber-400">
            High token usage — this may cost{" "}
            <span className="font-medium">
              {formatCost(preview.estimatedCost)}+
            </span>
          </div>
        </div>
      )}

      {/* Cost estimate */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
          Analysis Cost
        </div>
        <div className="rounded-lg bg-muted/30 p-3 space-y-1.5 text-xs">
          {isLoadingPreview ? (
            <div className="text-muted-foreground animate-pulse">
              Estimating...
            </div>
          ) : preview ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Analysis input</span>
                <span className="tabular-nums font-mono">
                  ~{formatTokens(preview.estimatedInputTokens)}
                </span>
              </div>
              {preview.scopeBreakdown?._overhead != null &&
                preview.scopeBreakdown._overhead > 0 && (
                  <div className="flex justify-between text-muted-foreground/60">
                    <span>Prompt overhead</span>
                    <span className="tabular-nums font-mono">
                      +{formatTokens(preview.scopeBreakdown._overhead)}
                    </span>
                  </div>
                )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. per message</span>
                <span className="tabular-nums font-mono text-chart-1">
                  ~{formatCost(preview.estimatedCost)}
                </span>
              </div>
              {preview.requiresMultiRound && preview.estimatedChunks && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Chunks</span>
                  <span className="tabular-nums font-mono">
                    {preview.estimatedChunks} rounds
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground/60">
              Toggle scopes to see estimate
            </div>
          )}
          {cumulativeCost > 0 && (
            <>
              <div className="border-t border-border/30 my-1" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Analysis total</span>
                <span className="tabular-nums font-mono font-medium">
                  {formatCost(cumulativeCost)}
                </span>
              </div>
            </>
          )}
        </div>
        <p className="text-micro text-muted-foreground/60 px-1">
          Cost of running AI analysis, not the compared sessions.
        </p>
      </div>

      {/* Multi-round summarization */}
      <div className="space-y-1.5">
        <label className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/40">
          <input
            type="checkbox"
            checked={scope.multiRoundSummarization ?? false}
            onChange={() =>
              onScopeChange({
                ...scope,
                multiRoundSummarization: !scope.multiRoundSummarization,
              })
            }
            className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <Layers size={12} className="text-muted-foreground shrink-0" />
              <span className="text-xs font-medium">
                Multi-round summarization
              </span>
            </div>
            <p className="text-micro text-muted-foreground mt-0.5">
              Chunk large contexts and summarize in multiple rounds
            </p>
          </div>
        </label>
        {scope.multiRoundSummarization && preview?.requiresMultiRound && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
            <Info size={12} className="text-blue-500 shrink-0 mt-0.5" />
            <div className="text-blue-600 dark:text-blue-400">
              Context exceeds single-pass limit. Will process in{" "}
              <span className="font-medium">
                {preview.estimatedChunks} chunks
              </span>{" "}
              + synthesis round.
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
