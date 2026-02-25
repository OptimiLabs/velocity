"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HookEditor, type HookConfig, formatTimeout, EVENT_FREQUENCY } from "@/components/settings/HookEditor";
import { HookLifecycleDiagram } from "@/components/settings/HookLifecycleDiagram";
import type { ClaudeSettings } from "@/lib/claude-settings";
import type { HookRule } from "@/lib/hooks/matcher";

const HOOK_EVENTS = [
  { id: "PreToolUse", description: "Before a tool is called" },
  { id: "PostToolUse", description: "After a tool completes" },
  { id: "PostToolUseFailure", description: "After a tool call fails" },
  { id: "PermissionRequest", description: "When a permission dialog appears" },
  { id: "Notification", description: "When Claude sends a notification" },
  { id: "Stop", description: "When Claude is about to stop" },
  { id: "SubagentStart", description: "When a subagent is spawned" },
  { id: "SubagentStop", description: "When a subagent stops" },
  { id: "PreCompact", description: "Before context compaction" },
  { id: "SessionStart", description: "When a session starts" },
  { id: "SessionEnd", description: "When a session ends" },
  { id: "UserPromptSubmit", description: "When user submits a prompt" },
  { id: "TaskCompleted", description: "When a task is marked completed" },
  { id: "TeammateIdle", description: "When a teammate is about to go idle" },
  { id: "Setup", description: "During repository initialization" },
  { id: "ConfigChange", description: "When a configuration file changes" },
  { id: "WorktreeCreate", description: "When a worktree is created" },
  { id: "WorktreeRemove", description: "When a worktree is removed" },
] as const;

/** Flatten rules into displayable rows */
interface FlatHook {
  ruleIndex: number;
  hookIndex: number;
  matcher?: string;
  hook: HookConfig;
}

function flattenRules(rules: HookRule[]): FlatHook[] {
  const result: FlatHook[] = [];
  rules.forEach((rule, ri) => {
    if (!rule.hooks || !Array.isArray(rule.hooks)) return;
    rule.hooks.forEach((hook, hi) => {
      result.push({
        ruleIndex: ri,
        hookIndex: hi,
        matcher: rule.matcher,
        hook,
      });
    });
  });
  return result;
}

function describeHook(event: string, fh: FlatHook): string {
  const eventDesc =
    HOOK_EVENTS.find((e) => e.id === event)?.description ?? event;
  const matcherPart = fh.matcher ? ` on ${fh.matcher}` : "";
  if (fh.hook.type === "command") {
    const cmd = fh.hook.command?.split(/\s/)[0]?.split("/").pop() ?? "command";
    return `${eventDesc}${matcherPart}: runs ${cmd}`;
  }
  if (fh.hook.type === "prompt") {
    const snippet = fh.hook.prompt?.slice(0, 50)?.replace(/\n/g, " ") ?? "";
    return `${eventDesc}${matcherPart}: "${snippet}…"`;
  }
  return `${eventDesc}${matcherPart}`;
}

interface HooksTabProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

export function HooksTab({ settings, onUpdate }: HooksTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const [editingHook, setEditingHook] = useState<{
    event: string;
    ruleIndex?: number;
    hookIndex?: number;
    hook?: HookConfig;
    matcher?: string;
    aiMode?: boolean;
  } | null>(() => {
    // Support ?action=new-hook from console command navigation
    const action = searchParams.get("action");
    if (action === "new-hook") return { event: "" };
    if (action === "new-hook-ai") return { event: "", aiMode: true };
    return null;
  });

  const hooks = useMemo(
    () => (settings.hooks || {}) as Record<string, HookRule[]>,
    [settings.hooks],
  );

  // Compute which events have active hooks for the lifecycle diagram
  const activeEvents = useMemo(() => {
    const set = new Set<string>();
    for (const [event, rules] of Object.entries(hooks)) {
      if (Array.isArray(rules) && rules.some((r) => r.hooks?.length > 0)) {
        set.add(event);
      }
    }
    return set;
  }, [hooks]);

  // Compute hook counts per event for lifecycle diagram badges
  const hookCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [event, rules] of Object.entries(hooks)) {
      const total = (rules || []).reduce(
        (sum: number, r: HookRule) => sum + (r.hooks?.length || 0),
        0,
      );
      if (total > 0) counts[event] = total;
    }
    return counts;
  }, [hooks]);

  const toggle = (id: string) =>
    setExpanded((prev) => (prev === id ? null : id));

  const getEventFlat = (eventId: string): FlatHook[] =>
    flattenRules(hooks[eventId] || []);

  const handleEventClick = (eventId: string) => {
    setExpanded(eventId);
    // Scroll to the event accordion
    const el = document.getElementById(`hook-event-${eventId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const saveHook = async (
    hook: HookConfig,
    meta: { events: string[]; matcher: string },
    ruleIndex?: number,
    hookIndex?: number,
  ) => {
    // Guard: reject hooks missing required fields
    if (hook.type === "command" && !hook.command?.trim()) return;
    if ((hook.type === "prompt" || hook.type === "agent") && !hook.prompt?.trim()) return;
    if (ruleIndex !== undefined && hookIndex !== undefined) {
      // Editing existing hook — single event update
      const targetEvent = meta.events[0];
      const eventRules: HookRule[] = [...(hooks[targetEvent] || [])];
      const rule = { ...eventRules[ruleIndex] };
      const hks = [...rule.hooks];
      hks[hookIndex] = hook;
      rule.hooks = hks;
      if (meta.matcher) rule.matcher = meta.matcher;
      else delete rule.matcher;
      eventRules[ruleIndex] = rule;
      await onUpdate({ hooks: { ...hooks, [targetEvent]: eventRules } });
    } else {
      // Creating new hook — write to every selected event
      const newRule: HookRule = { hooks: [hook] };
      if (meta.matcher) newRule.matcher = meta.matcher;
      const updatedHooks = { ...hooks };
      for (const ev of meta.events) {
        updatedHooks[ev] = [...(updatedHooks[ev] || []), newRule];
      }
      await onUpdate({ hooks: updatedHooks });
    }
    setEditingHook(null);
  };

  const deleteHook = async (
    event: string,
    ruleIndex: number,
    hookIndex: number,
  ) => {
    const eventRules: HookRule[] = [...(hooks[event] || [])];
    const rule = { ...eventRules[ruleIndex] };
    const hks = [...rule.hooks];
    hks.splice(hookIndex, 1);

    if (hks.length === 0) {
      eventRules.splice(ruleIndex, 1);
    } else {
      rule.hooks = hks;
      eventRules[ruleIndex] = rule;
    }

    const next = { ...hooks };
    if (eventRules.length === 0) {
      delete next[event];
    } else {
      next[event] = eventRules;
    }
    await onUpdate({ hooks: next });
  };

  return (
    <div className="space-y-6">
      {/* Lifecycle Diagram — full width at top */}
      <HookLifecycleDiagram
        onEventClick={handleEventClick}
        activeEvents={activeEvents}
        hookCounts={hookCounts}
      />

      {/* Hook Events Accordion */}
      <section className="space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Hook Events</h3>
          <div className="flex items-center gap-3">
            <a
              href="/marketplace?type=hook"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse templates
              <ExternalLink size={10} />
            </a>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => setEditingHook({ event: "" })}
              >
                <Plus size={12} />
                New Hook
              </Button>
              <Button
                variant="outline"
                size="icon-xs"
                className="h-7 w-7"
                onClick={() => setEditingHook({ event: "", aiMode: true })}
                title="Build with AI"
                aria-label="Build hook with AI"
              >
                <Sparkles size={12} />
              </Button>
            </div>
          </div>
        </div>
        {HOOK_EVENTS.map(({ id, description }) => {
          const flatHooks = getEventFlat(id);
          const isExpanded = expanded === id;
          return (
            <div
              key={id}
              id={`hook-event-${id}`}
              className="border border-border rounded-lg overflow-hidden"
            >
              <button
                onClick={() => toggle(id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
                <span className="text-xs font-mono font-medium flex-1">
                  {id}
                </span>
                <span className="text-meta text-muted-foreground">
                  {description}
                </span>
                {flatHooks.length > 0 && (
                  <Badge variant="secondary" className="text-meta ml-2">
                    {flatHooks.length}
                  </Badge>
                )}
              </button>
              {isExpanded && (
                <div className="border-t border-border px-3 py-2 space-y-2 bg-muted/20">
                  {flatHooks.map((fh, i) => (
                    <div
                      key={i}
                      className="text-xs bg-background rounded px-2 py-1.5 border border-border/50 space-y-1"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-meta shrink-0">
                          {fh.hook.type}
                        </Badge>
                        {(() => {
                          const freq = EVENT_FREQUENCY[id];
                          if (!freq || freq.level !== "high") return null;
                          // For tool events, only warn if no narrow matcher
                          const isToolEvent = ["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(id);
                          if (isToolEvent && fh.matcher) return null;
                          const label = id === "UserPromptSubmit" ? "every message" : "every tool call";
                          return (
                            <Badge className="text-meta shrink-0 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25 hover:bg-amber-500/20">
                              &#9889; {label}
                            </Badge>
                          );
                        })()}
                        <span className="font-mono truncate flex-1">
                          {fh.hook.type === "command"
                            ? fh.hook.command
                            : fh.hook.prompt?.slice(0, 60)}
                        </span>
                        {fh.hook.timeout != null && (
                          <span className="text-meta text-muted-foreground shrink-0">
                            {formatTimeout(fh.hook.timeout)}
                          </span>
                        )}
                        {fh.matcher && (
                          <Badge
                            variant="secondary"
                            className="text-meta shrink-0"
                          >
                            match: {fh.matcher}
                          </Badge>
                        )}
                        <button
                          onClick={() =>
                            setEditingHook({
                              event: id,
                              ruleIndex: fh.ruleIndex,
                              hookIndex: fh.hookIndex,
                              hook: fh.hook,
                              matcher: fh.matcher,
                            })
                          }
                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            deleteHook(id, fh.ruleIndex, fh.hookIndex)
                          }
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="text-meta text-muted-foreground truncate">
                        {describeHook(id, fh)}
                      </p>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingHook({ event: id })}
                  >
                    <Plus size={12} className="mr-1" /> Add Hook
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Hook Editor Modal */}
      {editingHook && (
        <HookEditor
          event={editingHook.event}
          hook={editingHook.hook}
          initialMatcher={editingHook.matcher}
          initialAIMode={editingHook.aiMode}
          onSave={(hook, meta) =>
            saveHook(hook, meta, editingHook.ruleIndex, editingHook.hookIndex)
          }
          onCancel={() => setEditingHook(null)}
        />
      )}
    </div>
  );
}
