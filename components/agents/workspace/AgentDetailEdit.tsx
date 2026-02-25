"use client";

import { useState, useEffect } from "react";
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
import { Wrench, Server, Puzzle, X, Plus } from "lucide-react";
import {
  EffortPicker,
  type EffortLevel,
} from "@/components/console/EffortPicker";
import { CATEGORY_OPTIONS } from "@/lib/agents/categories";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agent";
import type { WorkflowNodeOverrides } from "@/types/workflow";
import { Info } from "lucide-react";

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

const MODELS = ["opus", "sonnet", "haiku"];

function ToolIcon({ type }: { type: string }) {
  if (type === "mcp") return <Server size={9} className="text-chart-1" />;
  if (type === "plugin") return <Puzzle size={9} className="text-chart-4" />;
  return <Wrench size={9} className="text-muted-foreground" />;
}

function ToolSection({
  label,
  tools,
  activeColor,
  selectedTools,
  onToggle,
}: {
  label: string;
  tools: ToolInfo[];
  activeColor: string;
  selectedTools: Set<string>;
  onToggle: (name: string) => void;
}) {
  if (tools.length === 0) return null;
  return (
    <div>
      <div className="text-meta text-muted-foreground/60 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1">
        {tools.map((tool) => (
          <button
            key={tool.name}
            onClick={() => onToggle(tool.name)}
            title={tool.description}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-meta font-mono border transition-colors",
              selectedTools.has(tool.name)
                ? activeColor
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
}

interface AgentDetailEditProps {
  agent: Partial<Agent> | null;
  onSave: (agent: Partial<Agent>) => void;
  onCancel: () => void;
  workflowMode?: boolean;
  workflowOverrides?: WorkflowNodeOverrides;
  onSaveOverrides?: (overrides: WorkflowNodeOverrides) => void;
}

export function AgentDetailEdit({
  agent,
  onSave,
  onCancel,
  workflowMode,
  workflowOverrides,
  onSaveOverrides,
}: AgentDetailEditProps) {
  // In workflow mode, overrides take priority over base agent values
  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(
    workflowOverrides?.description ?? agent?.description ?? "",
  );
  const [model, setModel] = useState(
    workflowOverrides?.model ?? agent?.model ?? "opus",
  );
  const [effort, setEffort] = useState<EffortLevel | undefined>(agent?.effort);
  const [category, setCategory] = useState(agent?.category || "general");
  const [prompt, setPrompt] = useState(
    workflowOverrides?.systemPrompt ?? agent?.prompt ?? "",
  );
  const [selectedTools, setSelectedTools] = useState<Set<string>>(
    new Set(agent?.tools || []),
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    agent?.skills || [],
  );
  const [availableTools, setAvailableTools] = useState<ToolInfo[]>([]);
  const [availableSnippets, setAvailableSnippets] = useState<SnippetInfo[]>([]);
  const [showSkillPicker, setShowSkillPicker] = useState(false);

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

  const toggleTool = (toolName: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) next.delete(toolName);
      else next.add(toolName);
      return next;
    });
  };

  const handleSave = () => {
    if (workflowMode && onSaveOverrides) {
      // Only include fields that differ from the base agent
      const overrides: WorkflowNodeOverrides = {};
      if (prompt !== (agent?.prompt ?? "")) overrides.systemPrompt = prompt;
      if (model !== (agent?.model ?? "opus")) overrides.model = model;
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
      tools: [...selectedTools],
      skills: selectedSkills,
    });
  };

  const builtinTools = availableTools.filter((t) => t.type === "builtin");
  const mcpTools = availableTools.filter((t) => t.type === "mcp");
  const pluginTools = availableTools.filter((t) => t.type === "plugin");

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

      <div className="grid grid-cols-[5fr_7fr] gap-2">
        <div>
          <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
            Model
          </label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-7 text-xs mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!workflowMode && (
          <div className="min-w-0">
            <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
              Effort
            </label>
            <EffortPicker value={effort} onChange={setEffort} className="mt-1" />
          </div>
        )}
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
            Tools
          </label>
          <div className="mt-1 space-y-2 max-h-[140px] overflow-y-auto">
            <ToolSection
              label="Builtin"
              tools={builtinTools}
              activeColor="border-primary/50 bg-primary/10 text-primary"
              selectedTools={selectedTools}
              onToggle={toggleTool}
            />
            <ToolSection
              label="MCP Servers"
              tools={mcpTools}
              activeColor="border-chart-1/50 bg-chart-1/10 text-chart-1"
              selectedTools={selectedTools}
              onToggle={toggleTool}
            />
            <ToolSection
              label="Plugins"
              tools={pluginTools}
              activeColor="border-chart-4/50 bg-chart-4/10 text-chart-4"
              selectedTools={selectedTools}
              onToggle={toggleTool}
            />
            {availableTools.length === 0 && (
              <div className="text-meta text-text-tertiary">
                Loading tools...
              </div>
            )}
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
        <label className="text-meta uppercase tracking-wider text-muted-foreground/50">
          Prompt
        </label>
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
    </div>
  );
}
