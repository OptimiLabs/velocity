"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Trash2,
  Rocket,
  CheckCircle2,
  Loader2,
  XCircle,
  HelpCircle,
  CircleCheck,
  Terminal,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Workflow, WorkflowNodeStatus } from "@/types/workflow";

const nodeStatusIcon: Record<
  WorkflowNodeStatus,
  { icon: typeof HelpCircle; color: string }
> = {
  unconfirmed: { icon: HelpCircle, color: "text-amber-400 dark:text-amber-300" },
  ready: { icon: CheckCircle2, color: "text-emerald-500 dark:text-emerald-400" },
  running: { icon: Loader2, color: "text-blue-500 dark:text-blue-400 animate-spin" },
  completed: { icon: CircleCheck, color: "text-emerald-500 dark:text-emerald-400" },
  error: { icon: XCircle, color: "text-red-500 dark:text-red-400" },
};

interface WorkflowDetailViewProps {
  workflow: Workflow;
  onDelete: () => void;
  onLaunch: () => void;
  onDeploy?: (workflowId: string) => void;
  onDeployAsCommand?: (workflowId: string) => void;
  onEditActivationContext?: (workflowId: string) => void;
}

export function WorkflowDetailView({
  workflow,
  onDelete,
  onLaunch,
  onDeploy,
  onDeployAsCommand,
  onEditActivationContext,
}: WorkflowDetailViewProps) {
  const isCodexProvider = workflow.provider === "codex";
  const supportsNativeSlash = !isCodexProvider;
  const completedCount = workflow.nodes.filter(
    (n) => n.status === "completed",
  ).length;
  const progress =
    workflow.nodes.length > 0
      ? (completedCount / workflow.nodes.length) * 100
      : 0;

  return (
    <div className="p-4 space-y-4">
      {/* Description */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {workflow.description || "No description"}
        </p>
        {workflow.cwd && (
          <p className="text-meta text-text-tertiary font-mono truncate">
            {workflow.cwd}
          </p>
        )}
      </div>

      {/* Progress bar */}
      {workflow.nodes.length > 0 && (
        <div>
          <div className="flex items-center justify-between text-meta text-muted-foreground/50 mb-1">
            <span>Progress</span>
            <span>
              {completedCount}/{workflow.nodes.length}
            </span>
          </div>
          <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary/60 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Node list */}
      <div>
        <div className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1.5">
          Steps
        </div>
        <div className="space-y-1">
          {workflow.nodes.map((node) => {
            const si =
              nodeStatusIcon[node.status] ?? nodeStatusIcon.unconfirmed;
            const Icon = si.icon;
            return (
              <div
                key={node.id}
                className="flex items-center gap-2 px-2 py-1 rounded bg-muted/20"
              >
                <Icon size={12} className={cn("shrink-0", si.color)} />
                <span className="text-xs truncate flex-1">{node.label}</span>
                {node.agentName && (
                  <span className="text-meta text-text-tertiary font-mono truncate max-w-[80px]">
                    {node.agentName}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Skill config */}
      {workflow.commandName && (
        <div className="space-y-1.5">
          <div className="text-meta uppercase tracking-wider text-muted-foreground/50">
            Skill
          </div>
          <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/20">
            <Terminal size={12} className="shrink-0 text-primary/60" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono">
                {isCodexProvider
                  ? `$${workflow.commandName}`
                  : `/${workflow.commandName}`}
              </div>
              {workflow.commandDescription && (
                <div className="text-micro text-muted-foreground/50 truncate">
                  {workflow.commandDescription}
                </div>
              )}
            </div>
            {onEditActivationContext && (
              <button
                onClick={() => onEditActivationContext(workflow.id)}
                className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0"
              >
                <Pencil size={10} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border/30">
        {onDeploy ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onDeploy(workflow.id)}
          >
            <Rocket size={10} />
            Deploy
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onLaunch}
          >
            <Rocket size={10} />
            Launch
          </Button>
        )}
        {onDeployAsCommand && workflow.nodes.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onDeployAsCommand(workflow.id)}
              >
                <Terminal size={10} />
                Save Skill
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {workflow.commandName ? (
                isCodexProvider ? (
                  <span>
                    Saves skill <span className="font-mono">{workflow.commandName}</span>.
                    In Codex, run <span className="font-mono">/skills</span> to
                    launch it or mention{" "}
                    <span className="font-mono">${workflow.commandName}</span>.
                  </span>
                ) : (
                  <span>
                    Saves <span className="font-mono">/{workflow.commandName}</span>{" "}
                    to your CLI. If it already exists, it will be updated.
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
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 size={10} />
          Delete
        </Button>
      </div>
    </div>
  );
}
