"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Play,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Loader2,
  Info,
  AlertCircle,
} from "lucide-react";
import { useAgents } from "@/hooks/useAgents";
import { useSkills } from "@/hooks/useSkills";
import { cn } from "@/lib/utils";
import { INLINE_TEMPLATES } from "@/lib/marketplace/builtin-hooks";
import { validateHookConfig } from "@/lib/hooks/validate";
import {
  EVENT_GROUPS as CLAUDE_EVENT_GROUPS,
  EVENT_FREQUENCY as CLAUDE_EVENT_FREQUENCY,
} from "@/lib/hooks/hook-editor-constants";
import {
  getHookProviderProfile,
  type HookSettingsProvider,
} from "@/lib/hooks/provider-profile";
import {
  normalizeTimeout,
  formatTimeout,
  appendPromptFormatHint,
  stripPromptFormatHint,
  describeEditingHook,
} from "@/lib/hooks/hook-editor-utils";
import type { MarketplaceItem } from "@/types/marketplace";

export interface HookConfig {
  type: "command" | "prompt" | "agent";
  command?: string;
  prompt?: string;
  matcher?: string | Record<string, unknown>;
  timeout?: number;
  async?: boolean;
  model?: string;
  statusMessage?: string;
}
type AssistPanelMode = "templates" | "ai";

// Re-export constants and utils for consumers that import from HookEditor
export { CLAUDE_EVENT_GROUPS as EVENT_GROUPS, CLAUDE_EVENT_FREQUENCY as EVENT_FREQUENCY };
export type { EventFrequency } from "@/lib/hooks/hook-editor-constants";
export { formatTimeout } from "@/lib/hooks/hook-editor-utils";

interface HookEditorProps {
  provider?: HookSettingsProvider;
  event?: string;
  hook?: HookConfig;
  /** Rule-level matcher (separate from hook config in Claude Code format) */
  initialMatcher?: string;
  /** When true, expand the AI description bar on open */
  initialAIMode?: boolean;
  onSave: (
    hook: HookConfig,
    meta: { events: string[]; matcher: string },
  ) => void;
  onCancel: () => void;
}

export function HookEditor({
  provider = "claude",
  event = "",
  hook,
  initialMatcher,
  initialAIMode,
  onSave,
  onCancel,
}: HookEditorProps) {
  const isEditing = !!hook;
  const profile = useMemo(() => getHookProviderProfile(provider), [provider]);
  const defaultEvent = profile.hookEvents[0] ?? "PostToolUse";
  const fallbackType = profile.supportedTypes[0] ?? "command";
  const initialType =
    hook?.type &&
    profile.supportedTypes.includes(hook.type as HookConfig["type"])
      ? (hook.type as HookConfig["type"])
      : fallbackType;

  // Editing existing hook: single event. New hooks can attach to one or more events.
  const [selectedEvent, setSelectedEvent] = useState(event || defaultEvent);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(
    new Set([event || defaultEvent]),
  );
  const [type, setType] = useState<HookConfig["type"]>(initialType);
  const [command, setCommand] = useState(hook?.command || "");
  const [prompt, setPrompt] = useState(() =>
    stripPromptFormatHint(hook?.prompt || ""),
  );
  const [matcher, setMatcher] = useState(initialMatcher ?? "");
  const [timeout, setTimeout_] = useState(() =>
    normalizeTimeout(hook?.timeout, initialType, profile.defaultTimeouts),
  );
  const [isAsync, setIsAsync] = useState(hook?.async || false);
  const [testOutput, setTestOutput] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [isWindowsClient, setIsWindowsClient] = useState(false);
  useEffect(() => {
    setIsWindowsClient(navigator.platform?.startsWith("Win") ?? false);
  }, []);

  // Tool chip state (for "Which" section)
  const [selectedTools, setSelectedTools] = useState<Set<string>>(() => {
    if (profile.toolChips.length === 0) return new Set();
    if (!initialMatcher) return new Set();
    // Parse matcher back into tool chips if possible
    const parts = initialMatcher.split("|");
    const chipValues = new Set(profile.toolChips.map((c) => c.value));
    if (parts.every((p) => chipValues.has(p))) return new Set(parts);
    return new Set();
  });
  const [useCustomRegex, setUseCustomRegex] = useState(() => {
    if (profile.toolChips.length === 0) return true;
    if (!initialMatcher) return false;
    const parts = initialMatcher.split("|");
    const chipValues = new Set(profile.toolChips.map((c) => c.value));
    return !parts.every((p) => chipValues.has(p));
  });

  // Source picker state (for prompt/agent types)
  const [promptSource, setPromptSource] = useState<
    "custom" | "agent" | "skill"
  >("custom");
  const { data: agents = [] } = useAgents();
  const { data: allSkills = [] } = useSkills();

  // AI generation state
  const [assistMode, setAssistMode] = useState<AssistPanelMode>(
    isEditing || initialAIMode ? "ai" : "templates",
  );
  const [aiDescription, setAiDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReasoning, setAiReasoning] = useState<{
    eventChoice?: string;
    matcherChoice?: string;
    failureModes?: string;
    warnings?: string[];
  } | null>(null);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  // Advanced section
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPromptSources, setShowPromptSources] = useState(false);

  const activeEvents = useMemo(() => {
    if (isEditing) return [selectedEvent];
    return Array.from(selectedEvents);
  }, [isEditing, selectedEvent, selectedEvents]);
  const primaryEvent = activeEvents[0];
  const hasRequiredInput =
    type === "command" ? command.trim().length > 0 : prompt.trim().length > 0;
  const hasToolChips = profile.toolChips.length > 0;

  const toStoredTimeout = useCallback(
    (value: number) =>
      profile.timeoutStorageUnit === "milliseconds"
        ? Math.round(value * 1000)
        : value,
    [profile.timeoutStorageUnit],
  );

  const handleTypeChange = (newType: HookConfig["type"]) => {
    if (!profile.supportedTypes.includes(newType)) return;
    setType(newType);
    if (newType === "command") {
      setPromptSource("custom");
      setShowPromptSources(false);
    }
    // Reset timeout to the new type's default (unless editing an existing hook)
    if (!isEditing) {
      setTimeout_(profile.defaultTimeouts[newType]);
    }
  };

  const handleEventChange = (nextEvent: string) => {
    setSelectedEvent(nextEvent);
    setSelectedEvents(new Set([nextEvent]));
  };

  const toggleEvent = (ev: string) => {
    setSelectedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(ev)) {
        if (next.size > 1) next.delete(ev);
      } else {
        next.add(ev);
      }
      return next;
    });
  };

  const handleToggleTool = (value: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      // Sync matcher
      setMatcher(next.size > 0 ? Array.from(next).join("|") : "");
      return next;
    });
  };

  const buildMatcher = useCallback((): string => {
    if (!hasToolChips) return matcher.trim();
    if (useCustomRegex) return matcher;
    if (selectedTools.size === 0) return matcher;
    return Array.from(selectedTools).join("|");
  }, [hasToolChips, useCustomRegex, matcher, selectedTools]);
  const matcherValue = buildMatcher();
  const hasToolEvent = activeEvents.some((e) => profile.toolEvents.has(e));
  const hasMatcherEvent = activeEvents.some((e) => profile.matcherEvents.has(e));
  const typeDescription = profile.typeDescriptions[type];
  const selectedEventsList = Array.from(selectedEvents);
  const selectedEventsLabel =
    selectedEventsList.length === 0
      ? "Select events"
      : selectedEventsList.length <= 2
        ? selectedEventsList.join(", ")
        : `${selectedEventsList.length} events selected`;
  const selectedConditionalEvents = activeEvents.filter(
    (ev) => profile.eventRuntimeRequirements[ev]?.support === "conditional",
  );
  const selectedToolsList = Array.from(selectedTools);
  const selectedToolsLabel =
    selectedToolsList.length === 0
      ? "All tools (no matcher)"
      : selectedToolsList.length <= 2
        ? selectedToolsList.join(", ")
        : `${selectedToolsList.length} tools selected`;

  const handleSave = () => {
    setAiError(null);
    // Belt-and-suspenders: block save if required field is empty
    if (type === "command" && !command.trim()) return;
    if ((type === "prompt" || type === "agent") && !prompt.trim()) return;
    // Keep saved hook objects constrained to provider-supported fields.
    const config: HookConfig = { type };
    if (type === "command") {
      config.command = command;
      if (profile.supportsAsyncCommand && isAsync) config.async = true;
    } else {
      config.prompt = appendPromptFormatHint(prompt, type);
    }
    // Persist timeout in the provider's expected storage unit.
    const storedTimeout = toStoredTimeout(timeout);
    const defaultStoredTimeout = toStoredTimeout(profile.defaultTimeouts[type]);
    if (storedTimeout !== defaultStoredTimeout) config.timeout = storedTimeout;
    // Editing updates one event. Creating can attach to one or more events.
    const events = activeEvents.filter(Boolean);
    const finalMatcher = buildMatcher();
    const hookInput = { type, command, prompt, matcher: finalMatcher, timeout };

    // Client-side validation before saving
    const validationRows = events.map((ev) => ({
      event: ev,
      result: validateHookConfig(ev, hookInput, {
        provider: profile.provider,
        timeoutUnit: "seconds",
      }),
    }));
    const validationErrors = Array.from(
      new Set(
        validationRows.flatMap(({ event: ev, result }) =>
          result.errors.map((message) =>
            events.length > 1 ? `[${ev}] ${message}` : message,
          ),
        ),
      ),
    );
    const validationWarnings = Array.from(
      new Set(
        validationRows.flatMap(({ event: ev, result }) =>
          result.warnings.map((message) =>
            events.length > 1 ? `[${ev}] ${message}` : message,
          ),
        ),
      ),
    );

    if (!events.length) {
      setAiError("Select at least one event.");
      return;
    }

    if (validationErrors.length > 0) {
      setAiError(validationErrors.join("\n"));
      return;
    }

    if (
      validationWarnings.length > 0 &&
      !window.confirm(
        `Warnings:\n${validationWarnings.join("\n")}\n\nSave anyway?`,
      )
    ) {
      return;
    }

    onSave(config, { events, matcher: finalMatcher });
  };

  const testHook = async () => {
    if (type !== "command" || !command) return;
    setTesting(true);
    setTestOutput(null);
    try {
      const res = await fetch("/api/system/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, timeout: 5000 }),
      });
      const data = await res.json();
      setTestOutput(data.stdout || data.stderr || "(no output)");
    } catch {
      setTestOutput("Failed to execute test");
    }
    setTesting(false);
  };

  const handleSelectSource = (
    source: "custom" | "agent" | "skill",
    name?: string,
  ) => {
    setPromptSource(source);
    if (source === "agent" && name) {
      const agent = agents.find((a) => a.name === name);
      if (agent?.prompt) setPrompt(agent.prompt);
    } else if (source === "skill" && name) {
      const skill = allSkills.find((s) => s.name === name);
      if (skill?.content) setPrompt(skill.content);
    }
  };

  /** Apply a matcher string to the selectedTools / matcher / useCustomRegex state */
  const applyMatcher = (m: string) => {
    if (!m) return;
    setMatcher(m);
    if (!hasToolChips) {
      setSelectedTools(new Set());
      setUseCustomRegex(true);
      return;
    }
    const parts = m.split("|");
    const chipValues = new Set(profile.toolChips.map((c) => c.value));
    if (parts.every((p: string) => chipValues.has(p))) {
      setSelectedTools(new Set(parts));
      setUseCustomRegex(false);
    } else {
      setSelectedTools(new Set());
      setUseCustomRegex(true);
    }
  };

  const applyTemplate = (tpl: MarketplaceItem) => {
    if (!tpl.hookConfig) return;
    const { event: tplEvent, matcher: tplMatcher, hook: tplHook } = tpl.hookConfig;
    if (tplEvent) {
      setSelectedEvent(tplEvent);
      setSelectedEvents(new Set([tplEvent]));
    }
    if (tplMatcher) applyMatcher(tplMatcher);
    if (
      tplHook.type &&
      profile.supportedTypes.includes(tplHook.type as HookConfig["type"])
    ) {
      setType(tplHook.type as HookConfig["type"]);
    }
    if (tplHook.command) setCommand(tplHook.command);
    if (tplHook.prompt) setPrompt(tplHook.prompt);
    if (tplHook.timeout) {
      setTimeout_(
        normalizeTimeout(
          tplHook.timeout,
          tplHook.type || fallbackType,
          profile.defaultTimeouts,
        ),
      );
    }
  };

  const handleAiGenerate = async () => {
    if (!profile.supportsAiAssist) return;
    const text = aiDescription.trim();
    if (!text) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch("/api/hooks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: text,
          targetProvider: profile.provider,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Generation failed");
      }
      const payload = await res.json();
      const data =
        payload && typeof payload === "object" && payload.primary
          ? payload.primary
          : payload;
      if (data.event) {
        setSelectedEvent(data.event);
        if (!isEditing) {
          setSelectedEvents(new Set([data.event]));
        }
      }
      // Matcher comes from top level (not inside hook object)
      const matcherValue = data.matcher || data.hook?.matcher;
      if (matcherValue) {
        const m =
          typeof matcherValue === "string"
            ? matcherValue
            : JSON.stringify(matcherValue);
        applyMatcher(m);
      }
      if (data.hook) {
        const newType = data.hook.type || "command";
        if (profile.supportedTypes.includes(newType)) {
          setType(newType);
        }
        if (data.hook.command) setCommand(data.hook.command);
        if (data.hook.prompt) setPrompt(data.hook.prompt);
        if (data.hook.timeout) {
          setTimeout_(
            normalizeTimeout(
              data.hook.timeout,
              newType,
              profile.defaultTimeouts,
            ),
          );
        }
      }

      // Auto-suggest matcher if AI didn't provide one for a tool event
      const resolvedEvent = data.event || primaryEvent;
      if (
        profile.supportsAiAssist &&
        resolvedEvent &&
        !matcherValue &&
        profile.toolEvents.has(resolvedEvent)
      ) {
        const hookData = data.hook || {};
        try {
          const suggestRes = await fetch("/api/hooks/suggest-matcher", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: resolvedEvent,
              type: hookData.type || type,
              command: hookData.command || (type === "command" ? command : undefined),
              prompt: hookData.prompt || (type !== "command" ? prompt : undefined),
            }),
          });
          if (suggestRes.ok) {
            const suggestData = await suggestRes.json();
            if (suggestData.matcher) {
              applyMatcher(suggestData.matcher);
            }
          }
        } catch {
          // Best-effort — don't block the main flow
        }
      }

      // Capture AI reasoning and validation warnings for display (never saved to settings)
      const reasoning = data.reasoning || null;
      const warnings = data.warnings as string[] | undefined;
      if (reasoning || (warnings && warnings.length > 0)) {
        setAiReasoning({
          ...reasoning,
          warnings: warnings?.length ? warnings : undefined,
        });
        setReasoningExpanded(true);
      } else {
        setAiReasoning(null);
      }

      setAiDescription("");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    }
    setAiGenerating(false);
  };

  // ── Cost warning logic ──────────────────────────────────────
  const costWarnings = useMemo(() => {
    const warnings: string[] = [];
    const hasHighFreq = activeEvents.some((e) =>
      profile.highFrequencyEvents.has(e),
    );
    const hasToolEvent = activeEvents.some((e) => profile.toolEvents.has(e));
    const hasStop = activeEvents.includes("Stop") || activeEvents.includes("SessionEnd");
    const hasMatcher = matcherValue.length > 0;

    if (type === "agent" && hasHighFreq) {
      const eventLabel =
        activeEvents.find((e) => profile.highFrequencyEvents.has(e)) || "";
      const freq =
        profile.eventFrequency[eventLabel]?.label.replace("Fires ", "") ||
        "every tool call";
      warnings.push(
        `Agent hooks are slow (~30-60s). On ${eventLabel}, this runs ${freq}.`,
      );
    } else if (type === "prompt" && hasHighFreq) {
      const eventLabel =
        activeEvents.find((e) => profile.highFrequencyEvents.has(e)) || "";
      const freq =
        profile.eventFrequency[eventLabel]?.label.replace("Fires ", "") ||
        "every tool call";
      warnings.push(
        `Prompt hooks add ~15-30s. On ${eventLabel}, this runs ${freq}.`,
      );
    }

    if (type === "agent" && hasStop && !hasHighFreq) {
      warnings.push(
        "Agent + Stop can delay session end by ~30-60s.",
      );
    }

    if ((type === "prompt" || type === "agent") && hasToolEvent && !hasMatcher) {
      warnings.push(
        "No matcher means it runs on every tool call.",
      );
    }

    return warnings;
  }, [activeEvents, matcherValue, profile, type]);

  const defaultTimeout = profile.defaultTimeouts[type];
  const timeoutForPreview = toStoredTimeout(timeout);
  const defaultTimeoutForPreview = toStoredTimeout(defaultTimeout);
  const previewJson = JSON.stringify(
    {
      type,
      ...(type === "command" ? { command } : { prompt }),
      ...(matcherValue ? { matcher: matcherValue } : {}),
      ...(timeoutForPreview !== defaultTimeoutForPreview
        ? { timeout: timeoutForPreview }
        : {}),
      ...(profile.supportsAsyncCommand && isAsync ? { async: true } : {}),
    },
    null,
    2,
  );

  const title = isEditing ? "Edit Hook" : "New Hook";

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0"
        showCloseButton={false}
      >
        <DialogHeader className="px-4 py-3 border-b border-border">
          <DialogTitle className="text-sm font-medium flex items-center gap-2">
            <span className="text-yellow-500">&#9889;</span>
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* ── Context Banner (edit mode only) ───────────────── */}
          {isEditing && hook && event && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 border border-border/50">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                {describeEditingHook(
                  event,
                  hook,
                  initialMatcher,
                  profile.eventDescriptions,
                )}
              </span>
            </div>
          )}

          {(profile.supportsAiAssist || profile.supportsTemplates) && (
          <div className="border border-border/50 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border/30 bg-muted/20">
              <div className="flex items-center gap-2">
                <Sparkles size={12} className="text-primary" />
                <span className="text-xs font-medium">Assist (optional)</span>
              </div>
              {!isEditing && profile.supportsAiAssist && profile.supportsTemplates && (
                <div className="inline-flex rounded-md border border-border/60 bg-muted/30 p-1">
                  <button
                    type="button"
                    onClick={() => setAssistMode("templates")}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                      assistMode === "templates"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Templates
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssistMode("ai")}
                    className={cn(
                      "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                      assistMode === "ai"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    AI Assist
                  </button>
                </div>
              )}
            </div>
            <div className="px-3 py-3">
              {!isEditing && assistMode === "templates" && profile.supportsTemplates ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Templates
                    </label>
                    <span className="text-[10px] text-muted-foreground">Quick start</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {INLINE_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.name}
                        onClick={() => applyTemplate(tpl)}
                        className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all"
                      >
                        {tpl.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground">
                    Uses your configured generation runtime from Settings.
                  </p>
                  <div className="flex gap-2">
                    <textarea
                      value={aiDescription}
                      onChange={(e) => {
                        setAiDescription(e.target.value);
                        setAiError(null);
                      }}
                      placeholder='Describe the hook, e.g. "Run eslint after Edit/Write and block only on errors"'
                      rows={2}
                      className="flex-1 text-xs font-mono rounded-md border border-border bg-background px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                          e.preventDefault();
                          handleAiGenerate();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-auto px-3 shrink-0 self-end"
                      onClick={handleAiGenerate}
                      disabled={aiGenerating || !aiDescription.trim() || !profile.supportsAiAssist}
                    >
                      {aiGenerating ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ArrowRight size={12} />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* ── AI Reasoning (display-only, never saved) ─────── */}
          {aiReasoning && (
            <div className="border border-blue-500/20 rounded-lg overflow-hidden bg-blue-500/5">
              <button
                onClick={() => setReasoningExpanded((v) => !v)}
                className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-blue-500/10 transition-colors"
              >
                <ChevronRight
                  size={12}
                  className={cn(
                    "text-blue-500 transition-transform duration-150",
                    reasoningExpanded && "rotate-90",
                  )}
                />
                <Info size={12} className="text-blue-500" />
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  AI Reasoning
                </span>
              </button>
              {reasoningExpanded && (
                <div className="px-3 pb-3 pt-1 border-t border-blue-500/10 space-y-2">
                  {aiReasoning.eventChoice && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Event
                      </span>
                      <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                        {aiReasoning.eventChoice}
                      </p>
                    </div>
                  )}
                  {aiReasoning.matcherChoice && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Matcher
                      </span>
                      <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                        {aiReasoning.matcherChoice}
                      </p>
                    </div>
                  )}
                  {aiReasoning.failureModes && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Risks
                      </span>
                      <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                        {aiReasoning.failureModes}
                      </p>
                    </div>
                  )}
                  {aiReasoning.warnings && aiReasoning.warnings.length > 0 && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">
                        Warnings
                      </span>
                      <ul className="mt-0.5 space-y-0.5">
                        {aiReasoning.warnings.map((w, i) => (
                          <li key={i} className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                            <AlertCircle size={11} className="shrink-0 mt-0.5" />
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── WHEN ──────────────────────────────────────────── */}
          <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              When
            </label>
            {isEditing ? (
              <Select value={selectedEvent} onValueChange={handleEventChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profile.hookEvents.map((e) => (
                    <SelectItem key={e} value={e} className="text-xs font-mono">
                      {e}
                      {profile.eventRuntimeRequirements[e]?.support === "conditional"
                        ? " (conditional)"
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs justify-between min-w-[260px]"
                    >
                      {selectedEventsLabel}
                      <ChevronDown size={12} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-72 max-h-72 overflow-y-auto">
                    {profile.eventGroups.map((group, index) => (
                      <div key={group.label}>
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {group.label}
                        </DropdownMenuLabel>
                        {group.events.map((ev) => (
                          <DropdownMenuCheckboxItem
                            key={ev}
                            checked={selectedEvents.has(ev)}
                            onCheckedChange={() => toggleEvent(ev)}
                            onSelect={(event) => event.preventDefault()}
                            className="text-xs font-mono"
                          >
                            {ev}
                            {profile.eventRuntimeRequirements[ev]?.support ===
                            "conditional"
                              ? " (conditional)"
                              : ""}
                          </DropdownMenuCheckboxItem>
                        ))}
                        {index < profile.eventGroups.length - 1 && <DropdownMenuSeparator />}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-[11px] text-muted-foreground">
                  Select one or more events.
                </p>
              </>
            )}
            {selectedConditionalEvents.length > 0 && (
              <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/20">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    Conditional event selected: {selectedConditionalEvents[0]}
                    {selectedConditionalEvents.length > 1
                      ? ` (+${selectedConditionalEvents.length - 1})`
                      : ""}
                  </p>
                  <p className="mt-0.5">
                    {
                      profile.eventRuntimeRequirements[selectedConditionalEvents[0]]
                        ?.details
                    }
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ── WHAT ──────────────────────────────────────────── */}
          <div className="space-y-2 rounded-lg border border-border/50 p-3">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              What
            </label>
            <div className="max-w-xs">
              <Select
                value={type}
                onValueChange={(value) => handleTypeChange(value as HookConfig["type"])}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {profile.supportedTypes.map((hookType) => (
                    <SelectItem key={hookType} value={hookType} className="text-xs">
                      {hookType === "command"
                        ? "Command"
                        : hookType === "prompt"
                          ? "Prompt"
                          : "Agent"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type-specific help text */}
            <p className="text-[11px] text-muted-foreground leading-snug">
              {typeDescription}
            </p>

            {/* ── Impact Preview ──────────────────────────── */}
            {(() => {
              const ev = primaryEvent;
              const freq = profile.eventFrequency[ev];
              if (!freq || !ev) return null;

              const latencyMap: Record<string, string> = { command: "~1-10s", prompt: "~15-30s", agent: "~30-60s" };
              const firesPerSession: Record<string, string> = {
                high: "20-100+ times",
                medium: "2-10 times",
                low: "once",
              };
              const blocksProvider = !(
                type === "command" &&
                profile.supportsAsyncCommand &&
                isAsync
              );
              const estimatedSessionImpact =
                freq.level === "high" && type !== "command"
                  ? type === "prompt"
                    ? "5-50 min"
                    : "10-100+ min"
                  : null;
              const showDetails =
                costWarnings.length > 0 ||
                !!estimatedSessionImpact ||
                (!isEditing && activeEvents.length > 1);

              return (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-muted-foreground">
                    Impact: {firesPerSession[freq.level]} on{" "}
                    <span className="font-medium text-foreground">{ev}</span> ·{" "}
                    {latencyMap[type]} latency ·{" "}
                    {blocksProvider
                      ? `blocks ${profile.providerLabel}`
                      : "non-blocking"}.
                  </p>
                  {showDetails && (
                    <details className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground select-none">
                        Details
                      </summary>
                      <div className="mt-2 space-y-2">
                        {costWarnings.length > 0 && (
                          <ul className="space-y-1">
                            {costWarnings.map((w, i) => (
                              <li
                                key={i}
                                className="flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400"
                              >
                                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <div className="text-[10px] text-muted-foreground">Fires</div>
                            <div className="font-medium">{firesPerSession[freq.level]}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">Latency</div>
                            <div className="font-medium">{latencyMap[type]}</div>
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">
                              Blocks {profile.providerLabel}
                            </div>
                            <div className="font-medium">
                              {blocksProvider ? "Yes" : "No"}
                            </div>
                          </div>
                        </div>
                        {estimatedSessionImpact && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            Estimated added wait this session: {estimatedSessionImpact}.
                          </p>
                        )}
                        {!isEditing && activeEvents.length > 1 && (
                          <p className="text-[11px] text-muted-foreground">
                            Using first selected event ({ev}) for this preview.
                          </p>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              );
            })()}

            {/* Type-specific fields */}
            {type === "command" ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">
                    Command{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder={profile.typePlaceholders.command}
                    className={cn(
                      "w-full h-8 text-xs font-mono rounded border bg-background px-2",
                      !command && "border-destructive/30",
                    )}
                  />
                </div>
                {isWindowsClient && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    Hook commands use the shell on the machine running{" "}
                    {profile.providerLabel} CLI. Use PowerShell or Git Bash
                    syntax if that machine is Windows.
                  </p>
                )}
                {profile.supportsAsyncCommand && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAsync}
                      onChange={(e) => setIsAsync(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-xs text-muted-foreground">
                      Run asynchronously (don&apos;t block {profile.providerLabel})
                    </span>
                  </label>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Prompt format info banner */}
                <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/20">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p>Response format is auto-added on save.</p>
                    <details>
                      <summary className="cursor-pointer select-none text-[11px]">
                        Expected response format
                      </summary>
                      <p className="mt-1">
                        Return{" "}
                        <code className="text-[10px] bg-amber-500/10 px-1 rounded">
                          {`{"ok": true}`}
                        </code>{" "}
                        or{" "}
                        <code className="text-[10px] bg-amber-500/10 px-1 rounded">
                          {`{"ok": false, "reason": "..."}`}
                        </code>
                        for {type} hooks.
                      </p>
                    </details>
                  </div>
                </div>

                {isEditing || showPromptSources || promptSource !== "custom" ? (
                  <>
                    {/* Source picker */}
                    <div className="flex items-center gap-1">
                      <span className="text-micro text-muted-foreground mr-1">
                        Source:
                      </span>
                      {(
                        [
                          { key: "custom", label: "Custom" },
                          { key: "agent", label: "From Agent" },
                          { key: "skill", label: "From Skill" },
                        ] as const
                      ).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => handleSelectSource(key)}
                          className={cn(
                            "px-2 py-0.5 rounded text-micro font-medium transition-colors",
                            promptSource === key
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Entity selector when source is agent or skill */}
                    {promptSource === "agent" && agents.length > 0 && (
                      <Select
                        onValueChange={(name) => handleSelectSource("agent", name)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select an agent..." />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((a) => (
                            <SelectItem
                              key={a.name}
                              value={a.name}
                              className="text-xs"
                            >
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {promptSource === "skill" && allSkills.length > 0 && (
                      <Select
                        onValueChange={(name) => handleSelectSource("skill", name)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select a skill..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allSkills.map((s) => (
                            <SelectItem
                              key={s.name}
                              value={s.name}
                              className="text-xs"
                            >
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPromptSources(true)}
                    className="self-start text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Use existing agent or skill instructions
                  </button>
                )}

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-foreground">
                    {type === "agent" ? "Agent Instructions" : "Prompt"}{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={profile.typePlaceholders[type]}
                    rows={8}
                    className={cn(
                      "w-full text-xs font-mono rounded border bg-background px-2 py-1.5 resize-y",
                      !prompt && "border-destructive/30",
                    )}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── WHICH (matcher / condition) ───────────────────── */}
          {hasMatcherEvent && (
            <div className="space-y-1.5 rounded-lg border border-border/50 p-3">
              <div className="flex items-center">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {hasToolEvent
                    ? "Which tools (optional)"
                    : "Matcher / Condition (optional)"}
                </label>
              </div>
              {hasToolChips ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs justify-between min-w-[260px]"
                          disabled={useCustomRegex}
                        >
                          {selectedToolsLabel}
                          <ChevronDown size={12} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-64 max-h-72 overflow-y-auto">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Tool matcher
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {profile.toolChips.map((chip) => (
                          <DropdownMenuCheckboxItem
                            key={chip.value}
                            checked={selectedTools.has(chip.value)}
                            onCheckedChange={() => handleToggleTool(chip.value)}
                            onSelect={(event) => event.preventDefault()}
                            className="text-xs"
                          >
                            {chip.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {selectedTools.size > 0 && !useCustomRegex && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => {
                          setSelectedTools(new Set());
                          setMatcher("");
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Leave empty to run for all tools on this event.
                  </p>
                  {isEditing || useCustomRegex ? (
                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                      <input
                        type="checkbox"
                        checked={useCustomRegex}
                        onChange={(e) => {
                          setUseCustomRegex(e.target.checked);
                          if (e.target.checked) {
                            setSelectedTools(new Set());
                          } else {
                            setMatcher("");
                          }
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-xs text-muted-foreground">
                        Custom regex
                      </span>
                      {useCustomRegex && (
                        <input
                          value={matcher}
                          onChange={(e) => setMatcher(e.target.value)}
                          placeholder="e.g. Edit|Write|mcp__.*"
                          className="flex-1 h-6 text-xs font-mono rounded border border-border bg-background px-2"
                        />
                      )}
                    </label>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setUseCustomRegex(true);
                        setSelectedTools(new Set());
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Use custom regex matcher
                    </button>
                  )}
                </>
              ) : (
                <>
                  <input
                    value={matcher}
                    onChange={(e) => setMatcher(e.target.value)}
                    placeholder="e.g. run_shell_command"
                    className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional matcher to target specific prompts/tools/agents for this event.
                  </p>
                </>
              )}
              {/* Warning when no matcher selected */}
              {!matcherValue && (type === "prompt" || type === "agent") && (
                <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/20">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>No tools selected — this hook fires on <strong>every</strong> tool call (Bash, Read, Grep...), adding significant latency.</span>
                </div>
              )}
            </div>
          )}

          {/* ── Advanced (collapsible) ────────────────────────── */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                size={12}
                className={cn(
                  "transition-transform",
                  !showAdvanced && "-rotate-90",
                )}
              />
              Advanced
            </button>
            {showAdvanced && (
              <div className="mt-2 space-y-3 pl-3 border-l-2 border-border">
                {/* Timeout */}
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Timeout{" "}
                    <span className="font-normal text-muted-foreground">
                      {profile.timeoutStorageUnit === "milliseconds"
                        ? "(seconds, stored as ms)"
                        : "(seconds)"}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={timeout}
                      onChange={(e) =>
                        setTimeout_(Math.max(1, Number(e.target.value) || 1))
                      }
                      className="w-24 h-8 text-xs font-mono rounded border border-border bg-background px-2"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      default: {formatTimeout(profile.defaultTimeouts[type])}
                    </span>
                  </div>
                </div>

                {/* JSON Preview */}
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    JSON Preview
                  </label>
                  <pre className="text-meta font-mono bg-muted/50 rounded p-2 overflow-x-auto">
                    {previewJson}
                  </pre>
                </div>

                {/* Test Command */}
                {type === "command" && command && (
                  <div className="space-y-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={testHook}
                      disabled={testing}
                    >
                      <Play size={12} className="mr-1" />{" "}
                      {testing ? "Running..." : "Test Command"}
                    </Button>
                    {testOutput && (
                      <pre className="text-meta font-mono bg-muted/50 rounded p-2 max-h-24 overflow-y-auto">
                        {testOutput}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {aiError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive whitespace-pre-line">
              {aiError}
            </div>
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t border-border">
          {/* Validation hint */}
          {!hasRequiredInput && (
            <p className="text-[11px] text-destructive mr-auto self-center">
              {type === "command"
                ? "Command is required"
                : `${type === "agent" ? "Agent instructions" : "Prompt"} is required`}
            </p>
          )}
          <Button variant="outline" size="sm" className="h-8" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={handleSave}
            disabled={!hasRequiredInput}
          >
            {isEditing
              ? "Update Hook"
              : activeEvents.length > 1
                ? `Add Hook to ${activeEvents.length} events`
                : "Create Hook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
