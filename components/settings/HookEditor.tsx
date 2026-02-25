"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ProviderTargetModeSelector } from "@/components/providers/ProviderTargetModeSelector";
import { ArtifactConvertDialog } from "@/components/providers/ArtifactConvertDialog";
import { INLINE_TEMPLATES } from "@/lib/marketplace/builtin-hooks";
import { validateHookConfig } from "@/lib/hooks/validate";
import {
  HOOK_EVENTS,
  EVENT_GROUPS,
  TOOL_CHIPS,
  TOOL_EVENTS,
  EVENT_FREQUENCY,
  EVENT_DESCRIPTIONS,
  HIGH_FREQ_EVENTS,
  DEFAULT_TIMEOUTS,
  TYPE_DESCRIPTIONS,
  TYPE_PLACEHOLDERS,
} from "@/lib/hooks/hook-editor-constants";
import {
  normalizeTimeout,
  formatTimeout,
  appendPromptFormatHint,
  stripPromptFormatHint,
  describeEditingHook,
} from "@/lib/hooks/hook-editor-utils";
import type { MarketplaceItem } from "@/types/marketplace";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import type { AIProvider } from "@/types/instructions";

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

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;
type GenerationProvider =
  | "default"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local"
  | "custom";
type HookEditorMode = "guided" | "advanced";

const GUIDED_TYPE_DESCRIPTIONS: Record<HookConfig["type"], string> = {
  command: "Run a shell command when this event happens.",
  prompt: "Ask an LLM to evaluate context and return ok/not-ok.",
  agent: "Run a tool-enabled agent for deeper verification checks.",
};

// Re-export constants and utils for consumers that import from HookEditor
export { EVENT_GROUPS, EVENT_FREQUENCY } from "@/lib/hooks/hook-editor-constants";
export type { EventFrequency } from "@/lib/hooks/hook-editor-constants";
export { formatTimeout } from "@/lib/hooks/hook-editor-utils";

interface HookEditorProps {
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
  event = "",
  hook,
  initialMatcher,
  initialAIMode,
  onSave,
  onCancel,
}: HookEditorProps) {
  const isEditing = !!hook;

  // Editing existing hook: single event. New hooks can be guided (single)
  // or advanced (multi-event).
  const [selectedEvent, setSelectedEvent] = useState(event || "PostToolUse");
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(
    new Set([event || "PostToolUse"]),
  );
  const [uiMode, setUiMode] = useState<HookEditorMode>(
    isEditing ? "advanced" : "guided",
  );
  const [type, setType] = useState<HookConfig["type"]>(hook?.type || "command");
  const [command, setCommand] = useState(hook?.command || "");
  const [prompt, setPrompt] = useState(() =>
    stripPromptFormatHint(hook?.prompt || ""),
  );
  const [matcher, setMatcher] = useState(initialMatcher ?? "");
  const [timeout, setTimeout_] = useState(() =>
    normalizeTimeout(hook?.timeout, hook?.type || "command"),
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
    if (!initialMatcher) return new Set();
    // Parse matcher back into tool chips if possible
    const parts = initialMatcher.split("|");
    const chipValues = new Set(TOOL_CHIPS.map((c) => c.value));
    if (parts.every((p) => chipValues.has(p))) return new Set(parts);
    return new Set();
  });
  const [useCustomRegex, setUseCustomRegex] = useState(() => {
    if (!initialMatcher) return false;
    const parts = initialMatcher.split("|");
    const chipValues = new Set(TOOL_CHIPS.map((c) => c.value));
    return !parts.every((p) => chipValues.has(p));
  });

  // Source picker state (for prompt/agent types)
  const [promptSource, setPromptSource] = useState<
    "custom" | "agent" | "skill"
  >("custom");
  const { data: agents = [] } = useAgents();
  const { data: allSkills = [] } = useSkills();

  // Matcher suggestion state
  const [suggestingMatcher, setSuggestingMatcher] = useState(false);

  // AI generation state
  const [assistOpen, setAssistOpen] = useState(initialAIMode ?? false);
  const [aiDescription, setAiDescription] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTargetProvider, setAiTargetProvider] =
    useState<ProviderTargetMode>("claude");
  const [aiProvider, setAiProvider] = useState<GenerationProvider>("default");
  const [aiProviderOptions, setAiProviderOptions] = useState<
    { key: GenerationProvider; label: string }[]
  >([
    { key: "default", label: "Default" },
    { key: "anthropic", label: "Anthropic" },
  ]);
  const [convertOpen, setConvertOpen] = useState(false);
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
    return uiMode === "advanced" ? Array.from(selectedEvents) : [selectedEvent];
  }, [isEditing, selectedEvent, selectedEvents, uiMode]);
  const primaryEvent = activeEvents[0];
  const hasRequiredInput =
    type === "command" ? command.trim().length > 0 : prompt.trim().length > 0;
  const isGuidedCreate = !isEditing && uiMode === "guided";

  useEffect(() => {
    fetch("/api/instructions/providers")
      .then((r) => r.json())
      .then((rows: ProviderListItem[] | unknown) => {
        const list = Array.isArray(rows) ? (rows as ProviderListItem[]) : [];
        const next: { key: GenerationProvider; label: string }[] = [
          { key: "default", label: "Default" },
          { key: "anthropic", label: "Anthropic" },
        ];
        const seen = new Set<GenerationProvider>(["default", "anthropic"]);
        for (const row of list) {
          if (!row?.isActive) continue;
          const key = (row.providerSlug || row.provider) as GenerationProvider;
          if (
            key !== "anthropic" &&
            key !== "openai" &&
            key !== "google" &&
            key !== "openrouter" &&
            key !== "local" &&
            key !== "custom"
          ) {
            continue;
          }
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ key, label: row.displayName || key });
        }
        setAiProviderOptions(next);
      })
      .catch((err) => console.warn("[HOOKS]", err.message));
  }, []);

  const handleTypeChange = (newType: HookConfig["type"]) => {
    setType(newType);
    if (newType === "command") {
      setPromptSource("custom");
      setShowPromptSources(false);
    }
    // Reset timeout to the new type's default (unless editing an existing hook)
    if (!isEditing) {
      setTimeout_(DEFAULT_TIMEOUTS[newType]);
    }
  };

  const handleModeChange = (nextMode: HookEditorMode) => {
    if (isEditing || nextMode === uiMode) return;
    setUiMode(nextMode);
    if (nextMode === "guided") {
      const fallbackEvent =
        selectedEvents.has(selectedEvent)
          ? selectedEvent
          : Array.from(selectedEvents)[0] || "PostToolUse";
      setSelectedEvent(fallbackEvent);
      setSelectedEvents(new Set([fallbackEvent]));
      setShowAdvanced(false);
    }
  };

  const handleEventChange = (nextEvent: string) => {
    setSelectedEvent(nextEvent);
    if (!isEditing && uiMode === "guided") {
      setSelectedEvents(new Set([nextEvent]));
    }
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
    if (useCustomRegex) return matcher;
    if (selectedTools.size === 0) return matcher;
    return Array.from(selectedTools).join("|");
  }, [useCustomRegex, matcher, selectedTools]);
  const matcherValue = buildMatcher();
  const hasToolEvent = activeEvents.some((e) => TOOL_EVENTS.has(e));
  const typeDescription = isGuidedCreate
    ? GUIDED_TYPE_DESCRIPTIONS[type]
    : TYPE_DESCRIPTIONS[type];

  const handleSave = () => {
    setAiError(null);
    // Belt-and-suspenders: block save if required field is empty
    if (type === "command" && !command.trim()) return;
    if ((type === "prompt" || type === "agent") && !prompt.trim()) return;
    // Only include fields that Claude Code's hook schema accepts.
    // Extra fields (statusMessage, model, etc.) cause "JSON validation failed".
    const config: HookConfig = { type };
    if (type === "command") {
      config.command = command;
      if (isAsync) config.async = true;
    } else {
      // For prompt/agent hooks, auto-append response format instructions
      // so the evaluating LLM returns valid JSON that Claude Code can parse.
      config.prompt = appendPromptFormatHint(prompt, type);
    }
    // Only include timeout if it differs from the type's default
    if (timeout !== DEFAULT_TIMEOUTS[type]) config.timeout = timeout;
    // Editing: single event. Creating: guided=single, advanced=multi.
    const events = activeEvents.filter(Boolean);
    const finalMatcher = buildMatcher();
    const hookInput = { type, command, prompt, matcher: finalMatcher, timeout };

    // Client-side validation before saving
    const validationRows = events.map((ev) => ({
      event: ev,
      result: validateHookConfig(ev, hookInput),
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
    const parts = m.split("|");
    const chipValues = new Set(TOOL_CHIPS.map((c) => c.value));
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
    if (tplHook.type) setType(tplHook.type as HookConfig["type"]);
    if (tplHook.command) setCommand(tplHook.command);
    if (tplHook.prompt) setPrompt(tplHook.prompt);
    if (tplHook.timeout) setTimeout_(tplHook.timeout);
  };

  const handleSuggestMatcher = async () => {
    const activeEvent = primaryEvent;
    if (!activeEvent || !TOOL_EVENTS.has(activeEvent)) return;
    setSuggestingMatcher(true);
    try {
      const res = await fetch("/api/hooks/suggest-matcher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: activeEvent,
          type,
          command: type === "command" ? command : undefined,
          prompt: type !== "command" ? prompt : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.matcher) {
          applyMatcher(data.matcher);
          // Open advanced section so the user can see the result
          if (isEditing || uiMode === "advanced") {
            setShowAdvanced(true);
          }
        }
      }
    } catch {
      // Silently fail — suggestion is best-effort
    }
    setSuggestingMatcher(false);
  };

  const handleAiGenerate = async () => {
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
          ...(aiProvider !== "default" ? { provider: aiProvider } : {}),
          targetProvider: aiTargetProvider,
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
          if (uiMode === "advanced") {
            setSelectedEvents((prev) => new Set(prev).add(data.event));
          } else {
            setSelectedEvents(new Set([data.event]));
          }
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
        setType(newType);
        if (data.hook.command) setCommand(data.hook.command);
        if (data.hook.prompt) setPrompt(data.hook.prompt);
        if (data.hook.timeout) {
          setTimeout_(normalizeTimeout(data.hook.timeout, newType));
        }
      }

      // Auto-suggest matcher if AI didn't provide one for a tool event
      const resolvedEvent = data.event || primaryEvent;
      if (resolvedEvent && !matcherValue && TOOL_EVENTS.has(resolvedEvent)) {
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

      setAssistOpen(false);
      setAiDescription("");
      if (payload?.results && aiTargetProvider !== "claude") {
        toast.success("Hook conversion previews are ready");
        setConvertOpen(true);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Generation failed");
    }
    setAiGenerating(false);
  };

  // ── Cost warning logic ──────────────────────────────────────
  const costWarnings = useMemo(() => {
    const warnings: string[] = [];
    const hasHighFreq = activeEvents.some((e) => HIGH_FREQ_EVENTS.has(e));
    const hasToolEvent = activeEvents.some((e) => TOOL_EVENTS.has(e));
    const hasStop = activeEvents.includes("Stop");
    const hasMatcher = matcherValue.length > 0;

    if (type === "agent" && hasHighFreq) {
      const eventLabel = activeEvents.find((e) => HIGH_FREQ_EVENTS.has(e)) || "";
      const freq = EVENT_FREQUENCY[eventLabel]?.label.replace("Fires ", "") || "every tool call";
      warnings.push(
        `Agent hooks are slow (~30-60s). On ${eventLabel}, this fires ${freq} — your session will feel frozen.`,
      );
    } else if (type === "prompt" && hasHighFreq) {
      const eventLabel = activeEvents.find((e) => HIGH_FREQ_EVENTS.has(e)) || "";
      const freq = EVENT_FREQUENCY[eventLabel]?.label.replace("Fires ", "") || "every tool call";
      warnings.push(
        `Prompt hooks add ~15-30s latency. On ${eventLabel}, this runs ${freq}.`,
      );
    }

    if (type === "agent" && hasStop && !hasHighFreq) {
      warnings.push(
        "Agent hooks on Stop block session end for 30-60s. Consider a fast command instead.",
      );
    }

    if ((type === "prompt" || type === "agent") && hasToolEvent && !hasMatcher) {
      warnings.push(
        "Without a matcher, this fires on every tool call (Bash, Read, Edit, Grep...).",
      );
    }

    return warnings;
  }, [type, activeEvents, matcherValue]);

  const defaultTimeout = DEFAULT_TIMEOUTS[type];
  const previewJson = JSON.stringify(
    {
      type,
      ...(type === "command" ? { command } : { prompt }),
      ...(matcherValue ? { matcher: matcherValue } : {}),
      ...(timeout !== defaultTimeout ? { timeout } : {}),
      ...(isAsync ? { async: true } : {}),
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
              <span>{describeEditingHook(event, hook, initialMatcher)}</span>
            </div>
          )}

          {!isEditing && (
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Builder mode
              </label>
              <div className="inline-flex rounded-md border border-border/60 bg-muted/30 p-1">
                <button
                  type="button"
                  onClick={() => handleModeChange("guided")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    uiMode === "guided"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Guided
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange("advanced")}
                  className={cn(
                    "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                    uiMode === "advanced"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Advanced
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Guided is optimized for first-time setup. Advanced adds
                multi-event setup and low-level controls.
              </p>
            </div>
          )}

          <div className="border border-border/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setAssistOpen((v) => !v)}
              className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-muted/30 transition-colors"
            >
              <ChevronRight
                size={12}
                className={cn(
                  "text-muted-foreground transition-transform duration-150",
                  assistOpen && "rotate-90",
                )}
              />
              <Sparkles size={12} className="text-primary" />
              <span className="text-xs font-medium">Start faster (optional)</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                AI
              </span>
            </button>
            {assistOpen && (
              <div className="px-3 pb-3 pt-2 border-t border-border/30 space-y-3">
                {!isEditing && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      Templates
                    </label>
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
                )}

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={aiProvider}
                      onChange={(e) =>
                        setAiProvider(e.target.value as GenerationProvider)
                      }
                      disabled={aiGenerating}
                      className="h-6 rounded-md border border-border/50 bg-background px-2 text-[11px]"
                      aria-label="Hook generation provider"
                    >
                      {aiProviderOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Output
                    </span>
                    <ProviderTargetModeSelector
                      value={aiTargetProvider}
                      onChange={setAiTargetProvider}
                      disabled={aiGenerating}
                      className="h-6 min-w-[128px] text-[11px]"
                      ariaLabel="Hook generation target provider"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => setConvertOpen(true)}
                      disabled={!(primaryEvent && hasRequiredInput)}
                    >
                      Convert current
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <textarea
                      value={aiDescription}
                      onChange={(e) => {
                        setAiDescription(e.target.value);
                        setAiError(null);
                      }}
                      placeholder='Describe the hook, e.g. "Lint files after edit"'
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
                      disabled={aiGenerating || !aiDescription.trim()}
                    >
                      {aiGenerating ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <ArrowRight size={12} />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── AI Reasoning (display-only, never saved) ─────── */}
          {(isEditing || uiMode === "advanced") && aiReasoning && (
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
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              When
            </label>
            {isEditing ? (
              <Select value={selectedEvent} onValueChange={handleEventChange}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOOK_EVENTS.map((e) => (
                    <SelectItem key={e} value={e} className="text-xs font-mono">
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : uiMode === "guided" ? (
              <div className="space-y-1.5">
                <Select value={selectedEvent} onValueChange={handleEventChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOOK_EVENTS.map((e) => (
                      <SelectItem key={e} value={e} className="text-xs font-mono">
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Pick one event. Switch to Advanced if you want to attach this
                  hook to multiple events at once.
                </p>
                {EVENT_DESCRIPTIONS[selectedEvent] && (
                  <p className="text-[11px] text-muted-foreground">
                    {EVENT_DESCRIPTIONS[selectedEvent]}
                  </p>
                )}
              </div>
            ) : (
              <>
                {selectedEvents.size > 1 && (
                  <span className="text-xs text-muted-foreground">
                    ({selectedEvents.size} selected)
                  </span>
                )}
                <div className="space-y-2">
                  {EVENT_GROUPS.map((group) => (
                    <div key={group.label} className="space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                        {group.label}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {group.events.map((ev) => {
                          const active = selectedEvents.has(ev);
                          return (
                            <button
                              key={ev}
                              type="button"
                              onClick={() => toggleEvent(ev)}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                                active
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
                              )}
                            >
                              {ev}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── WHAT ──────────────────────────────────────────── */}
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              What
            </label>
            <div className="flex gap-2">
              {(["command", "prompt", "agent"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTypeChange(t)}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs font-medium transition-colors",
                    type === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {/* Type-specific help text */}
            <p className="text-[11px] text-muted-foreground leading-snug">
              {typeDescription}
            </p>

            {/* Cost warning banner */}
            {costWarnings.length > 0 && (
              <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/20">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  {costWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* ── Impact Preview ──────────────────────────── */}
            {(() => {
              const ev = primaryEvent;
              const freq = EVENT_FREQUENCY[ev];
              if (!freq || !ev) return null;

              const latencyMap: Record<string, string> = { command: "~1-10s", prompt: "~15-30s", agent: "~30-60s" };
              const firesPerSession: Record<string, string> = {
                high: "20-100+ times",
                medium: "2-10 times",
                low: "once",
              };

              if (isGuidedCreate) {
                return (
                  <p className="text-[11px] text-muted-foreground">
                    Runs {firesPerSession[freq.level]} on <span className="font-medium text-foreground">{ev}</span> with about {latencyMap[type]} added latency per run.
                  </p>
                );
              }

              return (
                <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 space-y-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Impact preview
                  </span>
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
                      <div className="text-[10px] text-muted-foreground">Blocks Claude</div>
                      <div className="font-medium">{type === "command" && isAsync ? "No" : "Yes"}</div>
                    </div>
                  </div>
                  {freq.level === "high" && type !== "command" && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Estimated session impact: {type === "prompt" ? "5-50 min" : "10-100+ min"} of added wait time
                    </p>
                  )}
                  {!isEditing && uiMode === "advanced" && activeEvents.length > 1 && (
                    <p className="text-[11px] text-muted-foreground">
                      Showing preview for the first selected event ({ev}).
                    </p>
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
                    placeholder={TYPE_PLACEHOLDERS.command}
                    className={cn(
                      "w-full h-8 text-xs font-mono rounded border bg-background px-2",
                      !command && "border-destructive/30",
                    )}
                  />
                </div>
                {isWindowsClient && (
                  <p className="text-[11px] text-amber-500 mt-1">
                    Hook commands use the shell on the machine running Claude
                    Code. Use PowerShell or Git Bash syntax if that machine is
                    Windows.
                  </p>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAsync}
                    onChange={(e) => setIsAsync(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-xs text-muted-foreground">
                    Run asynchronously (don&apos;t block Claude)
                  </span>
                </label>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Prompt format info banner */}
                <div className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/5 rounded-md px-3 py-2 border border-amber-500/20">
                  <AlertCircle size={13} className="shrink-0 mt-0.5" />
                  <span>
                    {type === "prompt" ? "Prompt" : "Agent"} hooks must return{" "}
                    <code className="text-[10px] bg-amber-500/10 px-1 rounded">
                      {`{"ok": true}`}
                    </code>{" "}
                    or{" "}
                    <code className="text-[10px] bg-amber-500/10 px-1 rounded">
                      {`{"ok": false, "reason": "..."}`}
                    </code>
                    . This format is auto-appended on save.
                  </span>
                </div>

                {!isGuidedCreate || showPromptSources || promptSource !== "custom" ? (
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
                    placeholder={TYPE_PLACEHOLDERS[type]}
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

          {/* ── WHICH (tool matcher — primary for tool events) ── */}
          {hasToolEvent && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Which tools <span className="text-destructive">*</span>
                </label>
                <button
                  onClick={handleSuggestMatcher}
                  disabled={suggestingMatcher}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                  title="Suggest a matcher based on your hook"
                >
                  {suggestingMatcher ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <Sparkles size={10} />
                  )}
                  Suggest
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TOOL_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    onClick={() => handleToggleTool(chip.value)}
                    disabled={useCustomRegex}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                      selectedTools.has(chip.value)
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80",
                      useCustomRegex && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {isEditing || uiMode === "advanced" || useCustomRegex ? (
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
          {(isEditing || uiMode === "advanced") && (
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
                        (seconds)
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
                        default: {formatTimeout(DEFAULT_TIMEOUTS[type])}
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
          )}

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
              : isGuidedCreate
                ? "Create Hook"
              : uiMode === "advanced" && activeEvents.length > 1
                ? `Add Hook to ${activeEvents.length} events`
                : "Add Hook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ArtifactConvertDialog
      open={convertOpen}
      onOpenChange={setConvertOpen}
      artifactType="hook"
      sourceProvider="claude"
      title="Convert Hook"
      description="Preview and save provider-specific hook artifacts for Claude, Codex, and Gemini."
      getSource={() => {
        const activeEvent = primaryEvent;
        if (!activeEvent) return null;
        const cfg =
          type === "command"
            ? { type, command: command.trim(), timeout, ...(isAsync ? { async: true } : {}) }
            : { type, prompt: prompt.trim(), timeout };
        if (type === "command" && !command.trim()) return null;
        if ((type === "prompt" || type === "agent") && !prompt.trim()) return null;
        return {
          kind: "inline" as const,
          data: {
            event: activeEvent,
            matcher: matcherValue || undefined,
            hook: cfg,
          },
        };
      }}
      defaultTarget={aiTargetProvider}
      onSaved={() => toast.success("Hook conversion save request complete")}
    />
    </>
  );
}
