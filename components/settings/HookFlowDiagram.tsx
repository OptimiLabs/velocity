"use client";

import type { LucideIcon } from "lucide-react";
import {
  Zap,
  Terminal,
  CheckCircle,
  FileEdit,
  MessageSquare,
  Bot,
  Clock,
  ShieldCheck,
} from "lucide-react";

export interface FlowStep {
  label: string;
  icon: LucideIcon;
  color?: string;
}

interface HookFlowDiagramProps {
  steps: FlowStep[];
  compact?: boolean;
}

/**
 * Build a flow steps array from a hook config for visualization.
 * This infers meaningful trigger → action → result steps from the config shape.
 */
export function buildFlowSteps(config: {
  event: string;
  matcher?: string;
  hook: {
    type: string;
    command?: string;
    prompt?: string;
    timeout?: number;
  };
}): FlowStep[] {
  const steps: FlowStep[] = [];

  // Step 1: Trigger source
  if (config.matcher) {
    steps.push({
      label: config.matcher.replace(/\|/g, " / "),
      icon: FileEdit,
      color: "text-blue-500 dark:text-blue-400",
    });
  } else {
    steps.push({
      label: EVENT_LABELS[config.event] || config.event,
      icon: Clock,
      color: "text-muted-foreground",
    });
  }

  // Step 2: Event fires
  steps.push({
    label: `${config.event} fires`,
    icon: Zap,
    color: "text-yellow-500 dark:text-yellow-400",
  });

  // Step 3: Action
  if (config.hook.type === "command") {
    const cmd = config.hook.command || "command";
    const short = cmd.length > 30 ? cmd.slice(0, 27).trimEnd() + "..." : cmd;
    steps.push({ label: short, icon: Terminal, color: "text-green-500 dark:text-green-400" });
  } else if (config.hook.type === "prompt") {
    steps.push({
      label: "Prompt evaluated",
      icon: MessageSquare,
      color: "text-purple-500 dark:text-purple-400",
    });
  } else {
    steps.push({
      label: "Agent spawned",
      icon: Bot,
      color: "text-chart-4",
    });
  }

  // Step 4: Result
  steps.push({
    label: RESULT_LABELS[config.event] || "Complete",
    icon: config.event.startsWith("Pre") ? ShieldCheck : CheckCircle,
    color: config.event.startsWith("Pre") ? "text-amber-500 dark:text-amber-400" : "text-green-500 dark:text-green-400",
  });

  return steps;
}

const EVENT_LABELS: Record<string, string> = {
  PreToolUse: "Tool call",
  PostToolUse: "Tool done",
  PostToolUseFailure: "Tool failed",
  PermissionRequest: "Permission ask",
  Stop: "Session ending",
  SessionStart: "Session opens",
  SessionEnd: "Session closes",
  Setup: "Repo init",
  SubagentStart: "Agent spawned",
  SubagentStop: "Agent done",
  PreCompact: "Before compact",
  UserPromptSubmit: "User prompt",
  Notification: "Notification",
  TaskCompleted: "Task done",
  TeammateIdle: "Teammate idle",
};

const RESULT_LABELS: Record<string, string> = {
  PreToolUse: "Validated",
  PostToolUse: "Processed",
  PostToolUseFailure: "Recovered",
  PermissionRequest: "Resolved",
  Stop: "Verified",
  SessionStart: "Initialized",
  SessionEnd: "Cleaned up",
  Setup: "Configured",
  SubagentStart: "Launched",
  SubagentStop: "Checked",
  PreCompact: "Prepared",
  UserPromptSubmit: "Filtered",
  Notification: "Dispatched",
  TaskCompleted: "Finalized",
  TeammateIdle: "Handled",
};

export function HookFlowDiagram({ steps, compact }: HookFlowDiagramProps) {
  if (steps.length === 0) return null;

  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {steps.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={i} className="flex items-center shrink-0">
            {i > 0 && (
              <div className="flex items-center px-1">
                <div className="w-4 h-px bg-border" />
                <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-border" />
              </div>
            )}
            <div
              className={`flex items-center gap-1.5 rounded-md border border-border bg-muted/30 ${
                compact ? "px-2 py-1" : "px-2.5 py-1.5"
              }`}
            >
              <Icon
                size={compact ? 10 : 12}
                className={step.color || "text-muted-foreground"}
              />
              <span
                className={`${compact ? "text-[10px]" : "text-xs"} font-medium whitespace-nowrap`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
