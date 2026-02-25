"use client";

import { Loader2, Check, X, FileSearch, Brain, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScanProgressEvent } from "@/types/routing-graph";

interface ScanProgressOverlayProps {
  progress: ScanProgressEvent | null;
  isScanning: boolean;
  onCancel: () => void;
  onDismiss: () => void;
}

const PHASE_LABELS: Record<string, { label: string; icon: typeof Loader2 }> = {
  discovering: { label: "Discovering files", icon: FileSearch },
  parsing: { label: "Parsing with AI", icon: Brain },
  resolving: { label: "Resolving paths", icon: FileSearch },
  building: { label: "Building graph", icon: Building2 },
};

export function ScanProgressOverlay({
  progress,
  isScanning,
  onCancel,
  onDismiss,
}: ScanProgressOverlayProps) {
  if (!progress && !isScanning) return null;

  const isComplete = progress?.type === "complete";
  const isError = progress?.type === "error";
  const phase = progress?.phase;
  const phaseInfo = phase ? PHASE_LABELS[phase] : null;
  const PhaseIcon = phaseInfo?.icon || Loader2;

  const graph = progress?.graph;

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-lg p-6 w-[360px] space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {isComplete ? (
            <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
              <Check size={16} className="text-green-500" />
            </div>
          ) : isError ? (
            <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <X size={16} className="text-destructive" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <PhaseIcon size={16} className="text-primary animate-spin" />
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">
              {isComplete
                ? "Scan Complete"
                : isError
                  ? "Scan Failed"
                  : "Scanning Knowledge Graph"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isComplete
                ? `Found ${graph?.nodes.length || 0} files, ${graph?.edges.length || 0} connections`
                : isError
                  ? progress?.error
                  : phaseInfo?.label || "Starting..."}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {isScanning && progress?.total && progress.total > 0 && (
          <div className="space-y-1.5">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{
                  width: `${Math.min(100, ((progress.current || 0) / progress.total) * 100)}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-meta text-muted-foreground/60">
              <span className="tabular-nums">
                {progress.current || 0} / {progress.total}
              </span>
              {progress.currentFile && (
                <span className="truncate max-w-[200px]">
                  {progress.currentFile.split("/").slice(-2).join("/")}
                </span>
              )}
            </div>
          </div>
        )}

        {/* File parsed event */}
        {progress?.type === "file-parsed" && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
            <span className="font-mono">
              {progress.filePath?.split("/").slice(-2).join("/")}
            </span>
            <span className="text-muted-foreground/50 ml-2">
              {progress.referencesFound} refs, {progress.tokensUsed} tokens
            </span>
          </div>
        )}

        {/* Stats for complete */}
        {isComplete && graph && (
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-muted/30 rounded-md p-2">
              <div className="text-sm font-semibold tabular-nums">
                {graph.nodes.length}
              </div>
              <div className="text-meta text-muted-foreground/60">files indexed</div>
            </div>
            <div className="bg-muted/30 rounded-md p-2">
              <div className="text-sm font-semibold tabular-nums">
                {graph.edges.length}
              </div>
              <div className="text-meta text-muted-foreground/60">references</div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {isScanning && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {(isComplete || isError) && (
            <Button size="sm" onClick={onDismiss}>
              {isComplete ? "View Graph" : "Dismiss"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
