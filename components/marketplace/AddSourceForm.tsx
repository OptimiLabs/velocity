"use client";

import { useState, useMemo } from "react";
import { Plus, Loader2, Shield, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseSourceInput } from "@/lib/marketplace/url-parser";
import { useAddSource, useAnalyzeRepo } from "@/hooks/useMarketplace";
import type { SecurityAnalysisResult } from "@/types/security-analysis";

const TYPE_BADGE_COLORS: Record<string, string> = {
  github_search: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  github_org: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  github_repo: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  registry: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  github_search: "GitHub Search",
  github_org: "GitHub Org",
  github_repo: "GitHub Repo",
  registry: "Registry",
};

export function AddSourceForm() {
  const [input, setInput] = useState("");
  const [nameOverride, setNameOverride] = useState("");
  const [analysisResult, setAnalysisResult] =
    useState<SecurityAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const addSource = useAddSource();
  const analyzeRepo = useAnalyzeRepo();

  const parsed = useMemo(() => parseSourceInput(input), [input]);

  const resetForm = () => {
    setInput("");
    setNameOverride("");
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  const effectiveName = nameOverride || parsed?.suggestedName || "";
  const isGithubRepo = parsed?.source_type === "github_repo";

  const handleAdd = () => {
    if (!parsed || !effectiveName) return;
    doAdd();
  };

  const handleAnalyze = () => {
    if (!parsed || !isGithubRepo) return;
    const repo = parsed.config.repo;
    const parts = repo.split("/");
    if (parts.length !== 2) return;
    setAnalysisError(null);
    analyzeRepo.mutate(
      { owner: parts[0], repo: parts[1] },
      {
        onSuccess: (result) => setAnalysisResult(result),
        onError: (err) => {
          const msg =
            err instanceof Error ? err.message : "Analysis failed";
          setAnalysisError(msg);
        },
      },
    );
  };

  const doAdd = () => {
    if (!parsed || !effectiveName) return;
    const config: Record<string, string> = { ...parsed.config };
    if (analysisResult) {
      (config as Record<string, unknown>).securityAnalysis = analysisResult;
    }
    addSource.mutate(
      {
        name: effectiveName,
        source_type: parsed.source_type,
        config,
      },
      { onSuccess: resetForm },
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/30 bg-muted/20 p-3">
      <h4 className="text-xs font-medium text-muted-foreground">
        Add New Source
      </h4>

      {/* Smart input */}
      <input
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setAnalysisResult(null);
          setAnalysisError(null);
        }}
        placeholder="Paste a GitHub URL, org name, org/repo, or registry URL..."
        className="w-full h-8 text-xs rounded border border-border bg-background px-2.5"
      />

      {/* Detection preview */}
      {parsed && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Detected:</span>
          <Badge
            variant="outline"
            className={`text-micro ${TYPE_BADGE_COLORS[parsed.source_type] || ""}`}
          >
            {TYPE_LABELS[parsed.source_type] || parsed.source_type}
          </Badge>
          <span className="text-xs text-muted-foreground truncate">
            {Object.values(parsed.config)[0]}
          </span>
        </div>
      )}

      {/* Name override */}
      {parsed && (
        <input
          value={nameOverride}
          onChange={(e) => setNameOverride(e.target.value)}
          placeholder={parsed.suggestedName}
          className="w-full h-8 text-xs rounded border border-border bg-background px-2.5"
        />
      )}

      {/* Security analysis (explicit click only) */}
      {isGithubRepo && !analysisResult && !analysisError && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield size={12} />
            Run AI security analysis before adding
          </div>
          <p className="text-micro text-muted-foreground/60 flex items-center gap-1">
            <Info size={9} />
            Requires an Anthropic API key in settings
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleAnalyze}
            disabled={analyzeRepo.isPending}
          >
            {analyzeRepo.isPending ? (
              <>
                <Loader2 size={12} className="animate-spin mr-1" />
                Analyzing...
              </>
            ) : (
              "Analyze"
            )}
          </Button>
        </div>
      )}

      {/* Analysis result */}
      {analysisResult && (
        <div className="p-2.5 rounded-md border border-border bg-muted/30 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={
                analysisResult.overallRisk === "low"
                  ? "text-green-500 dark:text-green-400"
                  : analysisResult.overallRisk === "medium"
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-red-500 dark:text-red-400"
              }
            >
              {analysisResult.overallRisk.charAt(0).toUpperCase() +
                analysisResult.overallRisk.slice(1)}{" "}
              risk
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {analysisResult.summary}
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={doAdd}
              disabled={addSource.isPending}
            >
              {addSource.isPending ? (
                <Loader2 size={12} className="animate-spin mr-1" />
              ) : (
                <Plus size={12} className="mr-1" />
              )}
              Add Source
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setAnalysisResult(null);
                setAnalysisError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Analysis error */}
      {analysisError && (
        <div className="p-2.5 rounded-md border border-destructive/30 bg-destructive/5 space-y-2">
          <p className="text-xs text-destructive">
            Security analysis failed: {analysisError}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={doAdd}
              disabled={addSource.isPending}
            >
              Add Without Analysis
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setAnalysisError(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Add button */}
      {parsed && !analysisResult && !analysisError && (
        <Button
          size="sm"
          className="h-8 w-full"
          onClick={handleAdd}
          disabled={
            !effectiveName || addSource.isPending
          }
        >
          {addSource.isPending ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Plus size={14} className="mr-1.5" />
          )}
          Add Source
        </Button>
      )}
    </div>
  );
}
