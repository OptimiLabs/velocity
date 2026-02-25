"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DirectoryPicker } from "@/components/console/DirectoryPicker";
import { CheckCircle2, HelpCircle, Rocket, Cpu } from "lucide-react";
import { toast } from "sonner";
import { useWorkflow, useUpdateWorkflow } from "@/hooks/useWorkflows";
import type { WorkflowNode } from "@/types/workflow";

interface DeployDialogProps {
  workflowId: string | null;
  open: boolean;
  onClose: () => void;
  onDeploy: (workflowId: string) => void;
}

export function DeployDialog({
  workflowId,
  open,
  onClose,
  onDeploy,
}: DeployDialogProps) {
  const { data: workflow } = useWorkflow(workflowId);
  const updateWorkflow = useUpdateWorkflow();
  const [cwd, setCwd] = useState(workflow?.cwd || "");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [deploying, setDeploying] = useState(false);

  if (!workflow) return null;

  const unconfirmedNodes = workflow.nodes.filter(
    (n) => n.status === "unconfirmed",
  );
  const allReady =
    unconfirmedNodes.length === 0 ||
    (autoConfirm && unconfirmedNodes.length > 0);

  const handleDeploy = async () => {
    if (!workflowId) return;
    setDeploying(true);

    try {
      // Auto-confirm unconfirmed nodes if checked
      if (autoConfirm && unconfirmedNodes.length > 0) {
        const updatedNodes: WorkflowNode[] = workflow.nodes.map((n) =>
          n.status === "unconfirmed" ? { ...n, status: "ready" as const } : n,
        );
        await updateWorkflow.mutateAsync({
          id: workflowId,
          data: { nodes: updatedNodes, cwd: cwd || workflow.cwd },
        });
      } else if (cwd && cwd !== workflow.cwd) {
        await updateWorkflow.mutateAsync({
          id: workflowId,
          data: { cwd },
        });
      }

      onDeploy(workflowId);
      toast.success("Workflow launched");
      onClose();
    } catch {
      toast.error("Failed to launch workflow");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            <Rocket size={14} />
            Launch Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Workflow info */}
          <div>
            <div className="text-xs font-medium">{workflow.name}</div>
            {workflow.description && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">
                {workflow.description}
              </p>
            )}
          </div>

          {/* CWD picker */}
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
              Working Directory
            </label>
            <div className="mt-1">
              <DirectoryPicker
                value={cwd || workflow.cwd}
                onChange={setCwd}
                compact
              />
            </div>
          </div>

          {/* Agent-to-step mapping */}
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1.5 block">
              Steps ({workflow.nodes.length})
            </label>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {workflow.nodes.map((node) => {
                const isConfirmed =
                  node.status === "ready" || node.status === "completed";
                return (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20"
                  >
                    {isConfirmed ? (
                      <CheckCircle2
                        size={12}
                        className="shrink-0 text-emerald-500 dark:text-emerald-400"
                      />
                    ) : (
                      <HelpCircle
                        size={12}
                        className="shrink-0 text-amber-400 dark:text-amber-300"
                      />
                    )}
                    <span className="text-xs truncate flex-1">
                      {node.label}
                    </span>
                    {node.agentName && (
                      <span className="text-meta text-muted-foreground/50 font-mono">
                        {node.agentName}
                      </span>
                    )}
                    {node.model && (
                      <span className="text-meta text-text-quaternary flex items-center gap-0.5">
                        <Cpu size={8} />
                        {node.model}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Auto-confirm checkbox */}
          {unconfirmedNodes.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfirm}
                onChange={(e) => setAutoConfirm(e.target.checked)}
                className="rounded border-border"
              />
              Auto-confirm all {unconfirmedNodes.length} unconfirmed step
              {unconfirmedNodes.length !== 1 && "s"}
            </label>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleDeploy}
            disabled={!allReady || deploying}
          >
            <Rocket size={10} />
            {deploying ? "Launching..." : "Launch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
