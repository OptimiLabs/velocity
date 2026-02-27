"use client";

import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
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
import { Puzzle, X, Plus, Sparkles, Info } from "lucide-react";
import { type EffortLevel } from "@/components/console/EffortPicker";
import { CATEGORY_OPTIONS } from "@/lib/agents/categories";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import type { WorkflowNodeOverrides } from "@/types/workflow";
import { AgentBuilderChat } from "@/components/agents/AgentBuilderChat";
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
import { ToolMultiSelect } from "@/components/agents/ToolMultiSelect";

interface ToolInfo {
  name: string;
  type: "builtin" | "mcp" | "plugin" | "skill";
  description?: string;
}

interface SnippetInfo {
  id: string;
  name: string;
  category: string;
}

const MODEL_INHERIT_VALUE = "__inherit__";
const EFFORT_AUTO_VALUE = "__auto__";

const PROVIDER_MODELS: Record<ConfigProvider, readonly string[]> = {
  claude: CLAUDE_AGENT_MODEL_OPTIONS.map((model) => model.id),
  codex: CODEX_MODEL_OPTIONS.map((model) => model.id),
  gemini: GEMINI_MODEL_OPTIONS.map((model) => model.id),
};

interface AgentDetailEditProps {
  agent: Partial<Agent> | null;
  onSave: (agent: Partial<Agent>) => void;
  onCancel: () => void;
  existingAgents?: { name: string; description: string }[];
  workflowMode?: boolean;
  workflowOverrides?: WorkflowNodeOverrides;
  onSaveOverrides?: (overrides: WorkflowNodeOverrides) => void;
}

export function AgentDetailEdit({
  agent,
  onSave,
  onCancel,
  existingAgents,
  workflowMode,
  workflowOverrides,
  onSaveOverrides,
}: AgentDetailEditProps) {
  // In workflow mode, overrides take priority over base agent values
  const provider: ConfigProvider = agent?.provider ?? "claude";
  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(
    workflowOverrides?.description ?? agent?.description ?? "",
  );
  const [model, setModel] = useState(
    workflowOverrides?.model ?? agent?.model ?? "",
  );
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    workflowOverrides?.effort ?? agent?.effort,
  );
  const [category, setCategory] = useState(agent?.category || "general");
  const [prompt, setPrompt] = useState(
    workflowOverrides?.systemPrompt ?? agent?.prompt ?? "",
  );
  const [selectedDisallowedTools, setSelectedDisallowedTools] = useState<
    Set<string>
  >(
    new Set(agent?.disallowedTools || []),
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    agent?.skills || [],
  );
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [availableSnippets, setAvailableSnippets] = useState<SnippetInfo[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const selectedModelInfo = getAgentModelDisplay(model, provider);
  const providerModelOptions = PROVIDER_MODELS[provider];
  const trimmedModel = model.trim();
  const hasCustomModelOption =
    trimmedModel.length > 0 && !providerModelOptions.includes(trimmedModel);
  const modelSelectOptions = useMemo(() => {
    const base: Array<{ value: string; label: string }> = [
      { value: MODEL_INHERIT_VALUE, label: getAgentModelOptionLabel("", provider) },
      ...providerModelOptions.map((value) => ({
        value,
        label: getAgentModelOptionLabel(value, provider),
      })),
    ];
    if (hasCustomModelOption) {
      base.splice(1, 0, {
        value: trimmedModel,
        label: `Current (${getAgentModelOptionLabel(trimmedModel, provider)})`,
      });
    }
    return base;
  }, [provider, providerModelOptions, hasCustomModelOption, trimmedModel]);

  const isEditing = !!agent?.name;

  useEffect(() => {
    fetch("/api/tools")
      .then((r) => r.json())
      .then((tools: ToolInfo[]) => setAvailableTools(tools))
      .catch((err) => console.debug('[AGENTS]', err.message));
    fetch("/api/snippets")
      .then((r) => r.json())
      .then((snippets: SnippetInfo[]) => setAvailableSnippets(snippets))
      .catch((err) => console.debug('[AGENTS]', err.message));
  }, []);

  const pluginToolNames = useMemo(
    () =>
      new Set(
        availableTools
          .filter((tool) => tool.type === "plugin")
          .map((tool) => tool.name),
      ),
    [availableTools],
  );

  const withoutPluginTools = (tools: Iterable<string>) =>
    Array.from(tools).filter((tool) => !pluginToolNames.has(tool));

  const handleSave = () => {
    const cleanedDisallowedTools = withoutPluginTools(selectedDisallowedTools);
    if (workflowMode && onSaveOverrides) {
      // Only include fields that differ from the base agent
      const overrides: WorkflowNodeOverrides = {};
      if (prompt !== (agent?.prompt ?? "")) overrides.systemPrompt = prompt;
      if (model !== (agent?.model ?? "")) overrides.model = model;
      if (effort !== (agent?.effort as EffortLevel | undefined)) {
        overrides.effort = effort;
      }
      if (description !== (agent?.description ?? ""))
        overrides.description = description;
      onSaveOverrides(overrides);
      return;
    }
    onSave({
      name,
      description,
      model,
      effort,
      category,
      prompt,
      tools: agent?.tools,
      disallowedTools: cleanedDisallowedTools,
      skills: selectedSkills,
    });
  };

  const handleApplyAIDraft = (draft: Partial<Agent>) => {
    if (!isEditing && typeof draft.name === "string" && draft.name.trim().length > 0) {
      setName(draft.name.trim());
    }
    if (typeof draft.description === "string") setDescription(draft.description);
    if (typeof draft.model === "string" && draft.model.trim().length > 0) {
      setModel(draft.model);
    }
    if (typeof draft.prompt === "string") setPrompt(draft.prompt);
    if (!workflowMode) {
      if (draft.effort === "low" || draft.effort === "medium" || draft.effort === "high") {
        setEffort(draft.effort);
      }
      if (typeof draft.category === "string" && draft.category.trim().length > 0) {
        setCategory(draft.category);
      }
      if (Array.isArray(draft.disallowedTools)) {
        setSelectedDisallowedTools(
          new Set(withoutPluginTools(draft.disallowedTools)),
        );
      }
      if (Array.isArray(draft.skills)) {
        setSelectedSkills(
          draft.skills.filter((skill): skill is string => typeof skill === "string"),
        );
      }
    }
  };

  const selectableTools = availableTools.filter(
    (tool) => tool.type === "builtin" || tool.type === "mcp",
  );
  const selectableToolNames = new Set(selectableTools.map((tool) => tool.name));
  const selectedVisibleTools = [...selectedDisallowedTools].filter((tool) =>
    selectableToolNames.has(tool),
  );

  const snippetNameMap = new Map(availableSnippets.map((s) => [s.id, s.name]));
  const unattachedSnippets = availableSnippets.filter(
    (s) => !selectedSkills.includes(s.id),
  );

  return (
    <div className="p-4 space-y-3">
      {workflowMode && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-chart-1/5 border border-chart-1/20 text-xs text-chart-1">
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>Changes only affect this workflow — the base agent is unchanged.</span>
        </div>
      )}
      <div>
        <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
          Name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-agent"
          className="h-7 text-xs font-mono mt-1"
          disabled={isEditing || workflowMode}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
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
          </label>
          <Select
            value={model || MODEL_INHERIT_VALUE}
            onValueChange={(value) =>
              setModel(value === MODEL_INHERIT_VALUE ? "" : value)
            }
          >
            <SelectTrigger className="h-8 mt-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modelSelectOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[10px] text-muted-foreground font-mono">
            {selectedModelInfo.isInherited
              ? "Inherit from provider defaults"
              : selectedModelInfo.version &&
                  selectedModelInfo.version !== selectedModelInfo.label
                ? `Version: ${selectedModelInfo.version}`
                : `Model: ${selectedModelInfo.label}`}
          </p>
        </div>
        <div className="min-w-0">
          <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
            Effort
          </label>
          <Select
            value={effort ?? EFFORT_AUTO_VALUE}
            onValueChange={(value) =>
              setEffort(
                value === EFFORT_AUTO_VALUE
                  ? undefined
                  : (value as Exclude<EffortLevel, undefined>),
              )
            }
          >
            <SelectTrigger className="h-8 mt-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EFFORT_AUTO_VALUE}>Auto</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
          Description
        </label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Brief description"
          className="h-7 text-xs mt-1"
        />
      </div>

      {!workflowMode && (
        <div>
          <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
            Category
          </label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-7 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!workflowMode && (
        <div>
          <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
            Blocked Tools
          </label>
          <div className="mt-1 space-y-1.5">
            <ToolMultiSelect
              tools={selectableTools}
              selected={selectedVisibleTools}
              onChange={(next) => setSelectedDisallowedTools(new Set(next))}
              emptyLabel="No blocked tools"
            />
            <p className="text-meta text-muted-foreground/70">
              Multi-select built-in and MCP tools this agent should not use.
            </p>
          </div>
        </div>
      )}

      {/* Skills */}
      {!workflowMode && <div>
        <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
          Skills
        </label>
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedSkills.map((skillId) => (
            <span
              key={skillId}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta border border-chart-4/30 bg-chart-4/5 text-chart-4"
            >
              <Puzzle size={8} />
              {snippetNameMap.get(skillId) || skillId}
              <button
                onClick={() =>
                  setSelectedSkills((prev) => prev.filter((s) => s !== skillId))
                }
                className="hover:text-destructive transition-colors"
              >
                <X size={8} />
              </button>
            </span>
          ))}
          {showSkillPicker ? (
            <div className="w-full mt-1 space-y-0.5 max-h-[100px] overflow-y-auto bg-muted/20 rounded p-1">
              {unattachedSnippets.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSkills((prev) => [...prev, s.id]);
                    setShowSkillPicker(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-xs hover:bg-muted/50 transition-colors"
                >
                  {s.name}
                </button>
              ))}
              {unattachedSnippets.length === 0 && (
                <p className="text-meta text-text-tertiary px-2 py-1">
                  No available snippets
                </p>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowSkillPicker(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta border border-dashed border-border/50 text-muted-foreground/50 hover:text-muted-foreground hover:border-border transition-colors"
            >
              <Plus size={8} />
              Add Skill
            </button>
          )}
        </div>
      </div>}

      <div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
            Prompt
          </label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs font-medium"
            onClick={() => setAiEditOpen(true)}
          >
            <Sparkles size={12} className="mr-1.5" />
            AI Edit
          </Button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="System prompt for the agent..."
          className="mt-1 min-h-[200px] resize-y text-xs font-mono"
        />
      </div>

      {/* Pinned actions */}
      <div className="flex justify-end gap-2 pt-3 border-t border-border/30 sticky bottom-0 bg-card/50 pb-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleSave}
          disabled={!name || !prompt}
        >
          {workflowMode ? "Save Override" : isEditing ? "Update" : "Create"}
        </Button>
      </div>

      <AgentBuilderChat
        open={aiEditOpen}
        onClose={() => setAiEditOpen(false)}
        onSave={handleApplyAIDraft}
        mode="edit"
        title={workflowMode ? "AI Edit Agent Override" : "AI Edit Agent"}
        actionLabel={workflowMode ? "Apply Override Draft" : "Apply Draft"}
        dialogVariant={workflowMode ? "workflow-override" : "default"}
        contextNote={
          workflowMode
            ? "Edits apply only to this agent override in the current workflow. Other agents and the workflow graph are unchanged."
            : undefined
        }
        initialAgent={{
          name,
          description,
          model,
          effort,
          category,
          prompt,
          disallowedTools: [...selectedDisallowedTools],
          ...(!workflowMode
            ? { tools: agent?.tools, skills: selectedSkills }
            : {}),
        }}
        existingAgents={existingAgents}
      />
    </div>
  );
}
