"use client";

import { useState, useEffect, useMemo, createElement } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Wrench, Server, Plug, Ban, ChevronRight, Info } from "lucide-react";
import {
  AGENT_ICON_MAP,
} from "@/lib/agents/categories";
import type { EffortLevel } from "@/components/console/EffortPicker";
import { cn } from "@/lib/utils";
import { ArtifactConvertDialog } from "@/components/providers/ArtifactConvertDialog";
import { DirectoryPicker } from "@/components/console/DirectoryPicker";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import {
  getAgentModelDisplay,
  getAgentModelOptionLabel,
  INHERIT_MODEL_HELP,
} from "@/lib/agents/model-display";
import {
  CLAUDE_AGENT_MODEL_OPTIONS,
  CODEX_MODEL_OPTIONS,
  GEMINI_MODEL_OPTIONS,
} from "@/lib/models/provider-models";

interface AgentEditorProps {
  agent: Partial<Agent> | null;
  open: boolean;
  onClose: () => void;
  onSave: (agent: Partial<Agent>) => void;
  provider?: ConfigProvider;
}

interface ToolInfo {
  name: string;
  type: "builtin" | "mcp" | "plugin" | "skill";
  description?: string;
}

interface ProjectItem {
  id: string;
  name: string;
  path: string;
}

function isProjectItem(row: unknown): row is ProjectItem {
  return (
    !!row &&
    typeof row === "object" &&
    typeof (row as { id?: unknown }).id === "string" &&
    typeof (row as { name?: unknown }).name === "string" &&
    typeof (row as { path?: unknown }).path === "string"
  );
}

const COLOR_PALETTE = [
  { hex: "#2563eb", label: "Sapphire" },
  { hex: "#3b82f6", label: "Blue" },
  { hex: "#06b6d4", label: "Cyan" },
  { hex: "#14b8a6", label: "Teal" },
  { hex: "#22c55e", label: "Green" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#f97316", label: "Orange" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#ec4899", label: "Pink" },
  { hex: "#7c3aed", label: "Violet" },
];

const ICON_OPTIONS = Object.keys(AGENT_ICON_MAP);

const PROVIDER_MODELS: Record<ConfigProvider, string[]> = {
  claude: CLAUDE_AGENT_MODEL_OPTIONS.map((model) => model.id),
  codex: CODEX_MODEL_OPTIONS.map((model) => model.id),
  gemini: GEMINI_MODEL_OPTIONS.map((model) => model.id),
};

const EFFORT_OPTIONS: { value: EffortLevel | undefined; label: string }[] = [
  { value: undefined, label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];
export function AgentEditor({
  agent,
  open,
  onClose,
  onSave,
  provider = "claude",
}: AgentEditorProps) {
  // Key forces form state reset when agent or open changes
  const formKey = `${agent?.name ?? "new"}-${open}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
        {open && (
          <AgentEditorForm
            key={formKey}
            agent={agent}
            provider={provider}
            onClose={onClose}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AgentEditorForm({
  agent,
  provider,
  onClose,
  onSave,
}: Omit<AgentEditorProps, "open">) {
  const effectiveProvider: ConfigProvider =
    agent?.provider ?? provider ?? "claude";
  const isClaudeProvider = effectiveProvider === "claude";
  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [model, setModel] = useState(
    agent?.model || (isClaudeProvider ? "sonnet" : ""),
  );
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    agent?.effort,
  );
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [prompt, setPrompt] = useState(agent?.prompt || "");
  const [allowedTools, setAllowedTools] = useState<Set<string>>(
    new Set(agent?.tools || []),
  );
  const [disallowedTools, setDisallowedTools] = useState<Set<string>>(
    new Set(agent?.disallowedTools || []),
  );
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [color, setColor] = useState(agent?.color || "");
  const [icon, setIcon] = useState(agent?.icon || "");
  const [convertOpen, setConvertOpen] = useState(false);
  const [saveScope, setSaveScope] = useState<"global" | "project">(
    agent?.scope === "project" ? "project" : "global",
  );
  const [saveProjectPath, setSaveProjectPath] = useState(agent?.projectPath || "");
  const [saveAreaPath, setSaveAreaPath] = useState(agent?.areaPath || "");
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const isEditing = !!agent?.filePath;

  useEffect(() => {
    // Lazy-load tools only when the advanced section is opened.
    if (!isClaudeProvider || !showAdvanced || availableTools.length > 0) return;
    let cancelled = false;
    fetch("/api/tools")
      .then((r) => r.json())
      .then((tools: ToolInfo[]) => {
        if (!cancelled) setAvailableTools(tools);
      })
      .catch((err) => console.warn("[AGENTS]", err.message));
    return () => {
      cancelled = true;
    };
  }, [isClaudeProvider, showAdvanced, availableTools.length]);

  useEffect(() => {
    // Load projects only when project scope is actually needed.
    if (saveScope !== "project" || projects.length > 0) return;
    let cancelled = false;
    fetch("/api/projects?limit=200")
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload?.projects)
          ? payload.projects
          : Array.isArray(payload)
            ? payload
            : [];
        const mapped = (rows as unknown[])
          .filter(isProjectItem)
          .map((row) => ({ id: row.id, name: row.name, path: row.path }));
        setProjects(mapped);
        setSaveProjectPath((prev) =>
          !prev && mapped.length === 1 ? mapped[0].path : prev,
        );
      })
      .catch((err) => console.warn("[AGENTS]", err.message));
    return () => {
      cancelled = true;
    };
  }, [saveScope, projects.length]);

  const toggleBuiltinTool = (toolName: string) => {
    setDisallowedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const toggleOptInTool = (toolName: string) => {
    setAllowedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const handleSave = () => {
    if (saveScope === "project" && !saveProjectPath) {
      toast.error("Select a project before saving a project-scoped agent");
      return;
    }
    const trimmedModel = model.trim();
    const trimmedAreaPath = saveAreaPath.trim();
    const payload: Record<string, unknown> = {
      name,
      description,
      model: trimmedModel || undefined,
      effort,
      prompt,
      tools: isClaudeProvider ? [...allowedTools] : agent?.tools,
      disallowedTools: isClaudeProvider
        ? [...disallowedTools]
        : agent?.disallowedTools,
      color: color || undefined,
      icon: icon || undefined,
      scope: saveScope,
      projectPath: saveScope === "project" ? saveProjectPath : undefined,
      areaPath:
        saveScope === "project" && trimmedAreaPath
          ? trimmedAreaPath
          : undefined,
    };
    onSave(payload as Partial<Agent>);
    onClose();
  };

  const builtinTools = availableTools.filter((t) => t.type === "builtin");
  const mcpTools = availableTools.filter((t) => t.type === "mcp");
  const pluginTools = availableTools.filter((t) => t.type === "plugin");
  const optInTools = useMemo(() => {
    const byName = new Map<string, ToolInfo>();
    for (const tool of [...mcpTools, ...pluginTools]) {
      if (!byName.has(tool.name)) byName.set(tool.name, tool);
    }
    return Array.from(byName.values());
  }, [mcpTools, pluginTools]);
  const providerModelOptions = useMemo(() => {
    const base = PROVIDER_MODELS[effectiveProvider] ?? [];
    const options: Array<{ value: string; label: string }> = [
      { value: "", label: getAgentModelOptionLabel("", effectiveProvider) },
      ...base.map((value) => ({
        value,
        label: getAgentModelOptionLabel(value, effectiveProvider),
      })),
    ];
    const trimmed = model.trim();
    if (trimmed && !options.some((option) => option.value === trimmed)) {
      options.splice(1, 0, {
        value: trimmed,
        label: `Current (${getAgentModelOptionLabel(trimmed, effectiveProvider)})`,
      });
    }
    return options;
  }, [effectiveProvider, model]);
  const selectedModelInfo = useMemo(
    () => getAgentModelDisplay(model, effectiveProvider),
    [model, effectiveProvider],
  );
  const hasExtraTools = optInTools.length > 0;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-sm">
          {isEditing ? `Edit ${agent?.name}` : "New Agent"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-5 min-w-0">
        {/* ── Identity ─────────────────────────────── */}
        <section className="space-y-2.5">
          <div>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-agent"
              className="h-8 text-xs font-mono"
              disabled={isEditing}
            />
          </div>

          <div>
            <FieldLabel>Description</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this agent does"
              className="h-8 text-xs"
            />
          </div>

          <div>
            <FieldLabel>Save Scope</FieldLabel>
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-md border border-input bg-transparent p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setSaveScope("global")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-[3px] transition-colors",
                    saveScope === "global"
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  Global
                </button>
                <button
                  type="button"
                  onClick={() => setSaveScope("project")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-[3px] transition-colors",
                    saveScope === "project"
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  )}
                >
                  Project
                </button>
              </div>
              {saveScope === "project" && (
                <div className="space-y-2">
                  <select
                    value={saveProjectPath}
                    onChange={(e) => setSaveProjectPath(e.target.value)}
                    className="h-8 w-full rounded-md border border-border/50 bg-background px-2 text-xs"
                  >
                    <option value="">Select project…</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.path}>
                        {project.name} · {project.path}
                      </option>
                    ))}
                  </select>
                  <DirectoryPicker
                    value={saveProjectPath}
                    onChange={setSaveProjectPath}
                    placeholder="~/projects/my-app"
                    compact
                  />
                  <p className="text-[10px] text-muted-foreground/70">
                    Select an indexed project or enter any project directory.
                  </p>
                  <div>
                    <FieldLabel>Project Sub-area (Optional)</FieldLabel>
                    <Input
                      value={saveAreaPath}
                      onChange={(e) => setSaveAreaPath(e.target.value)}
                      placeholder="e.g. src/analytics"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <Divider />

        {/* ── Appearance ─────────────────────────────── */}
        <section className="space-y-2.5">
          <SectionLabel>Appearance</SectionLabel>

          <div>
            <FieldLabel>Color</FieldLabel>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setColor("")}
                title="Auto (use category color)"
                className={cn(
                  "w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center text-[8px] font-bold",
                  !color
                    ? "border-foreground scale-110"
                    : "border-border/50 hover:border-border",
                )}
              >
                <span className="text-[8px] text-muted-foreground">
                  A
                </span>
              </button>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => setColor(c.hex)}
                  title={c.label}
                  className={cn(
                    "w-5 h-5 rounded-full border-2 transition-all",
                    color === c.hex
                      ? "border-foreground scale-110"
                      : "border-transparent hover:border-border",
                  )}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Icon</FieldLabel>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIcon("")}
                title="Auto (use category icon)"
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded border transition-colors text-[9px] font-bold",
                  !icon
                    ? "border-foreground/50 bg-accent text-accent-foreground"
                    : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                Auto
              </button>
              {ICON_OPTIONS.map((name) => (
                <button
                  key={name}
                  onClick={() => setIcon(name)}
                  title={name}
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded border transition-colors",
                    icon === name
                      ? "border-foreground/50 bg-accent text-accent-foreground"
                      : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {createElement(AGENT_ICON_MAP[name], { size: 13 })}
                </button>
              ))}
            </div>
          </div>
        </section>

        <Divider />

        {/* ── Model & Effort ───────────────────────── */}
        <section className="space-y-2.5">
          <SectionLabel>Model &amp; Effort</SectionLabel>
          <div className="flex gap-6">
            <div className="min-w-0">
              <FieldLabel>
                <span className="inline-flex items-center gap-1">
                  Model
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="text-muted-foreground/70 hover:text-foreground"
                          aria-label="Model inheritance help"
                        >
                          <Info size={11} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {INHERIT_MODEL_HELP}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </span>
              </FieldLabel>
              {isClaudeProvider ? (
                <SegmentedControl
                  options={providerModelOptions}
                  value={model}
                  onChange={setModel}
                />
              ) : (
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-8 w-[240px] max-w-full rounded-md border border-border/50 bg-background px-2 text-xs font-mono"
                >
                  {providerModelOptions.map((option) => (
                    <option key={option.value || "__auto__"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground font-mono">
                {selectedModelInfo.isInherited
                  ? "Inherit from provider defaults"
                  : selectedModelInfo.version && selectedModelInfo.version !== selectedModelInfo.label
                    ? `Version: ${selectedModelInfo.version}`
                    : `Model: ${selectedModelInfo.label}`}
              </p>
            </div>
            <div>
              <FieldLabel>Effort</FieldLabel>
              <SegmentedControl
                options={EFFORT_OPTIONS.map((o) => ({
                  value: o.value ?? "__auto__",
                  label: o.label,
                }))}
                value={effort ?? "__auto__"}
                onChange={(v) =>
                  setEffort(v === "__auto__" ? undefined : (v as EffortLevel))
                }
              />
            </div>
          </div>
        </section>

        <Divider />

        {isClaudeProvider && (
          <>
            {/* ── Advanced (Tools) ──────────────────────── */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              <ChevronRight
                size={12}
                className={cn("transition-transform", showAdvanced && "rotate-90")}
              />
              Advanced
            </button>

            {showAdvanced && (
              <section className="space-y-2.5">
                <SectionLabel>Tools</SectionLabel>

                {builtinTools.length > 0 && (
                  <div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <FieldLabel className="mb-0">Built-in</FieldLabel>
                      <span className="text-[10px] text-muted-foreground/50">
                        all enabled by default · click to deny
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {builtinTools.map((tool) => {
                        const isDenied = disallowedTools.has(tool.name);
                        return (
                          <button
                            key={tool.name}
                            onClick={() => toggleBuiltinTool(tool.name)}
                            title={
                              isDenied
                                ? `${tool.name} — denied (click to allow)`
                                : `${tool.name} — allowed (click to deny)`
                            }
                            className={cn(
                              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-colors",
                              isDenied
                                ? "border-destructive/40 bg-destructive/10 text-destructive line-through"
                                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                          >
                            {isDenied ? (
                              <Ban size={9} className="text-destructive" />
                            ) : (
                              <Wrench size={9} />
                            )}
                            {tool.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {hasExtraTools && (
                  <div>
                    <div className="flex items-baseline gap-2 mb-1.5">
                      <FieldLabel className="mb-0">MCP &amp; Plugins</FieldLabel>
                      <span className="text-[10px] text-muted-foreground/50">
                        click to allow
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
                      {optInTools.map((tool) => {
                        const isActive = allowedTools.has(tool.name);
                        const isMcp = tool.type === "mcp";
                        return (
                          <button
                            key={`${tool.type}:${tool.name}`}
                            onClick={() => toggleOptInTool(tool.name)}
                            title={tool.description}
                            className={cn(
                              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border transition-colors",
                              isActive
                                ? isMcp
                                  ? "border-chart-1/50 bg-chart-1/10 text-chart-1"
                                  : "border-chart-4/50 bg-chart-4/10 text-chart-4"
                                : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                          >
                            {isMcp ? (
                              <Server size={9} className="text-chart-1" />
                            ) : (
                              <Plug size={9} className="text-chart-4" />
                            )}
                            {tool.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {availableTools.length === 0 && (
                  <div className="text-xs text-text-tertiary">
                    Loading tools...
                  </div>
                )}
              </section>
            )}

            <Divider />
          </>
        )}

        {/* ── Prompt ───────────────────────────────── */}
        <section className="space-y-2">
          <SectionLabel>System Prompt</SectionLabel>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="System prompt for the agent..."
            className="min-h-[200px] resize-y text-xs font-mono"
          />
        </section>

        {/* ── Actions ──────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setConvertOpen(true)}
            disabled={!name.trim() || !prompt.trim()}
          >
            Convert
          </Button>
          <div className="flex items-center gap-2">
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
              className="h-8 text-xs"
              onClick={handleSave}
              disabled={!name || !prompt || (saveScope === "project" && !saveProjectPath)}
            >
              {isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </div>

      <ArtifactConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        artifactType="agent"
        sourceProvider={effectiveProvider}
        title={`Convert Agent${name ? `: ${name}` : ""}`}
        description="Preview and save Claude, Codex, and Gemini agent variants."
        getSource={() => {
          const trimmedName = name.trim();
          const trimmedPrompt = prompt.trim();
          const trimmedModel = model.trim();
          const trimmedAreaPath = saveAreaPath.trim();
          if (!trimmedName || !trimmedPrompt) return null;
          return {
            kind: "inline" as const,
            data: {
              name: trimmedName,
              provider: effectiveProvider,
              description: description.trim(),
              prompt: trimmedPrompt,
              model: trimmedModel || undefined,
              effort,
              tools: isClaudeProvider ? [...allowedTools] : agent?.tools,
              color: color || undefined,
              scope: saveScope,
              projectPath: saveScope === "project" ? saveProjectPath : undefined,
              areaPath:
                saveScope === "project" && trimmedAreaPath
                  ? trimmedAreaPath
                  : undefined,
            },
          };
        }}
        onSaved={() => toast.success("Agent conversion save complete")}
      />
    </>
  );
}

/* ── Shared sub-components ──────────────────────────────────────── */

function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "block text-xs font-medium text-muted-foreground mb-1",
        className,
      )}
    >
      {children}
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/40" />;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-input bg-transparent p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-[3px] transition-colors",
            opt.value === value
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
