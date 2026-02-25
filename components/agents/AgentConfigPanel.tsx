"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Wrench,
  Server,
  Plug,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agent";
import type { EffortLevel } from "@/components/console/EffortPicker";
import {
  getAgentModelDisplay,
  getAgentModelOptionLabel,
  INHERIT_MODEL_HELP,
} from "@/lib/agents/model-display";

interface ToolInfo {
  name: string;
  type: "builtin" | "mcp" | "plugin" | "skill";
  description?: string;
}

interface AgentConfigPanelProps {
  config: Partial<Agent>;
  onChange: (config: Partial<Agent>) => void;
  availableTools: ToolInfo[];
}

const MODELS = ["opus", "sonnet", "haiku"] as const;
const EFFORT_OPTIONS: { value: EffortLevel | undefined; label: string }[] = [
  { value: undefined, label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
];
const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#7c3aed",
  "#ec4899",
  "#06b6d4",
];

function ToolIcon({ type }: { type: string }) {
  if (type === "mcp") return <Server size={9} className="text-chart-1" />;
  if (type === "plugin") return <Plug size={9} className="text-chart-4" />;
  return <Wrench size={9} className="text-muted-foreground" />;
}

export function AgentConfigPanel({
  config,
  onChange,
  availableTools,
}: AgentConfigPanelProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const selectedTools = new Set(config.tools || []);
  const provider = config.provider;
  const selectedModel = typeof config.model === "string" ? config.model : "";
  const selectedModelInfo = getAgentModelDisplay(selectedModel, provider);

  const builtinTools = availableTools.filter((t) => t.type === "builtin");
  const mcpTools = availableTools.filter((t) => t.type === "mcp");
  const pluginTools = availableTools.filter((t) => t.type === "plugin");

  // Auto-expand prompt when it first gets content
  useEffect(() => {
    if (config.prompt && !promptExpanded) {
      setPromptExpanded(true);
    }
    // Only trigger on prompt changes, not on promptExpanded
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.prompt]);

  const toggleTool = (toolName: string) => {
    const tools = new Set(config.tools || []);
    if (tools.has(toolName)) tools.delete(toolName);
    else tools.add(toolName);
    onChange({ ...config, tools: [...tools] });
  };

  const ToolChips = ({
    tools,
    activeColor,
    label,
  }: {
    tools: ToolInfo[];
    activeColor: string;
    label: string;
  }) => {
    if (tools.length === 0) return null;
    return (
      <div>
        <div className="text-[10px] text-muted-foreground/50 mb-0.5">
          {label}
        </div>
        <div className="flex flex-wrap gap-0.5">
          {tools.map((tool) => (
            <button
              key={tool.name}
              onClick={() => toggleTool(tool.name)}
              title={tool.description}
              className={cn(
                "flex items-center gap-0.5 px-1 py-px rounded text-[10px] font-mono border transition-colors",
                selectedTools.has(tool.name)
                  ? `${activeColor} text-primary`
                  : "border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground",
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
    <div className="space-y-2.5 text-xs">
      {/* Name */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
          Name
        </label>
        <Input
          value={config.name || ""}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          placeholder="agent-name"
          className="h-7 text-xs font-mono mt-0.5"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
          Description
        </label>
        <Input
          value={config.description || ""}
          onChange={(e) => onChange({ ...config, description: e.target.value })}
          placeholder="Brief description"
          className="h-7 text-xs mt-0.5"
        />
      </div>

      {/* Model + Effort row */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
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
                      <Info size={10} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    {INHERIT_MODEL_HELP}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          </label>
          <div className="inline-flex items-center rounded-md border border-input bg-transparent p-0.5 gap-0.5 mt-0.5 w-full">
            {(["", ...MODELS] as const).map((m) => (
              <button
                key={m || "__inherit__"}
                onClick={() =>
                  onChange({ ...config, model: m || undefined })
                }
                className={cn(
                  "flex-1 px-1.5 py-0.5 text-[11px] rounded-[3px] transition-colors capitalize",
                  m
                    ? selectedModel === m
                    : selectedModelInfo.isInherited
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {m
                  ? getAgentModelOptionLabel(m, provider)
                  : "inherit"}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground font-mono">
            {selectedModelInfo.isInherited
              ? "Inherit from provider defaults"
              : selectedModelInfo.version &&
                  selectedModelInfo.version !== selectedModelInfo.label
                ? `Version: ${selectedModelInfo.version}`
                : `Model: ${selectedModelInfo.label}`}
          </p>
        </div>
        <div className="flex-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
            Effort
          </label>
          <div className="inline-flex items-center rounded-md border border-input bg-transparent p-0.5 gap-0.5 mt-0.5 w-full">
            {EFFORT_OPTIONS.map((o) => (
              <button
                key={o.label}
                onClick={() => onChange({ ...config, effort: o.value })}
                className={cn(
                  "flex-1 px-1.5 py-0.5 text-[11px] rounded-[3px] transition-colors",
                  (config.effort ?? undefined) === o.value
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
          Color
        </label>
        <div className="flex gap-1.5 mt-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ ...config, color: c })}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-all",
                config.color === c
                  ? "border-foreground scale-110"
                  : "border-transparent",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Tools */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium">
          Tools
          {selectedTools.size > 0 && (
            <span className="ml-1 text-foreground/40">
              ({selectedTools.size})
            </span>
          )}
        </label>
        <div className="mt-0.5 space-y-1 max-h-[120px] overflow-y-auto">
          <ToolChips
            label="Builtin"
            tools={builtinTools}
            activeColor="border-primary/50 bg-primary/10"
          />
          <ToolChips
            label="MCP"
            tools={mcpTools}
            activeColor="border-chart-1/50 bg-chart-1/10"
          />
          <ToolChips
            label="Plugins"
            tools={pluginTools}
            activeColor="border-chart-4/50 bg-chart-4/10"
          />
          {availableTools.length === 0 && (
            <span className="text-[10px] text-text-quaternary">
              Loading tools...
            </span>
          )}
        </div>
      </div>

      {/* Prompt (collapsible) */}
      <div>
        <button
          onClick={() => setPromptExpanded(!promptExpanded)}
          className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium hover:text-muted-foreground transition-colors"
        >
          {promptExpanded ? (
            <ChevronDown size={10} />
          ) : (
            <ChevronRight size={10} />
          )}
          Prompt
          {config.prompt && (
            <span className="text-foreground/40 normal-case tracking-normal">
              ({config.prompt.length} chars)
            </span>
          )}
        </button>
        {promptExpanded && (
          <Textarea
            value={config.prompt || ""}
            onChange={(e) => onChange({ ...config, prompt: e.target.value })}
            placeholder="System prompt for the agent..."
            className="mt-0.5 min-h-[140px] resize-y text-[11px] font-mono leading-relaxed"
          />
        )}
      </div>
    </div>
  );
}
