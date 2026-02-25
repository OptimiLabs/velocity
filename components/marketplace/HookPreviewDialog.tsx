"use client";

import { useState } from "react";
import {
  Zap,
  Download,
  Save,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  HookFlowDiagram,
  buildFlowSteps,
} from "@/components/settings/HookFlowDiagram";
import { estimateTokensFromUnknown } from "@/lib/marketplace/token-estimate";
import {
  HOOK_EVENTS as HOOK_EVENT_IDS,
  EVENT_RUNTIME_REQUIREMENTS,
} from "@/lib/hooks/hook-editor-constants";

export interface HookPreviewConfig {
  event: string;
  matcher?: string;
  hook: {
    type: "command" | "prompt" | "agent";
    command?: string;
    prompt?: string;
    timeout?: number;
    async?: boolean;
    statusMessage?: string;
  };
  explanation?: string;
  reasoning?: {
    eventChoice?: string;
    matcherChoice?: string;
    failureModes?: string;
  } | null;
}

interface HookPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Template name (for marketplace items) or "AI-Generated Hook" */
  name: string;
  description: string;
  category?: string;
  config: HookPreviewConfig;
  /** If true, fields are editable (AI-generated mode) */
  editable?: boolean;
  /** Whether this hook is already installed */
  installed?: boolean;
  onInstall: (config: HookPreviewConfig) => Promise<void>;
}

export function HookPreviewDialog({
  open,
  onOpenChange,
  name,
  description,
  category,
  config: initialConfig,
  editable = false,
  installed = false,
  onInstall,
}: HookPreviewDialogProps) {
  const [installing, setInstalling] = useState(false);
  const [jsonExpanded, setJsonExpanded] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  // Editable state (only used when editable=true)
  const [event, setEvent] = useState(initialConfig.event);
  const [hookType, setHookType] = useState(initialConfig.hook.type);
  const [command, setCommand] = useState(initialConfig.hook.command || "");
  const [prompt, setPrompt] = useState(initialConfig.hook.prompt || "");
  const [matcher, setMatcher] = useState(initialConfig.matcher || "");

  const currentConfig: HookPreviewConfig = editable
    ? {
        event,
        matcher: matcher || undefined,
        hook: {
          type: hookType,
          ...(hookType === "command"
            ? { command: command || "" }
            : { prompt: prompt || "" }),
          timeout: initialConfig.hook.timeout,
        },
        explanation: initialConfig.explanation,
      }
    : initialConfig;

  const flowSteps = buildFlowSteps({
    event: currentConfig.event,
    matcher: currentConfig.matcher,
    hook: currentConfig.hook,
  });
  const runtimeMeta = EVENT_RUNTIME_REQUIREMENTS[currentConfig.event];
  const estimatedTokens = estimateTokensFromUnknown(currentConfig);

  const jsonPreview = JSON.stringify(
    {
      [currentConfig.event]: [
        {
          ...(currentConfig.matcher ? { matcher: currentConfig.matcher } : {}),
          hooks: [currentConfig.hook],
        },
      ],
    },
    null,
    2,
  );

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await onInstall(currentConfig);
      onOpenChange(false);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap size={16} className="text-yellow-500 dark:text-yellow-400" />
            {name}
            {installed && (
              <span className="flex items-center gap-0.5 text-meta text-green-500 dark:text-green-400 font-normal">
                <Check size={10} />
                Installed
              </span>
            )}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <div className="flex items-center gap-1.5 pt-1">
            <Badge
              variant="outline"
              className="text-meta text-yellow-500 dark:text-yellow-400 border-yellow-500/30"
            >
              hook
            </Badge>
            {category && (
              <Badge
                variant="outline"
                className="text-meta text-muted-foreground"
              >
                {category}
              </Badge>
            )}
            <Badge variant="outline" className="text-meta">
              {currentConfig.hook.type}
            </Badge>
            <Badge variant="outline" className="text-meta font-mono">
              {currentConfig.event}
            </Badge>
            {runtimeMeta?.support === "conditional" && (
              <Badge
                variant="outline"
                className="text-meta border-amber-500/30 text-amber-600 dark:text-amber-400"
              >
                conditional
              </Badge>
            )}
            {estimatedTokens > 0 && (
              <Badge variant="outline" className="text-meta font-mono">
                ~{estimatedTokens.toLocaleString()} tok
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Explanation (from AI generation) */}
          {currentConfig.explanation && (
            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 rounded-md px-3 py-2">
              {currentConfig.explanation}
            </p>
          )}

          {/* AI Reasoning (display-only) */}
          {currentConfig.reasoning && (
            <div className="space-y-1">
              <button
                onClick={() => setReasoningExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                {reasoningExpanded ? (
                  <ChevronDown size={12} />
                ) : (
                  <ChevronRight size={12} />
                )}
                AI Reasoning
              </button>
              {reasoningExpanded && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-md px-3 py-2 space-y-2">
                  {currentConfig.reasoning.eventChoice && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Event
                      </span>
                      <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                        {currentConfig.reasoning.eventChoice}
                      </p>
                    </div>
                  )}
                  {currentConfig.reasoning.matcherChoice && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Matcher
                      </span>
                      <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                        {currentConfig.reasoning.matcherChoice}
                      </p>
                    </div>
                  )}
                  {currentConfig.reasoning.failureModes && (
                    <div>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        Risks
                      </span>
                      <p className="text-xs text-foreground/80 leading-snug mt-0.5">
                        {currentConfig.reasoning.failureModes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Flow Diagram */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Trigger Flow
            </h4>
            <div className="overflow-x-auto py-1">
              <HookFlowDiagram steps={flowSteps} />
            </div>
          </div>

          {/* Editable fields */}
          {editable && (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Configuration
              </h4>

              {/* Event */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Event</label>
                <Select value={event} onValueChange={setEvent}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOOK_EVENT_IDS.map((e) => (
                      <SelectItem
                        key={e}
                        value={e}
                        className="text-xs font-mono"
                      >
                        {e}
                        {EVENT_RUNTIME_REQUIREMENTS[e]?.support ===
                        "conditional"
                          ? " (conditional)"
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {EVENT_RUNTIME_REQUIREMENTS[event]?.support ===
                  "conditional" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {EVENT_RUNTIME_REQUIREMENTS[event].details}
                  </p>
                )}
              </div>

              {/* Hook Type */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <div className="flex gap-2">
                  {(["command", "prompt", "agent"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setHookType(t)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        hookType === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Command or Prompt */}
              {hookType === "command" ? (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Command</label>
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Prompt</label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={3}
                    className="w-full text-xs font-mono rounded border border-border bg-background px-2 py-1.5 resize-none"
                  />
                </div>
              )}

              {/* Matcher */}
              <div className="space-y-1">
                <label className="text-xs font-medium">
                  Matcher{" "}
                  <span className="text-muted-foreground font-normal">
                    (optional regex)
                  </span>
                </label>
                <input
                  value={matcher}
                  onChange={(e) => setMatcher(e.target.value)}
                  placeholder='e.g. "Bash", "Edit|Write"'
                  className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
                />
              </div>
            </div>
          )}

          {/* Hook Config Summary (read-only mode) */}
          {!editable && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Hook Config
              </h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16 shrink-0">
                    Event
                  </span>
                  <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                    {currentConfig.event}
                  </code>
                </div>
                {runtimeMeta?.support === "conditional" && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 pl-[4.5rem]">
                    {runtimeMeta.details}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16 shrink-0">
                    Type
                  </span>
                  <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                    {currentConfig.hook.type}
                  </code>
                </div>
                {currentConfig.matcher && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16 shrink-0">
                      Matcher
                    </span>
                    <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded">
                      {currentConfig.matcher}
                    </code>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground w-16 shrink-0 mt-0.5">
                    {currentConfig.hook.type === "command" ? "Cmd" : "Prompt"}
                  </span>
                  <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded break-all">
                    {currentConfig.hook.command || currentConfig.hook.prompt}
                  </code>
                </div>
              </div>
            </div>
          )}

          {/* JSON Preview (collapsible) */}
          <div className="space-y-1">
            <button
              onClick={() => setJsonExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {jsonExpanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              JSON Preview
            </button>
            {jsonExpanded && (
              <pre className="text-[11px] font-mono bg-muted/40 rounded-md p-2.5 overflow-x-auto">
                {jsonPreview}
              </pre>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {installed ? (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="h-8 text-green-500 dark:text-green-400"
            >
              <Check size={12} className="mr-1.5" />
              Installed
            </Button>
          ) : (
            <Button size="sm" className="h-8" onClick={handleInstall} disabled={installing}>
              {installing ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : editable ? (
                <Save size={12} className="mr-1.5" />
              ) : (
                <Download size={12} className="mr-1.5" />
              )}
              {editable ? "Save Hook" : "Install"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
