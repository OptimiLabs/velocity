"use client";

import { useEffect, useState } from "react";
import { Rocket, Terminal, Loader2, Check } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { ConfigProvider } from "@/types/provider";

interface DeployPreview {
  commandName: string;
  description: string;
  nodeCount: number;
}

interface DeployDialogProps {
  workflowId: string | null;
  workflowName: string;
  provider?: ConfigProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeployed?: () => void;
}

export function DeployDialog({
  workflowId,
  workflowName,
  provider = "claude",
  open,
  onOpenChange,
  onDeployed,
}: DeployDialogProps) {
  const [preview, setPreview] = useState<DeployPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [commandName, setCommandName] = useState("");
  const [description, setDescription] = useState("");
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  const fallbackCommandName = workflowName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "workflow";
  const fallbackDescription = workflowName
    ? `Run the "${workflowName}" workflow`
    : "Run this workflow";
  const isCodexProvider = provider === "codex";
  const supportsNativeSlash = !isCodexProvider;

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setDeployed(false);
      setPreviewFailed(false);
      setCommandName("");
      setDescription("");
      setConfirmOverwrite(false);
      setConflictMessage(null);
      return;
    }

    if (!workflowId) {
      setPreview(null);
      setDeployed(false);
      setPreviewFailed(false);
      setCommandName(fallbackCommandName);
      setDescription(fallbackDescription);
      setConfirmOverwrite(false);
      setConflictMessage(null);
      return;
    }

    // Prime fields immediately so users don't see empty defaults while loading.
    setCommandName(fallbackCommandName);
    setDescription(fallbackDescription);
    setPreviewFailed(false);
    setConfirmOverwrite(false);
    setConflictMessage(null);
    setLoading(true);
    fetch(`/api/workflows/${workflowId}/deploy`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error("Failed to load deploy preview");
        }
        return (await r.json()) as DeployPreview;
      })
      .then((d: DeployPreview) => {
        setPreview(d);
        setPreviewFailed(false);
        setCommandName(d.commandName || fallbackCommandName);
        setDescription(d.description || fallbackDescription);
      })
      .catch(() => {
        setPreview(null);
        setPreviewFailed(true);
      })
      .finally(() => setLoading(false));
  }, [open, workflowId, fallbackCommandName, fallbackDescription]);

  const handleDeploy = async () => {
    if (!workflowId) return;
    if (!commandName.trim()) {
      toast.error("Command name is required");
      return;
    }
    setDeploying(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commandName: commandName.trim(),
          description: description.trim(),
          force: confirmOverwrite,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          canForce?: boolean;
        };
        if (res.status === 409 && err.canForce) {
          const message =
            err.error ||
            "A command with this name already exists. Click again to overwrite.";
          setConfirmOverwrite(true);
          setConflictMessage(message);
          toast.error(message);
          return;
        }
        throw new Error(err.error || "Deploy failed");
      }
      const data = await res.json();
      setDeployed(true);
      setConfirmOverwrite(false);
      setConflictMessage(null);
      toast.success(`Saved as /${data.commandName}`);
      setCommandName(data.commandName || commandName.trim());
      onDeployed?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Rocket size={16} className="text-chart-4" />
            Save Skill
          </DialogTitle>
          <DialogDescription>
            Save &ldquo;{workflowName}&rdquo; as a reusable skill for the
            selected provider.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {previewFailed && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-300">
                Preview failed to load. You can still edit and save this skill.
              </p>
            )}
            {/* Skill name */}
            <div className="space-y-2">
              <label className="text-meta uppercase tracking-wider text-muted-foreground/60">
                {supportsNativeSlash ? "Slash Command" : "Skill Name"}
              </label>
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-muted-foreground" />
                {supportsNativeSlash && (
                  <span className="text-xs text-muted-foreground font-mono">/</span>
                )}
                <Input
                  value={commandName}
                  onChange={(e) => {
                    setCommandName(e.target.value);
                    setConfirmOverwrite(false);
                    setConflictMessage(null);
                  }}
                  className="h-8 font-mono text-xs"
                  placeholder={fallbackCommandName}
                  disabled={deploying || deployed}
                />
                {typeof preview?.nodeCount === "number" && (
                  <Badge variant="outline" className="text-meta shrink-0">
                    {preview.nodeCount} step{preview.nodeCount !== 1 ? "s" : ""}
                  </Badge>
                )}
                {deployed && (
                  <Badge
                    variant="outline"
                    className="text-meta text-green-500 border-green-500/30 shrink-0"
                  >
                    <Check size={8} className="mr-0.5" />
                    Saved
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {supportsNativeSlash
                  ? "Pre-filled from your workflow name. You can edit before saving."
                  : "Pre-filled from your workflow name. In Codex, use /skills to launch it or mention $name."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-meta uppercase tracking-wider text-muted-foreground/60">
                Description
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[68px] text-xs resize-y"
                placeholder="Describe what this workflow command does."
                disabled={deploying || deployed}
              />
            </div>
            {confirmOverwrite && conflictMessage && (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-300">
                {conflictMessage}
              </p>
            )}
          </div>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={handleDeploy}
                  disabled={deploying || !commandName.trim()}
                >
                  {deploying ? (
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                  ) : (
                    <Rocket size={12} className="mr-1.5" />
                  )}
                  {confirmOverwrite ? "Overwrite Skill" : "Save Skill"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end">
                {commandName.trim() ? (
                  provider === "codex" ? (
                    <span>
                      Saves skill <span className="font-mono">{commandName.trim()}</span>.
                      In Codex, run <span className="font-mono">/skills</span> to
                      launch it or mention{" "}
                      <span className="font-mono">${commandName.trim()}</span> in a prompt.
                    </span>
                  ) : (
                    <span>
                      Saves <span className="font-mono">/{commandName.trim()}</span>{" "}
                      to your CLI. If it already exists, you&apos;ll confirm before
                      overwrite.
                    </span>
                  )
                ) : (
                  supportsNativeSlash
                    ? "Saves a slash command in your CLI."
                    : "Saves a reusable skill in your CLI."
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
