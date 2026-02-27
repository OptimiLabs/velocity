"use client";

import {
  PlayCircle,
  MessageSquare,
  Wrench,
  Bot,
  Layers,
  Bell,
  ArrowRight,
  ArrowDown,
  type LucideIcon,
} from "lucide-react";
import {
  EVENT_RUNTIME_REQUIREMENTS,
  type EventRuntimeRequirement,
} from "@/lib/hooks/hook-editor-constants";

interface EventDef {
  id: string;
  label: string;
  description: string;
  frequency: string;
}

export interface HookLifecyclePhase {
  label: string;
  events: EventDef[];
}

interface LifecyclePhaseStyle {
  icon: LucideIcon;
  color: string;
  bgGradient: string;
  borderColor: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
}

const DEFAULT_PHASE_STYLE: LifecyclePhaseStyle = {
  icon: Layers,
  color: "text-slate-500 dark:text-slate-400",
  bgGradient: "from-slate-500/10 to-slate-500/5",
  borderColor: "border-slate-500/25",
  dotColor: "bg-slate-500 dark:bg-slate-400",
  badgeBg: "bg-slate-500/15",
  badgeText: "text-slate-500 dark:text-slate-400",
};

const PHASE_STYLE_BY_LABEL: Record<string, LifecyclePhaseStyle> = {
  session: {
    icon: PlayCircle,
    color: "text-blue-500 dark:text-blue-400",
    bgGradient: "from-blue-500/10 to-blue-500/5",
    borderColor: "border-blue-500/25",
    dotColor: "bg-blue-500 dark:bg-blue-400",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-500 dark:text-blue-400",
  },
  user: {
    icon: MessageSquare,
    color: "text-purple-500 dark:text-purple-400",
    bgGradient: "from-purple-500/10 to-purple-500/5",
    borderColor: "border-purple-500/25",
    dotColor: "bg-purple-500 dark:bg-purple-400",
    badgeBg: "bg-purple-500/15",
    badgeText: "text-purple-500 dark:text-purple-400",
  },
  prompt: {
    icon: MessageSquare,
    color: "text-violet-500 dark:text-violet-400",
    bgGradient: "from-violet-500/10 to-violet-500/5",
    borderColor: "border-violet-500/25",
    dotColor: "bg-violet-500 dark:bg-violet-400",
    badgeBg: "bg-violet-500/15",
    badgeText: "text-violet-500 dark:text-violet-400",
  },
  tools: {
    icon: Wrench,
    color: "text-green-500 dark:text-green-400",
    bgGradient: "from-green-500/10 to-green-500/5",
    borderColor: "border-green-500/25",
    dotColor: "bg-green-500 dark:bg-green-400",
    badgeBg: "bg-green-500/15",
    badgeText: "text-green-500 dark:text-green-400",
  },
  agents: {
    icon: Bot,
    color: "text-amber-500 dark:text-amber-400",
    bgGradient: "from-amber-500/10 to-amber-500/5",
    borderColor: "border-amber-500/25",
    dotColor: "bg-amber-500 dark:bg-amber-400",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-500 dark:text-amber-400",
  },
  context: {
    icon: Layers,
    color: "text-cyan-500 dark:text-cyan-400",
    bgGradient: "from-cyan-500/10 to-cyan-500/5",
    borderColor: "border-cyan-500/25",
    dotColor: "bg-cyan-500 dark:bg-cyan-400",
    badgeBg: "bg-cyan-500/15",
    badgeText: "text-cyan-500 dark:text-cyan-400",
  },
  signals: {
    icon: Bell,
    color: "text-red-400 dark:text-red-300",
    bgGradient: "from-red-500/10 to-red-500/5",
    borderColor: "border-red-400/25",
    dotColor: "bg-red-400 dark:bg-red-300",
    badgeBg: "bg-red-400/15",
    badgeText: "text-red-400 dark:text-red-300",
  },
};

const DEFAULT_LIFECYCLE_PHASES: HookLifecyclePhase[] = [
  {
    label: "Session",
    events: [
      {
        id: "SessionStart",
        label: "SessionStart",
        description: "When a session starts",
        frequency: "Once per session",
      },
      {
        id: "SessionEnd",
        label: "SessionEnd",
        description: "When a session ends",
        frequency: "Once per session",
      },
      {
        id: "Setup",
        label: "Setup",
        description: "During repository initialization",
        frequency: "Once per session",
      },
      {
        id: "WorktreeCreate",
        label: "WorktreeCreate",
        description: "When a worktree is created",
        frequency: "Per worktree",
      },
      {
        id: "WorktreeRemove",
        label: "WorktreeRemove",
        description: "When a worktree is removed",
        frequency: "Per worktree",
      },
    ],
  },
  {
    label: "User",
    events: [
      {
        id: "UserPromptSubmit",
        label: "UserPromptSubmit",
        description: "When user submits a prompt",
        frequency: "Every message",
      },
      {
        id: "PermissionRequest",
        label: "PermissionRequest",
        description: "When a permission dialog appears",
        frequency: "Per permission",
      },
    ],
  },
  {
    label: "Tools",
    events: [
      {
        id: "PreToolUse",
        label: "PreToolUse",
        description: "Before a tool is called",
        frequency: "Every tool call",
      },
      {
        id: "PostToolUse",
        label: "PostToolUse",
        description: "After a tool completes",
        frequency: "Every tool call",
      },
      {
        id: "PostToolUseFailure",
        label: "PostToolUseFailure",
        description: "After a tool call fails",
        frequency: "Every tool call",
      },
    ],
  },
  {
    label: "Agents",
    events: [
      {
        id: "SubagentStart",
        label: "SubagentStart",
        description: "When a subagent is spawned",
        frequency: "Per subagent",
      },
      {
        id: "SubagentStop",
        label: "SubagentStop",
        description: "When a subagent stops",
        frequency: "Per subagent",
      },
      {
        id: "TaskCompleted",
        label: "TaskCompleted",
        description: "When a task is marked completed",
        frequency: "Per task",
      },
      {
        id: "TeammateIdle",
        label: "TeammateIdle",
        description: "When a teammate is about to go idle",
        frequency: "Per task",
      },
    ],
  },
  {
    label: "Context",
    events: [
      {
        id: "PreCompact",
        label: "PreCompact",
        description: "Before context compaction",
        frequency: "Occasional",
      },
    ],
  },
  {
    label: "Signals",
    events: [
      {
        id: "Notification",
        label: "Notification",
        description: "When Claude sends a notification",
        frequency: "Occasional",
      },
      {
        id: "Stop",
        label: "Stop",
        description: "When Claude is about to stop",
        frequency: "End of session",
      },
      {
        id: "ConfigChange",
        label: "ConfigChange",
        description: "When a configuration file changes",
        frequency: "Per change",
      },
    ],
  },
];

interface HookLifecycleDiagramProps {
  onEventClick?: (eventId: string) => void;
  activeEvents?: Set<string>;
  hookCounts?: Record<string, number>;
  phases?: HookLifecyclePhase[];
  eventRuntimeRequirements?: Record<string, EventRuntimeRequirement>;
}

export function HookLifecycleDiagram({
  onEventClick,
  activeEvents,
  hookCounts,
  phases,
  eventRuntimeRequirements,
}: HookLifecycleDiagramProps) {
  const lifecyclePhases = phases?.length ? phases : DEFAULT_LIFECYCLE_PHASES;
  const totalEvents = lifecyclePhases.reduce(
    (sum, phase) => sum + phase.events.length,
    0,
  );
  const phaseCount = lifecyclePhases.length;
  const runtimeRequirements =
    eventRuntimeRequirements ?? EVENT_RUNTIME_REQUIREMENTS;

  let gridColsClass = "lg:grid-cols-6";
  if (phaseCount <= 2) gridColsClass = "lg:grid-cols-2";
  else if (phaseCount === 3) gridColsClass = "lg:grid-cols-3";
  else if (phaseCount === 4) gridColsClass = "lg:grid-cols-4";
  else if (phaseCount === 5) gridColsClass = "lg:grid-cols-5";

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Hook Lifecycle</h3>
        <span className="text-xs text-muted-foreground">
          {totalEvents} events across {phaseCount} phases
        </span>
      </div>

      {/* Responsive grid: 2 cols mobile, configurable desktop columns */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 ${gridColsClass} gap-3`}>
          {lifecyclePhases.map((phase, phaseIdx) => {
            const style =
              PHASE_STYLE_BY_LABEL[phase.label.toLowerCase()] ?? DEFAULT_PHASE_STYLE;
            const Icon = style.icon;
            return (
              <div key={phase.label} className="relative">
                {/* Arrow separator — only visible on lg when all 6 are in one row */}
                {phaseIdx > 0 && (
                  <div className="hidden lg:flex absolute -left-[9px] top-1/2 -translate-y-1/2 -translate-x-1/2 text-muted-foreground/40">
                    <ArrowRight size={14} />
                  </div>
                )}

                {/* Phase card */}
                <div
                  className={`rounded-xl border ${style.borderColor} bg-gradient-to-b ${style.bgGradient} p-3 flex flex-col h-full`}
                >
                  {/* Phase header */}
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Icon size={14} className={style.color} />
                    <span className={`text-xs font-semibold ${style.color}`}>
                      {phase.label}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    {phase.events.map((evt, evtIdx) => {
                      const isActive = activeEvents?.has(evt.id);
                      const count = hookCounts?.[evt.id];
                      const runtime = runtimeRequirements[evt.id];

                      return (
                        <div key={evt.id} className="flex flex-col gap-1.5">
                          {/* Down arrow between events */}
                          {evtIdx > 0 && (
                            <div className="flex justify-center -my-0.5">
                              <ArrowDown
                                size={10}
                                className="text-muted-foreground/30"
                              />
                            </div>
                          )}

                          {/* Event button */}
                          <button
                            onClick={() => onEventClick?.(evt.id)}
                            className={`group relative rounded-lg border px-2.5 py-1.5 text-left transition-all ${
                              isActive
                                ? `${style.borderColor} bg-background shadow-sm hover:shadow-md`
                                : "border-transparent opacity-60 hover:opacity-100 hover:bg-background/50 hover:border-border/50"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              {/* Pulse dot for active */}
                              {isActive && (
                                <span className="relative flex h-2 w-2 shrink-0">
                                  <span
                                    className={`absolute inline-flex h-full w-full rounded-full ${style.dotColor} opacity-75 animate-ping`}
                                  />
                                  <span
                                    className={`relative inline-flex rounded-full h-2 w-2 ${style.dotColor}`}
                                  />
                                </span>
                              )}
                              <span className="text-[11px] font-mono font-medium truncate">
                                {evt.label}
                              </span>
                              {/* Count badge */}
                              {count != null && count > 0 && (
                                <span
                                  className={`ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0 leading-4 ${style.badgeBg} ${style.badgeText}`}
                                >
                                  {count}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                              {evt.description}
                            </p>
                            {runtime?.support === "conditional" && (
                              <p className="text-[9px] text-amber-600 dark:text-amber-400 leading-tight mt-0.5">
                                Conditional
                              </p>
                            )}
                            <p className="text-[9px] text-muted-foreground/60 leading-tight mt-0.5 italic">
                              {evt.frequency}
                            </p>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
