"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sparkles,
  Loader2,
  Wrench,
  Server,
  Plug,
  ChevronRight,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EffortPicker,
  type EffortLevel,
} from "@/components/console/EffortPicker";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agent";
import type { AIProvider } from "@/types/instructions";
import type { ConfigProvider } from "@/types/provider";
import {
  getAgentModelDisplay,
  getAgentModelOptionLabel,
  INHERIT_MODEL_HELP,
} from "@/lib/agents/model-display";
import {
  CLAUDE_AGENT_MODEL_OPTIONS,
  CLAUDE_CLI_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
  OPENAI_API_MODEL_OPTIONS,
} from "@/lib/models/provider-models";

interface AgentBuilderProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (agent: Partial<Agent>) => void;
  onCreateManual?: () => void;
  existingAgents?: { name: string; description: string }[];
  provider?: ConfigProvider;
}

interface ToolInfo {
  name: string;
  type: "builtin" | "mcp" | "plugin" | "skill";
  description?: string;
}

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

type AssistProvider = "anthropic" | "openai" | "google";
const DEFAULT_ASSIST_PROVIDER = "__default__";
type GenerationProviderSelection = AssistProvider | typeof DEFAULT_ASSIST_PROVIDER;

interface BuildProviderOption {
  key: AssistProvider;
  label: string;
  modelId: string | null;
  temperature: number | null;
  topK: number | null;
  topP: number | null;
  thinkingBudget: number | null;
  maxTokens: number | null;
}

interface GenerationParamSupport {
  temperature: boolean;
  topP: boolean;
  topK: boolean;
  thinkingBudget: boolean;
  maxTokens: boolean;
}

const MODEL_OPTIONS: Record<
  AssistProvider,
  Array<{ value: string; label: string }>
> = {
  anthropic: CLAUDE_CLI_MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
  })),
  openai: OPENAI_API_MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
  })),
  google: GEMINI_MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
  })),
};

const AGENT_RUNTIME_MODELS: Record<
  ConfigProvider,
  Array<{ value: string; label: string }>
> = {
  claude: CLAUDE_AGENT_MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
  })),
  codex: CODEX_MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
  })),
  gemini: GEMINI_MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
  })),
};

const GENERATION_PARAM_SUPPORT: Record<AssistProvider, GenerationParamSupport> = {
  anthropic: {
    temperature: true,
    topP: true,
    topK: true,
    thinkingBudget: true,
    maxTokens: true,
  },
  openai: {
    temperature: true,
    topP: true,
    topK: false,
    thinkingBudget: false,
    maxTokens: true,
  },
  google: {
    temperature: true,
    topP: true,
    topK: true,
    thinkingBudget: true,
    maxTokens: true,
  },
};

const ASSIST_PROVIDER_LABEL: Record<AssistProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google AI",
};

function defaultModelForProvider(provider: AssistProvider): string {
  return MODEL_OPTIONS[provider][0]?.value ?? "";
}

function parseNumericInput(
  raw: string,
  {
    min,
    max,
    integer = false,
  }: { min?: number; max?: number; integer?: boolean },
): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return undefined;
  if (integer && !Number.isInteger(parsed)) return undefined;
  if (min !== undefined && parsed < min) return undefined;
  if (max !== undefined && parsed > max) return undefined;
  return parsed;
}

export function AgentBuilder({
  open,
  onClose,
  onGenerated,
  onCreateManual,
  existingAgents,
  provider = "claude",
}: AgentBuilderProps) {
  const [description, setDescription] = useState("");
  const [generationModel, setGenerationModel] = useState("");
  const [agentModel, setAgentModel] = useState("");
  const [effort, setEffort] = useState<EffortLevel | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showGenerationAdvanced, setShowGenerationAdvanced] = useState(false);
  const supportsClaudeTools = provider === "claude";
  const [generationProvider, setGenerationProvider] =
    useState<GenerationProviderSelection>(DEFAULT_ASSIST_PROVIDER);
  const [providerOptions, setProviderOptions] = useState<BuildProviderOption[]>(
    [],
  );
  const [temperature, setTemperature] = useState("");
  const [topP, setTopP] = useState("");
  const [topK, setTopK] = useState("");
  const [thinkingBudget, setThinkingBudget] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const activeAssistOption = useMemo(
    () =>
      generationProvider === DEFAULT_ASSIST_PROVIDER
        ? null
        : providerOptions.find((option) => option.key === generationProvider) ??
          null,
    [providerOptions, generationProvider],
  );
  const modelOptions = useMemo(() => {
    if (!activeAssistOption) return [];
    const base = MODEL_OPTIONS[activeAssistOption.key];
    const configuredModel = activeAssistOption?.modelId?.trim();
    if (!configuredModel) return base;
    if (base.some((option) => option.value === configuredModel)) return base;
    return [
      { value: configuredModel, label: `Configured (${configuredModel})` },
      ...base,
    ];
  }, [activeAssistOption]);
  const generationSupport = useMemo<GenerationParamSupport>(() => {
    if (!activeAssistOption) {
      return {
        temperature: true,
        topP: true,
        topK: true,
        thinkingBudget: true,
        maxTokens: true,
      };
    }
    return GENERATION_PARAM_SUPPORT[activeAssistOption.key];
  }, [activeAssistOption]);
  const runtimeModelOptions = useMemo(() => {
    const base = AGENT_RUNTIME_MODELS[provider] ?? [];
    const options: Array<{ value: string; label: string }> = [
      { value: "__auto__", label: getAgentModelOptionLabel("", provider) },
      ...base.map((option) => ({
        ...option,
        label: getAgentModelOptionLabel(option.value, provider),
      })),
    ];
    const trimmed = agentModel.trim();
    if (trimmed && !options.some((option) => option.value === trimmed)) {
      options.splice(1, 0, {
        value: trimmed,
        label: `Current (${getAgentModelOptionLabel(trimmed, provider)})`,
      });
    }
    return options;
  }, [provider, agentModel]);
  const runtimeModelDisplay = useMemo(
    () => getAgentModelDisplay(agentModel, provider),
    [agentModel, provider],
  );

  useEffect(() => {
    if (!open) return;
    if (!supportsClaudeTools) {
      setShowAdvanced(false);
      setSelectedTools(new Set());
      setAvailableTools([]);
    }
    setEffort(undefined);
    setShowGenerationAdvanced(false);
  }, [open, provider, supportsClaudeTools]);

  useEffect(() => {
    if (!open) return;
    setGenerationProvider(DEFAULT_ASSIST_PROVIDER);
  }, [open]);

  useEffect(() => {
    if (generationProvider === DEFAULT_ASSIST_PROVIDER) return;
    if (providerOptions.some((option) => option.key === generationProvider)) {
      return;
    }
    setGenerationProvider(DEFAULT_ASSIST_PROVIDER);
  }, [generationProvider, providerOptions]);

  useEffect(() => {
    if (!open) return;
    setGenerationModel((prev) => {
      if (!activeAssistOption) return "";
      if (modelOptions.some((option) => option.value === prev)) return prev;
      const configuredModel = activeAssistOption.modelId?.trim();
      if (
        configuredModel &&
        modelOptions.some((option) => option.value === configuredModel)
      ) {
        return configuredModel;
      }
      return defaultModelForProvider(activeAssistOption.key);
    });
  }, [open, activeAssistOption, modelOptions]);

  useEffect(() => {
    if (!open) return;
    setAgentModel((prev) => {
      if (!prev) return "";
      const allowed = new Set(
        (AGENT_RUNTIME_MODELS[provider] ?? []).map((option) => option.value),
      );
      return allowed.has(prev) ? prev : "";
    });
  }, [open, provider]);

  useEffect(() => {
    if (!open) return;
    setTemperature(
      activeAssistOption?.temperature != null
        ? String(activeAssistOption.temperature)
        : "",
    );
    setTopP(
      activeAssistOption?.topP != null ? String(activeAssistOption.topP) : "",
    );
    setTopK(
      activeAssistOption?.topK != null ? String(activeAssistOption.topK) : "",
    );
    setThinkingBudget(
      activeAssistOption?.thinkingBudget != null
        ? String(activeAssistOption.thinkingBudget)
        : "",
    );
    setMaxTokens(
      activeAssistOption?.maxTokens != null
        ? String(activeAssistOption.maxTokens)
        : "",
    );
  }, [open, activeAssistOption]);

  useEffect(() => {
    // Tools are only needed for the advanced picker; lazily fetch to reduce
    // work on open and avoid test-time background state updates.
    if (supportsClaudeTools && open && showAdvanced && availableTools.length === 0) {
      let cancelled = false;
      fetch("/api/tools")
        .then((r) => r.json())
        .then((tools: ToolInfo[]) => {
          if (!cancelled) setAvailableTools(tools);
        })
        .catch((err) => console.debug('[AGENTS]', err.message));
      return () => {
        cancelled = true;
      };
    }
  }, [open, showAdvanced, availableTools.length, supportsClaudeTools]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/instructions/providers")
      .then((r) => r.json())
      .then((rows: ProviderListItem[] | unknown) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? (rows as ProviderListItem[]) : [];
        const next: BuildProviderOption[] = [];
        const seen = new Set<AssistProvider>();
        for (const row of list) {
          if (!row?.isActive) continue;
          const key = row.providerSlug || row.provider;
          if (key !== "anthropic" && key !== "openai" && key !== "google") {
            continue;
          }
          if (!key || seen.has(key)) continue;
          seen.add(key);
          next.push({
            key,
            label: row.displayName || ASSIST_PROVIDER_LABEL[key],
            modelId: row.modelId,
            temperature: row.temperature,
            topK: row.topK,
            topP: row.topP,
            thinkingBudget: row.thinkingBudget,
            maxTokens: row.maxTokens,
          });
        }
        setProviderOptions(next);
      })
      .catch((err) => console.warn("[AGENTS]", err.message));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggleTool = (toolName: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const handleBuild = async () => {
    if (!description.trim()) return;
    if (generationProvider !== DEFAULT_ASSIST_PROVIDER && !activeAssistOption) {
      setError("Selected AI Assist provider is not active");
      return;
    }
    const selectedAssistProvider =
      generationProvider === DEFAULT_ASSIST_PROVIDER
        ? undefined
        : activeAssistOption?.key;

    const temperatureValue = parseNumericInput(temperature, { min: 0, max: 2 });
    if (temperature.trim() && temperatureValue === undefined) {
      setError("Temperature must be between 0 and 2");
      return;
    }
    const topPValue = parseNumericInput(topP, { min: 0, max: 1 });
    if (topP.trim() && topPValue === undefined) {
      setError("Top P must be between 0 and 1");
      return;
    }
    const topKValue = parseNumericInput(topK, { integer: true, min: 0 });
    if (topK.trim() && topKValue === undefined) {
      setError("Top K must be an integer >= 0");
      return;
    }
    const thinkingBudgetValue = parseNumericInput(thinkingBudget, {
      integer: true,
      min: 0,
    });
    if (thinkingBudget.trim() && thinkingBudgetValue === undefined) {
      setError("Thinking budget must be an integer >= 0");
      return;
    }
    const maxTokensValue = parseNumericInput(maxTokens, {
      integer: true,
      min: 1,
    });
    if (maxTokens.trim() && maxTokensValue === undefined) {
      setError("Max tokens must be an integer >= 1");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          ...(selectedAssistProvider && generationModel
            ? { generationModel }
            : {}),
          ...(agentModel ? { agentModel, model: agentModel } : {}),
          ...(effort ? { agentEffort: effort, effort } : {}),
          ...(selectedAssistProvider ? { provider: selectedAssistProvider } : {}),
          ...(temperatureValue !== undefined ? { temperature: temperatureValue } : {}),
          ...(topPValue !== undefined ? { topP: topPValue } : {}),
          ...(topKValue !== undefined ? { topK: topKValue } : {}),
          ...(thinkingBudgetValue !== undefined
            ? { thinkingBudget: thinkingBudgetValue }
            : {}),
          ...(maxTokensValue !== undefined ? { maxTokens: maxTokensValue } : {}),
          ...(supportsClaudeTools && selectedTools.size > 0
            ? { tools: [...selectedTools] }
            : {}),
          ...(existingAgents?.length && { existingAgents }),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to generate agent");
      }
      const generated =
        payload?.baseConfig && typeof payload.baseConfig === "object"
          ? (payload.baseConfig as Partial<Agent>)
          : (payload as Partial<Agent>);
      onGenerated(generated);
      setDescription("");
      setSelectedTools(new Set());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate agent");
    } finally {
      setLoading(false);
    }
  };

  const builtinTools = availableTools.filter((t) => t.type === "builtin");
  const mcpTools = availableTools.filter((t) => t.type === "mcp");
  const pluginTools = availableTools.filter((t) => t.type === "plugin");

  const ToolIcon = ({ type }: { type: string }) => {
    if (type === "mcp") return <Server size={9} className="text-chart-1" />;
    if (type === "plugin") return <Plug size={9} className="text-chart-4" />;
    return <Wrench size={9} className="text-muted-foreground" />;
  };

  const ToolSection = ({
    label,
    tools,
    activeColor,
  }: {
    label: string;
    tools: ToolInfo[];
    activeColor: string;
  }) => {
    if (tools.length === 0) return null;
    return (
      <div>
        <div className="text-meta text-muted-foreground/60 mb-1">{label}</div>
        <div className="flex flex-wrap gap-1">
          {tools.map((tool) => (
            <button
              key={tool.name}
              onClick={() => toggleTool(tool.name)}
              title={tool.description}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-meta font-mono border transition-colors",
                selectedTools.has(tool.name)
                  ? `${activeColor} text-primary`
                  : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <ToolIcon type={tool.type} />
              {tool.name}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xs flex items-center gap-1.5">
            <Sparkles size={12} className="text-chart-4" />
            Build Agent with AI
          </DialogTitle>
          <DialogDescription className="sr-only">
            Describe an agent, choose runtime preferences, then generate a draft with AI assist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-meta uppercase tracking-wider text-muted-foreground">
              Describe what this agent should do
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. A code reviewer that focuses on security vulnerabilities, performance issues, and suggests improvements following OWASP guidelines..."
              className="mt-1 min-h-[140px] resize-y text-xs"
            />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
                Agent Runtime Model
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="text-muted-foreground/70 hover:text-foreground"
                        aria-label="Runtime model inheritance help"
                      >
                        <Info size={11} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {INHERIT_MODEL_HELP}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </label>
              <Select
                value={agentModel || "__auto__"}
                onValueChange={(value) =>
                  setAgentModel(value === "__auto__" ? "" : value)
                }
              >
                <SelectTrigger className="mt-1 h-7 text-xs">
                  <SelectValue placeholder="Auto (provider default)" />
                </SelectTrigger>
                <SelectContent>
                  {runtimeModelOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="text-xs font-mono"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-meta text-muted-foreground/70 font-mono">
                {runtimeModelDisplay.isInherited
                  ? "Inherit from provider defaults"
                  : runtimeModelDisplay.version &&
                      runtimeModelDisplay.version !== runtimeModelDisplay.label
                    ? `Version: ${runtimeModelDisplay.version}`
                    : `Model: ${runtimeModelDisplay.label}`}
              </p>
            </div>
            <div>
              <label className="text-meta uppercase tracking-wider text-muted-foreground">
                Effort
              </label>
              <EffortPicker
                value={effort}
                onChange={setEffort}
                className="mt-1 w-full flex-wrap"
              />
            </div>
          </div>
          <p className="text-meta text-muted-foreground/70">
            Model and effort set runtime preferences on the generated agent draft.
          </p>
          {provider === "claude" && (
            <p className="text-meta text-muted-foreground/70">
              Claude CLI settings live in Settings → Claude (`~/.claude/settings.json`).
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1 text-meta uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight
                size={10}
                className={cn("transition-transform", showAdvanced && "rotate-90")}
              />
              Advanced
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2">
                <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 space-y-2">
                  <div className="text-meta uppercase tracking-wider text-muted-foreground">
                    AI Assist
                  </div>
                  <div>
                    <label className="text-meta text-muted-foreground">AI Assist LLM</label>
                    <select
                      value={generationProvider}
                      onChange={(e) =>
                        setGenerationProvider(
                          e.target.value as GenerationProviderSelection,
                        )
                      }
                      disabled={loading}
                      className="mt-1 w-full h-7 text-xs px-2 bg-card border border-border/50 rounded-md text-foreground disabled:opacity-100"
                    >
                      <option value={DEFAULT_ASSIST_PROVIDER}>
                        Default (from Settings)
                      </option>
                      {providerOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {activeAssistOption ? (
                    <>
                      <div>
                        <label className="text-meta text-muted-foreground">
                          Generation Model
                        </label>
                        <Select
                          value={generationModel}
                          onValueChange={setGenerationModel}
                        >
                          <SelectTrigger className="mt-1 h-7 text-xs">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            {modelOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                                className="text-xs font-mono"
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowGenerationAdvanced((v) => !v)}
                        className="flex items-center gap-1 text-meta uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight
                          size={10}
                          className={cn(
                            "transition-transform",
                            showGenerationAdvanced && "rotate-90",
                          )}
                        />
                        Advanced Settings
                      </button>
                      {showGenerationAdvanced && (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div>
                              <label className="text-meta text-muted-foreground">
                                Temperature
                              </label>
                              <Input
                                type="number"
                                step="0.1"
                                min={0}
                                max={2}
                                value={temperature}
                                onChange={(e) => setTemperature(e.target.value)}
                                placeholder={
                                  activeAssistOption.temperature != null
                                    ? String(activeAssistOption.temperature)
                                    : "Provider/model default"
                                }
                                className="mt-1 h-7 text-xs"
                                disabled={!generationSupport.temperature}
                              />
                            </div>
                            <div>
                              <label className="text-meta text-muted-foreground">
                                Top P
                              </label>
                              <Input
                                type="number"
                                step="0.05"
                                min={0}
                                max={1}
                                value={topP}
                                onChange={(e) => setTopP(e.target.value)}
                                placeholder={
                                  activeAssistOption.topP != null
                                    ? String(activeAssistOption.topP)
                                    : "Provider/model default"
                                }
                                className="mt-1 h-7 text-xs"
                                disabled={!generationSupport.topP}
                              />
                            </div>
                            <div>
                              <label className="text-meta text-muted-foreground">
                                Top K
                              </label>
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={topK}
                                onChange={(e) => setTopK(e.target.value)}
                                placeholder={
                                  activeAssistOption.topK != null
                                    ? String(activeAssistOption.topK)
                                    : "Provider/model default"
                                }
                                className="mt-1 h-7 text-xs"
                                disabled={!generationSupport.topK}
                              />
                            </div>
                            <div>
                              <label className="text-meta text-muted-foreground">
                                Max Tokens
                              </label>
                              <Input
                                type="number"
                                min={1}
                                step="1"
                                value={maxTokens}
                                onChange={(e) => setMaxTokens(e.target.value)}
                                placeholder={
                                  activeAssistOption.maxTokens != null
                                    ? String(activeAssistOption.maxTokens)
                                    : "Provider default (16384 fallback)"
                                }
                                className="mt-1 h-7 text-xs"
                                disabled={!generationSupport.maxTokens}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-meta text-muted-foreground">
                                Thinking Budget
                              </label>
                              <Input
                                type="number"
                                min={0}
                                step="1"
                                value={thinkingBudget}
                                onChange={(e) =>
                                  setThinkingBudget(e.target.value)
                                }
                                placeholder={
                                  activeAssistOption.thinkingBudget != null
                                    ? String(activeAssistOption.thinkingBudget)
                                    : "Provider/model default"
                                }
                                className="mt-1 h-7 text-xs"
                                disabled={!generationSupport.thinkingBudget}
                              />
                            </div>
                          </div>
                          <p className="text-meta text-muted-foreground/70">
                            Leave blank for provider defaults. Unsupported fields
                            are disabled for the selected AI assist provider.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-meta text-muted-foreground/70">
                      Uses the default provider/model configured in Settings.
                    </p>
                  )}
                </div>

                {supportsClaudeTools && (
                  <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-meta text-muted-foreground">
                        Tools{" "}
                        {selectedTools.size > 0 &&
                          `(${selectedTools.size} selected)`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedTools.size === availableTools.length) {
                            setSelectedTools(new Set());
                          } else {
                            setSelectedTools(
                              new Set(availableTools.map((t) => t.name)),
                            );
                          }
                        }}
                        className="text-meta text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {selectedTools.size === availableTools.length &&
                        availableTools.length > 0
                          ? "Clear all"
                          : "Select all"}
                      </button>
                    </div>
                    <div className="space-y-2 max-h-[140px] overflow-y-auto">
                      <ToolSection
                        label="Builtin"
                        tools={builtinTools}
                        activeColor="border-primary/50 bg-primary/10"
                      />
                      <ToolSection
                        label="MCP Servers"
                        tools={mcpTools}
                        activeColor="border-chart-1/50 bg-chart-1/10"
                      />
                      <ToolSection
                        label="Plugins"
                        tools={pluginTools}
                        activeColor="border-chart-4/50 bg-chart-4/10"
                      />
                      {availableTools.length === 0 && (
                        <span className="text-meta text-text-tertiary">
                          Loading tools...
                        </span>
                      )}
                    </div>
                    <p className="text-meta text-muted-foreground/60">
                      Leave empty to let AI pick appropriate tools
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <div className="text-meta text-destructive">{error}</div>}

          <div className="flex justify-end gap-2">
            {onCreateManual && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={onCreateManual}
              >
                Create Manually
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={handleBuild}
              disabled={!description.trim() || loading}
            >
              {loading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Sparkles size={11} />
              )}
              {loading ? "Generating..." : "Generate Agent"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
