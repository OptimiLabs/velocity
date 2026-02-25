"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { MarkdownContent } from "@/components/sessions/MarkdownContent";
import {
  useCompareSessions,
  useComparePreview,
  type CompareProvider,
  type ComparePreview,
} from "@/hooks/useSessions";
import { formatCost, formatTokens } from "@/lib/cost/calculator";
import {
  Loader2,
  Sparkles,
  DollarSign,
  Bug,
  GitCompare,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Key,
  Zap,
  Globe,
  Network,
  HardDrive,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Session } from "@/types/session";

const PRESETS = [
  {
    key: "efficiency",
    label: "Efficiency Analysis",
    description: "Cost, tools, cache, models",
    icon: DollarSign,
  },
  {
    key: "debugging",
    label: "What went wrong?",
    description: "Errors, anomalies, root causes",
    icon: Bug,
  },
  {
    key: "strategy",
    label: "Which approach was best?",
    description: "Approach, effectiveness ranking",
    icon: GitCompare,
  },
  {
    key: "accomplishments",
    label: "Summarize accomplishments",
    description: "Recaps, files touched, timeline",
    icon: CheckCircle2,
  },
] as const;

const PROVIDERS: {
  key: CompareProvider;
  label: string;
  icon: typeof Terminal;
  description: string;
}[] = [
  {
    key: "claude-cli",
    label: "Claude CLI",
    icon: Terminal,
    description: "Uses your local Claude installation",
  },
  {
    key: "anthropic",
    label: "Anthropic API",
    icon: Key,
    description: "Direct API call with your key",
  },
  {
    key: "openai",
    label: "OpenAI API",
    icon: Zap,
    description: "Uses GPT-4o with your key",
  },
  {
    key: "google",
    label: "Google AI",
    icon: Globe,
    description: "Uses Gemini via your Google AI Studio key",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    icon: Network,
    description: "Uses your OpenRouter endpoint/key (OpenAI-compatible)",
  },
  {
    key: "local",
    label: "Local",
    icon: HardDrive,
    description: "Uses your local OpenAI-compatible endpoint (Ollama/LM Studio)",
  },
  {
    key: "custom",
    label: "Custom Endpoint",
    icon: Key,
    description: "Uses your configured custom OpenAI-compatible endpoint",
  },
];

function SessionMiniCard({ session }: { session: Session }) {
  const models = (() => {
    try {
      return Object.keys(JSON.parse(session.model_usage)).map((m) =>
        m.replace(/^claude-/, "").replace(/-\d{8}$/, ""),
      );
    } catch {
      return [];
    }
  })();

  return (
    <div className="min-w-[200px] max-w-[220px] shrink-0 rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-1.5">
      <div className="font-mono font-medium text-foreground truncate">
        {session.slug || session.id.slice(0, 12)}
      </div>
      <div className="text-muted-foreground truncate text-xs">
        {session.summary || session.first_prompt || "\u2014"}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
        <span>
          <span className="text-foreground font-medium">
            {formatCost(session.total_cost)}
          </span>{" "}
          cost
        </span>
        <span>{session.message_count} msgs</span>
        <span>
          {formatTokens(session.input_tokens + session.output_tokens)} tokens
        </span>
      </div>
      {models.length > 0 && (
        <div className="flex gap-1">
          {models.map((m) => (
            <span
              key={m}
              className="px-1 py-0 rounded bg-muted text-muted-foreground text-micro font-mono"
            >
              {m}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CostPreviewCard({
  preview,
  provider,
}: {
  preview: ComparePreview;
  provider: CompareProvider;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <DollarSign size={12} className="text-chart-1" />
        Estimated Cost Preview
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-muted-foreground">Input tokens</div>
          <div className="font-mono font-medium tabular-nums">
            {formatTokens(preview.estimatedInputTokens)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Output tokens</div>
          <div className="font-mono font-medium tabular-nums">
            ~{formatTokens(preview.estimatedOutputTokens)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Estimated cost</div>
          <div className="font-mono font-medium tabular-nums text-chart-1">
            ~{formatCost(preview.estimatedCost)}
          </div>
        </div>
      </div>
      <div className="text-micro text-muted-foreground/60">
        {provider === "claude-cli"
          ? "Cost billed through your Claude CLI subscription. Output estimate is approximate."
          : provider === "local"
            ? "Local models usually have no API billing. Token/cost estimates may not reflect hardware/runtime costs."
          : "Estimated based on input token count. Actual cost depends on response length."}
      </div>
    </div>
  );
}

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: Session[];
}

type Step = "select" | "preview" | "result";

export function CompareDialog({
  open,
  onOpenChange,
  sessions,
}: CompareDialogProps) {
  const [question, setQuestion] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [provider, setProvider] = useState<CompareProvider>("claude-cli");
  const [step, setStep] = useState<Step>("select");
  const [previewData, setPreviewData] = useState<ComparePreview | null>(null);

  const compare = useCompareSessions();
  const preview = useComparePreview();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep("select");
      setSelectedPreset(null);
      setQuestion("");
      setPreviewData(null);
      compare.reset();
      preview.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePreset = async (preset: string) => {
    setSelectedPreset(preset);
    // Fetch preview
    preview.mutate(
      { sessionIds: sessions.map((s) => s.id), preset, model: provider },
      {
        onSuccess: (data) => {
          setPreviewData(data);
          setStep("preview");
        },
      },
    );
  };

  const handleCustom = async () => {
    if (!question.trim()) return;
    setSelectedPreset(null);
    preview.mutate(
      {
        sessionIds: sessions.map((s) => s.id),
        question: question.trim(),
        model: provider,
      },
      {
        onSuccess: (data) => {
          setPreviewData(data);
          setStep("preview");
        },
      },
    );
  };

  const handleRun = () => {
    compare.mutate(
      {
        sessionIds: sessions.map((s) => s.id),
        preset: selectedPreset || undefined,
        question: question.trim() || undefined,
        provider,
      },
      {
        onSuccess: () => setStep("result"),
      },
    );
  };

  const refreshPreviewForProvider = (nextProvider: CompareProvider) => {
    if (step !== "preview") return;
    preview.mutate(
      {
        sessionIds: sessions.map((s) => s.id),
        preset: selectedPreset || undefined,
        question: selectedPreset ? undefined : question.trim() || undefined,
        model: nextProvider,
      },
      {
        onSuccess: (data) => {
          setPreviewData(data);
        },
      },
    );
  };

  const handleBack = () => {
    setStep("select");
    setPreviewData(null);
    compare.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles size={16} />
            Compare Sessions
          </DialogTitle>
          <DialogDescription>
            AI-powered analysis of {sessions.length} sessions
          </DialogDescription>
        </DialogHeader>

        {/* Session mini cards — always visible */}
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-2">
            {sessions.map((s) => (
              <SessionMiniCard key={s.id} session={s} />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Step 1: Select preset or custom question */}
        {step === "select" && !preview.isPending && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => handlePreset(p.key)}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/40 hover:border-border transition-colors text-left"
                >
                  <p.icon size={16} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Or ask a custom question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustom();
                }}
                className="text-sm"
              />
              <Button
                onClick={handleCustom}
                disabled={!question.trim()}
                size="sm"
                className="shrink-0"
              >
                Next
              </Button>
            </div>
          </>
        )}

        {/* Loading preview */}
        {preview.isPending && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            Estimating cost...
          </div>
        )}

        {/* Preview error */}
        {preview.isError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle size={14} />
              Failed to generate preview
            </div>
            <div className="text-xs text-muted-foreground">
              {preview.error?.message}
            </div>
            <Button variant="outline" size="sm" onClick={handleBack}>
              Try again
            </Button>
          </div>
        )}

        {/* Step 2: Preview — show cost estimate + provider picker + confirm */}
        {step === "preview" &&
          previewData &&
          !compare.isPending &&
          !compare.data && (
            <>
              {/* What we're comparing */}
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="text-xs">
                  {selectedPreset
                    ? PRESETS.find((p) => p.key === selectedPreset)?.label
                    : "Custom question"}
                </Badge>
                {!selectedPreset && question && (
                  <span className="text-muted-foreground truncate">
                    {question}
                  </span>
                )}
              </div>

              {/* Cost preview */}
              <CostPreviewCard preview={previewData} provider={provider} />

              {/* Provider selector */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-foreground">
                  Provider
                </div>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => {
                        setProvider(p.key);
                        refreshPreviewForProvider(p.key);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors",
                        provider === p.key
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border/50 text-muted-foreground hover:bg-muted/40 hover:border-border",
                      )}
                    >
                      <p.icon size={14} />
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="text-micro text-muted-foreground/60">
                  {PROVIDERS.find((p) => p.key === provider)?.description}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="gap-1"
                >
                  <ArrowLeft size={12} />
                  Back
                </Button>
                <Button size="sm" onClick={handleRun} className="gap-1.5">
                  <Sparkles size={14} />
                  Run Comparison (~{formatCost(previewData.estimatedCost)})
                </Button>
              </div>
            </>
          )}

        {/* Running comparison */}
        {compare.isPending && (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" />
            Analyzing {sessions.length} sessions with{" "}
            {PROVIDERS.find((p) => p.key === provider)?.label}...
          </div>
        )}

        {/* Comparison error */}
        {compare.isError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle size={14} />
              Comparison failed
            </div>
            <div className="text-xs text-muted-foreground">
              {compare.error?.message}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleBack}>
                Try different settings
              </Button>
              <Button variant="outline" size="sm" onClick={handleRun}>
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {compare.data && (
          <>
            <div className="overflow-y-auto flex-1 rounded-lg border border-border/50 bg-muted/20 p-4">
              <MarkdownContent content={compare.data.analysis} />
            </div>

            {/* Actual cost footer */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {compare.data.tokensUsed > 0 && (
                  <span className="tabular-nums">
                    {formatTokens(compare.data.tokensUsed)} tokens used
                  </span>
                )}
                {compare.data.cost > 0 && (
                  <span className="tabular-nums text-chart-1">
                    {formatCost(compare.data.cost)} actual cost
                  </span>
                )}
                <Badge variant="outline" className="text-micro">
                  {PROVIDERS.find((p) => p.key === provider)?.label}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleBack}>
                  Ask another question
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                >
                  Done
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
