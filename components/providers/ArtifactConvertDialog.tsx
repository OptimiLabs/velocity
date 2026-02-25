"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Loader2, RefreshCw, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ArtifactType,
  ArtifactConversionIssue,
  ProviderTargetMode,
} from "@/types/provider-artifacts";
import type { ConfigProvider } from "@/types/provider";
import { ProviderTargetModeSelector } from "@/components/providers/ProviderTargetModeSelector";

type ConversionSource =
  | { kind: "inline"; data: Record<string, unknown> }
  | { kind: "instruction"; id: string }
  | { kind: "skill"; name: string; provider?: "claude" | "codex" | "gemini"; projectPath?: string }
  | { kind: "agent"; name: string; provider?: "claude" | "codex" | "gemini"; projectPath?: string };

interface ConversionResultItem {
  target: "claude" | "codex" | "gemini";
  saveSupported: boolean;
  supported: boolean;
  output: {
    content?: string;
    config?: Record<string, unknown>;
    fileName?: string;
  } | null;
  previewText?: string;
  fileName?: string;
  filePath?: string;
  saved?: boolean;
  issues: ArtifactConversionIssue[];
}

interface ConversionResponse {
  artifactType: ArtifactType;
  targetProvider: ProviderTargetMode;
  primary: ConversionResultItem | null;
  results: ConversionResultItem[];
}

interface ArtifactConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifactType: ArtifactType;
  title?: string;
  description?: string;
  getSource: () => ConversionSource | null;
  defaultTarget?: ProviderTargetMode;
  sourceProvider?: ConfigProvider;
  allowSave?: boolean;
  onSaved?: (response: ConversionResponse) => void;
}

const ALL_PROVIDERS: ConfigProvider[] = ["claude", "codex", "gemini"];

function parseProvider(value: unknown): ConfigProvider | null {
  return value === "claude" || value === "codex" || value === "gemini"
    ? value
    : null;
}

function issueCounts(issues: ArtifactConversionIssue[]) {
  let warnings = 0;
  let errors = 0;
  for (const issue of issues) {
    if (issue.level === "error") errors += 1;
    else warnings += 1;
  }
  return { warnings, errors };
}

function resultPreview(result: ConversionResultItem | null | undefined): string {
  if (!result) return "";
  if (result.previewText) return result.previewText;
  const content = result.output?.content;
  if (typeof content === "string") return content;
  if (result.output?.config) return JSON.stringify(result.output.config, null, 2);
  return "";
}

export function ArtifactConvertDialog({
  open,
  onOpenChange,
  artifactType,
  title = "Convert Artifact",
  description = "Preview and save provider-specific versions.",
  getSource,
  defaultTarget = "all",
  sourceProvider,
  allowSave = true,
  onSaved,
}: ArtifactConvertDialogProps) {
  const [targetProvider, setTargetProvider] =
    useState<ProviderTargetMode>(defaultTarget);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ConversionResponse | null>(null);
  const [activeTab, setActiveTab] = useState<string>("claude");

  const currentSource = getSource();
  const inferredSourceProvider = useMemo(() => {
    if (sourceProvider) return sourceProvider;
    if (!currentSource) return null;
    if (currentSource.kind === "agent" || currentSource.kind === "skill") {
      return parseProvider(currentSource.provider);
    }
    if (currentSource.kind === "inline") {
      return parseProvider(currentSource.data.provider);
    }
    return null;
  }, [currentSource, sourceProvider]);
  const selectableProviders = useMemo(
    () =>
      inferredSourceProvider
        ? ALL_PROVIDERS.filter((provider) => provider !== inferredSourceProvider)
        : ALL_PROVIDERS,
    [inferredSourceProvider],
  );
  const effectiveTargetProvider: ProviderTargetMode =
    targetProvider === "all" && selectableProviders.length <= 1
      ? selectableProviders[0] ?? "claude"
      : targetProvider;

  useEffect(() => {
    if (targetProvider === "all") {
      if (selectableProviders.length <= 1) {
        setTargetProvider(selectableProviders[0] ?? "claude");
      }
      return;
    }
    if (
      targetProvider !== "all" &&
      !selectableProviders.includes(targetProvider as ConfigProvider)
    ) {
      setTargetProvider(selectableProviders[0] ?? "claude");
    }
  }, [selectableProviders, targetProvider]);

  const results = data?.results ?? [];
  const visibleResults = useMemo(() => {
    if (effectiveTargetProvider === "all") {
      return results.filter((result) =>
        selectableProviders.includes(result.target),
      );
    }
    return results.filter((result) => result.target === effectiveTargetProvider);
  }, [effectiveTargetProvider, results, selectableProviders]);

  const run = async (
    mode: "preview" | "save",
    overrideTarget?: ProviderTargetMode,
  ) => {
    const source = getSource();
    if (!source) {
      setError("Nothing to convert yet");
      return null;
    }
    const selectedTarget = overrideTarget ?? effectiveTargetProvider;
    const explicitTargets =
      selectedTarget === "all" ? selectableProviders : undefined;

    setError(null);
    if (mode === "preview") setLoading(true);
    else setSaving(true);
    try {
      const res = await fetch("/api/conversions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifactType,
          mode,
          source,
          ...(explicitTargets
            ? { targets: explicitTargets }
            : { targetProvider: selectedTarget }),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as ConversionResponse & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || "Conversion failed");
      }
      setData(body);
      const first =
        selectedTarget === "all"
          ? body.results?.find((result) =>
              selectableProviders.includes(result.target),
            )
          : body.results?.find((result) => result.target === selectedTarget);
      if (first) setActiveTab(first.target);
      if (mode === "save") {
        const savedCount = body.results.filter((r) => r.saved).length;
        if (savedCount > 0) {
          toast.success(
            `Saved ${savedCount} ${artifactType}${savedCount === 1 ? "" : "s"} conversion${savedCount === 1 ? "" : "s"}`,
          );
        } else {
          toast.error("No converted outputs were saved");
        }
        onSaved?.(body);
      }
      return body;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Conversion failed";
      setError(message);
      if (mode === "save") toast.error(message);
      return null;
    } finally {
      setLoading(false);
      setSaving(false);
    }
  };

  const handleCopy = async (result: ConversionResultItem | null) => {
    if (!result) return;
    const text = resultPreview(result);
    if (!text) return;
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${result.target} preview`);
  };

  const saveOne = async (target: "claude" | "codex" | "gemini") => {
    await run("save", target);
  };

  const renderResultPanel = (result: ConversionResultItem) => {
    const preview = resultPreview(result);
    return (
      <div key={result.target} className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize text-[10px]">
            {result.target}
          </Badge>
          {result.fileName && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {result.fileName}
            </Badge>
          )}
          {result.saved && (
            <Badge variant="secondary" className="text-[10px]">
              saved
            </Badge>
          )}
          {result.filePath && (
            <span className="text-[10px] text-muted-foreground font-mono truncate">
              {result.filePath}
            </span>
          )}
        </div>

        {result.issues.length > 0 && (
          <div className="space-y-1">
            {result.issues.map((issue, index) => (
              <div
                key={`${result.target}-${index}`}
                className={
                  issue.level === "error"
                    ? "rounded border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-destructive"
                    : "rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-xs text-amber-700 dark:text-amber-400"
                }
              >
                {issue.message}
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border border-border/50 overflow-hidden">
          <div className="flex items-center justify-between px-2 py-1 border-b border-border/50 bg-muted/40">
            <span className="text-[11px] text-muted-foreground">
              Preview
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] gap-1"
                onClick={() => void handleCopy(result)}
                disabled={!preview}
              >
                <Copy size={11} />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={() => void saveOne(result.target)}
                disabled={saving || !allowSave || !result.saveSupported}
              >
                Save {result.target}
              </Button>
            </div>
          </div>
          <textarea
            value={preview}
            readOnly
            className="w-full min-h-[260px] resize-y bg-background px-3 py-2 text-xs font-mono leading-relaxed focus:outline-none"
          />
        </div>
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-muted-foreground">Target output</div>
            <ProviderTargetModeSelector
              value={effectiveTargetProvider}
              onChange={setTargetProvider}
              disabled={loading || saving}
              providers={selectableProviders}
              includeAll={selectableProviders.length > 1}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              disabled={loading || saving}
              onClick={() => void run("preview")}
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              Preview
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={loading || saving || !allowSave}
              onClick={() => void run("save")}
            >
              {saving ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              Save
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {visibleResults.length > 1 && effectiveTargetProvider === "all" ? (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-auto w-full justify-start flex-wrap">
                {visibleResults.map((result) => {
                  const counts = issueCounts(result.issues);
                  return (
                    <TabsTrigger
                      key={result.target}
                      value={result.target}
                      className="text-xs gap-1.5"
                    >
                      <span className="capitalize">{result.target}</span>
                      {!result.saveSupported && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1">
                          preview
                        </Badge>
                      )}
                      {counts.errors > 0 && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1">
                          {counts.errors}e
                        </Badge>
                      )}
                      {counts.warnings > 0 && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1">
                          {counts.warnings}w
                        </Badge>
                      )}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {visibleResults.map((result) => (
                <TabsContent key={result.target} value={result.target} className="space-y-2">
                  {renderResultPanel(result)}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            visibleResults.length > 0 &&
            renderResultPanel(visibleResults[0])
          )}

          {!data && !loading && (
            <div className="rounded-md border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
              Click Preview to generate provider-specific outputs.
            </div>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
