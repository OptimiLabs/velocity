"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Pencil,
  Trash2,
  Copy,
  Wrench,
  Cpu,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Store,
  ExternalLink,
  Puzzle,
  X,
  RefreshCw,
  PanelLeftClose,
  Plus,
  ArrowUpFromLine,
} from "lucide-react";
import { useState, useEffect } from "react";
import { CATEGORY_MAP, getAgentCategory, getCategoryColor } from "@/lib/agents/categories";
import type { Agent } from "@/types/agent";
import type { WorkflowNodeOverrides } from "@/types/workflow";
import {
  getAgentModelDisplay,
  INHERIT_MODEL_HELP,
} from "@/lib/agents/model-display";

interface SnippetInfo {
  id: string;
  name: string;
}

interface AgentDetailViewProps {
  agent: Agent;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleEnabled?: (name: string, enabled: boolean) => void;
  onClone?: (agent: Agent) => void;
  onDetachSkill?: (agentName: string, skillId: string) => void;
  onRePull?: (agent: Agent) => void;
  inWorkspace?: boolean;
  onRemoveFromWorkspace?: () => void;
  onAddToWorkspace?: () => void;
  hideDelete?: boolean;
  compactForWorkflow?: boolean;
  workflowOverrides?: WorkflowNodeOverrides;
  onPromote?: () => void;
}

export function AgentDetailView({
  agent,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleEnabled,
  onClone,
  onDetachSkill,
  onRePull,
  inWorkspace,
  onRemoveFromWorkspace,
  onAddToWorkspace,
  hideDelete,
  compactForWorkflow = false,
  workflowOverrides,
  onPromote,
}: AgentDetailViewProps) {
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [snippetNames, setSnippetNames] = useState<Map<string, string>>(
    new Map(),
  );

  // Fetch snippet names for attached skills
  useEffect(() => {
    if (!agent.skills?.length) return;
    fetch("/api/snippets")
      .then((r) => r.json())
      .then((snippets: SnippetInfo[]) => {
        const map = new Map<string, string>();
        for (const s of snippets) map.set(s.id, s.name);
        setSnippetNames(map);
      })
      .catch((err) => console.debug('[AGENTS]', err.message));
  }, [agent.skills]);

  const behaviors = agent.prompt
    .split("\n")
    .filter(
      (line) => line.trim().startsWith("-") || line.trim().startsWith("*"),
    )
    .slice(0, 5)
    .map((line) => line.replace(/^[\s-*]+/, "").trim());

  const isDisabled = agent.enabled === false;
  const isPreset = agent.source === "preset";
  const isMarketplace = agent.source === "marketplace";
  const modelInfo = getAgentModelDisplay(
    workflowOverrides?.model ?? agent.model,
    agent.provider,
  );
  const effectiveEffort = workflowOverrides?.effort ?? agent.effort;

  return (
    <div className="p-4 space-y-4">
      {/* Source badge + enable toggle */}
      <div className="flex items-center gap-2">
        {agent.scope === "workflow" && (
          <Badge variant="outline" className="text-micro gap-1 text-amber-500 border-amber-500/30">
            Workflow-scoped
          </Badge>
        )}
        {isMarketplace && (
          <Badge variant="outline" className="text-micro gap-1 text-blue-500 dark:text-blue-400">
            <Store size={9} />
            Marketplace
          </Badge>
        )}
        {isMarketplace && agent.sourceUrl && (
          <a
            href={agent.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-micro text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-0.5"
          >
            Source <ExternalLink size={8} />
          </a>
        )}
        {onToggleEnabled && (
          <StatusPill
            enabled={!isDisabled}
            onToggle={() => onToggleEnabled(agent.name, !!isDisabled)}
            className="ml-auto"
            title={isDisabled ? "Enable agent" : "Disable agent"}
          />
        )}
      </div>

      {/* Workflow override badge */}
      {workflowOverrides && Object.keys(workflowOverrides).length > 0 && (
        <Badge variant="outline" className="text-micro gap-1 text-chart-1 border-chart-1/30">
          Workflow Override
        </Badge>
      )}

      {/* Description */}
      <div>
        <p className="text-xs text-muted-foreground">
          {workflowOverrides?.description ?? agent.description ?? "No description"}
        </p>
      </div>

      {/* Model / Effort / Category row */}
      <div className="flex flex-wrap gap-1.5">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant={modelInfo.isInherited ? "secondary" : "outline"}
                className="text-meta gap-1"
              >
                <Cpu size={9} />
                {modelInfo.isInherited ? "inherit" : modelInfo.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {modelInfo.isInherited ? (
                INHERIT_MODEL_HELP
              ) : modelInfo.version && modelInfo.version !== modelInfo.label ? (
                <span>
                  Version: <span className="font-mono">{modelInfo.version}</span>
                </span>
              ) : (
                <span>
                  Model: <span className="font-mono">{modelInfo.label}</span>
                </span>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {!modelInfo.isInherited &&
          modelInfo.version &&
          modelInfo.version !== modelInfo.label && (
            <Badge variant="outline" className="text-meta font-mono">
              {modelInfo.version}
            </Badge>
          )}
        {effectiveEffort && (
          <Badge variant="outline" className="text-meta">
            effort: {effectiveEffort}
          </Badge>
        )}
        {(() => {
          const cat = getAgentCategory(agent);
          const catInfo = CATEGORY_MAP[cat];
          if (!catInfo) return null;
          const CatIcon = catInfo.icon;
          const catColor = getCategoryColor(cat);
          return (
            <Badge variant="outline" className="text-meta gap-1">
              <CatIcon size={9} className={catColor} />
              {catInfo.label}
            </Badge>
          );
        })()}
        {agent.tags?.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-micro">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Tools */}
      {agent.tools && agent.tools.length > 0 && (
        <div>
          <div className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Tools ({agent.tools.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {agent.tools.map((tool) => (
              <span
                key={tool}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta font-mono border border-border/50 text-muted-foreground"
              >
                <Wrench size={8} />
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {agent.skills && agent.skills.length > 0 && (
        <div>
          <div className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Skills ({agent.skills.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {agent.skills.map((skillId) => (
              <span
                key={skillId}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-meta border border-chart-4/30 bg-chart-4/5 text-chart-4"
              >
                <Puzzle size={8} />
                {snippetNames.get(skillId) || skillId}
                {onDetachSkill && (
                  <button
                    onClick={() => onDetachSkill(agent.name, skillId)}
                    className="hover:text-destructive transition-colors ml-0.5"
                  >
                    <X size={8} />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Key behaviors */}
      {behaviors.length > 0 && (
        <div>
          <div className="text-meta uppercase tracking-wider text-muted-foreground/50 mb-1.5">
            Key Behaviors
          </div>
          <div className="space-y-0.5">
            {behaviors.map((b, i) => (
              <div key={i} className="text-xs text-muted-foreground/60">
                · {b}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt preview */}
      <div>
        <button
          onClick={() => setPromptExpanded(!promptExpanded)}
          className="flex items-center gap-1 text-meta uppercase tracking-wider text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {promptExpanded ? (
            <ChevronDown size={10} />
          ) : (
            <ChevronRight size={10} />
          )}
          Prompt
        </button>
        {promptExpanded && (
          <pre className="mt-1.5 text-meta text-muted-foreground/60 font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
            {workflowOverrides?.systemPrompt ?? agent.prompt}
          </pre>
        )}
        {!promptExpanded && (workflowOverrides?.systemPrompt ?? agent.prompt) && (
          <p className="mt-1 text-meta text-text-tertiary truncate">
            {(workflowOverrides?.systemPrompt ?? agent.prompt).slice(0, 100)}...
          </p>
        )}
      </div>

      {/* Usage stats */}
      {agent.usageCount !== undefined && agent.usageCount > 0 && (
        <div className="flex items-center gap-3 text-meta text-text-tertiary pt-2 border-t border-border/20">
          <span className="flex items-center gap-1">
            <BarChart3 size={9} />
            {agent.usageCount} runs
          </span>
          {agent.avgCost !== undefined && agent.avgCost > 0 && (
            <span>avg ${agent.avgCost.toFixed(3)}</span>
          )}
          {agent.effectiveness !== undefined && (
            <span>{Math.round(agent.effectiveness * 100)}% success</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-border/30">
        {inWorkspace && onRemoveFromWorkspace && !compactForWorkflow && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onRemoveFromWorkspace}
          >
            <PanelLeftClose size={10} />
            Remove
          </Button>
        )}
        {!inWorkspace && onAddToWorkspace && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onAddToWorkspace}
          >
            <Plus size={10} />
            Add to Workspace
          </Button>
        )}

        {isPreset && onClone ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onClone(agent)}
          >
            <Copy size={10} />
            Clone & Customize
          </Button>
        ) : (
          <>
            {!compactForWorkflow && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onEdit}
              >
                <Pencil size={10} />
                Edit
              </Button>
            )}
            {!compactForWorkflow && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onDuplicate}
              >
                <Copy size={10} />
                Duplicate
              </Button>
            )}
          </>
        )}

        {agent.scope === "workflow" && onPromote && !compactForWorkflow && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onPromote}
          >
            <ArrowUpFromLine size={10} />
            Promote to Global
          </Button>
        )}

        {isMarketplace && onRePull && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => onRePull(agent)}
          >
            <RefreshCw size={10} />
            Re-pull
          </Button>
        )}

        {!isPreset && !hideDelete && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 size={10} />
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
