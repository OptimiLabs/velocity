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

interface EventDef {
  id: string;
  label: string;
  description: string;
  frequency: string;
}

interface LifecyclePhase {
  label: string;
  icon: LucideIcon;
  color: string;
  bgGradient: string;
  borderColor: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  events: EventDef[];
}

const LIFECYCLE_PHASES: LifecyclePhase[] = [
  {
    label: "Session",
    icon: PlayCircle,
    color: "text-blue-500 dark:text-blue-400",
    bgGradient: "from-blue-500/10 to-blue-500/5",
    borderColor: "border-blue-500/25",
    dotColor: "bg-blue-500 dark:bg-blue-400",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-500 dark:text-blue-400",
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
    icon: MessageSquare,
    color: "text-purple-500 dark:text-purple-400",
    bgGradient: "from-purple-500/10 to-purple-500/5",
    borderColor: "border-purple-500/25",
    dotColor: "bg-purple-500 dark:bg-purple-400",
    badgeBg: "bg-purple-500/15",
    badgeText: "text-purple-500 dark:text-purple-400",
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
    icon: Wrench,
    color: "text-green-500 dark:text-green-400",
    bgGradient: "from-green-500/10 to-green-500/5",
    borderColor: "border-green-500/25",
    dotColor: "bg-green-500 dark:bg-green-400",
    badgeBg: "bg-green-500/15",
    badgeText: "text-green-500 dark:text-green-400",
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
    icon: Bot,
    color: "text-amber-500 dark:text-amber-400",
    bgGradient: "from-amber-500/10 to-amber-500/5",
    borderColor: "border-amber-500/25",
    dotColor: "bg-amber-500 dark:bg-amber-400",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-500 dark:text-amber-400",
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
    icon: Layers,
    color: "text-cyan-500 dark:text-cyan-400",
    bgGradient: "from-cyan-500/10 to-cyan-500/5",
    borderColor: "border-cyan-500/25",
    dotColor: "bg-cyan-500 dark:bg-cyan-400",
    badgeBg: "bg-cyan-500/15",
    badgeText: "text-cyan-500 dark:text-cyan-400",
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
    icon: Bell,
    color: "text-red-400 dark:text-red-300",
    bgGradient: "from-red-500/10 to-red-500/5",
    borderColor: "border-red-400/25",
    dotColor: "bg-red-400 dark:bg-red-300",
    badgeBg: "bg-red-400/15",
    badgeText: "text-red-400 dark:text-red-300",
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
}

export function HookLifecycleDiagram({
  onEventClick,
  activeEvents,
  hookCounts,
}: HookLifecycleDiagramProps) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium">Hook Lifecycle</h3>
        <span className="text-xs text-muted-foreground">
          17 events across 6 phases
        </span>
      </div>

      {/* Responsive grid: 2 cols mobile, 3 cols tablet, 6 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {LIFECYCLE_PHASES.map((phase, phaseIdx) => {
            const Icon = phase.icon;
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
                  className={`rounded-xl border ${phase.borderColor} bg-gradient-to-b ${phase.bgGradient} p-3 flex flex-col h-full`}
                >
                  {/* Phase header */}
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Icon size={14} className={phase.color} />
                    <span className={`text-xs font-semibold ${phase.color}`}>
                      {phase.label}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="flex flex-col gap-1.5 flex-1">
                    {phase.events.map((evt, evtIdx) => {
                      const isActive = activeEvents?.has(evt.id);
                      const count = hookCounts?.[evt.id];

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
                                ? `${phase.borderColor} bg-background shadow-sm hover:shadow-md`
                                : "border-transparent opacity-60 hover:opacity-100 hover:bg-background/50 hover:border-border/50"
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              {/* Pulse dot for active */}
                              {isActive && (
                                <span className="relative flex h-2 w-2 shrink-0">
                                  <span
                                    className={`absolute inline-flex h-full w-full rounded-full ${phase.dotColor} opacity-75 animate-ping`}
                                  />
                                  <span
                                    className={`relative inline-flex rounded-full h-2 w-2 ${phase.dotColor}`}
                                  />
                                </span>
                              )}
                              <span className="text-[11px] font-mono font-medium truncate">
                                {evt.label}
                              </span>
                              {/* Count badge */}
                              {count != null && count > 0 && (
                                <span
                                  className={`ml-auto text-[10px] font-semibold rounded-full px-1.5 py-0 leading-4 ${phase.badgeBg} ${phase.badgeText}`}
                                >
                                  {count}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                              {evt.description}
                            </p>
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
