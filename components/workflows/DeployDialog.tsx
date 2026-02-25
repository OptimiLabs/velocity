"use client";

import { useEffect, useState } from "react";
import { Rocket, Terminal, Loader2, Check, Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface DeployPreview {
  commandName: string;
  description: string;
  prompt: string;
  nodeCount: number;
}

interface DeployDialogProps {
  workflowId: string | null;
  workflowName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeployed?: () => void;
}

export function DeployDialog({
  workflowId,
  workflowName,
  open,
  onOpenChange,
  onDeployed,
}: DeployDialogProps) {
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);

  useEffect(() => {
    if (!open || !workflowId) {
      setPreview(null);
      setDeployed(false);
      return;
    }

    setLoading(true);
    fetch(`/api/workflows/${workflowId}/deploy`)
      .then((r) => r.json())
      .then((d) => setPreview(d))
      .catch(() => setPreview(null))
      .finally(() => setLoading(false));
  }, [open, workflowId]);

  const handleDeploy = async () => {
    if (!workflowId) return;
    setDeploying(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/deploy`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Deploy failed");
      }
      const data = await res.json();
      setDeployed(true);
      toast.success(`Deployed as /${data.commandName}`);
      onDeployed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  const handleCopy = () => {
    if (preview?.prompt) {
      navigator.clipboard.writeText(preview.prompt);
      toast.success("Prompt copied");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Rocket size={16} className="text-chart-4" />
            Deploy as /command
          </DialogTitle>
          <DialogDescription>
            Save &ldquo;{workflowName}&rdquo; as a slash command that can be run
            in any Claude session.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : preview ? (
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {/* Command name */}
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-muted-foreground" />
              <code className="text-sm font-mono font-medium">
                /{preview.commandName}
              </code>
              <Badge variant="outline" className="text-meta">
                {preview.nodeCount} step{preview.nodeCount !== 1 ? "s" : ""}
              </Badge>
              {deployed && (
                <Badge
                  variant="outline"
                  className="text-meta text-green-500 border-green-500/30"
                >
                  <Check size={8} className="mr-0.5" />
                  Deployed
                </Badge>
              )}
            </div>

            {preview.description && (
              <p className="text-xs text-muted-foreground">
                {preview.description}
              </p>
            )}

            {/* Prompt preview */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-meta uppercase tracking-wider text-muted-foreground/50">
                  Orchestrator Prompt
                </span>
                <button
                  onClick={handleCopy}
                  className="text-meta text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                >
                  <Copy size={10} />
                  Copy
                </button>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 max-h-[300px] overflow-y-auto">
                <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-mono leading-relaxed">
                  {preview.prompt}
                </pre>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Failed to load preview
          </p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
          >
            {deployed ? "Done" : "Cancel"}
          </Button>
          {!deployed && (
            <Button
              size="sm"
              className="h-8"
              onClick={handleDeploy}
              disabled={deploying || !preview}
            >
              {deploying ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : (
                <Rocket size={12} className="mr-1.5" />
              )}
              Deploy
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
