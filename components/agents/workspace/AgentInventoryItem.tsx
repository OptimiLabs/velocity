"use client";

import { cn } from "@/lib/utils";
import { Wrench, Store, Plus, Puzzle } from "lucide-react";
import { AgentIcon } from "@/lib/agents/categories";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusPill } from "@/components/ui/status-pill";
import type { Agent } from "@/types/agent";
import { getAgentModelDisplay } from "@/lib/agents/model-display";

interface AgentInventoryItemProps {
  agent: Agent;
  selected: boolean;
  onSelect: () => void;
  onToggleEnabled?: (name: string, enabled: boolean) => void;
  inWorkspace?: boolean;
  onAddToWorkspace?: () => void;
}

export function AgentInventoryItem({
  agent,
  selected,
  onSelect,
  onToggleEnabled,
  inWorkspace,
  onAddToWorkspace,
}: AgentInventoryItemProps) {
  const isDisabled = agent.enabled === false;
  const modelInfo = getAgentModelDisplay(agent.model, agent.provider);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/agent-name", agent.name);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors group cursor-pointer",
        "hover:bg-muted/50",
        selected && "bg-primary/10 text-primary",
        inWorkspace && !selected && "border-l-2 border-emerald-400/40",
        isDisabled && "opacity-40",
      )}
    >
      <AgentIcon agent={agent} size={12} className="shrink-0" />
      <span className="font-mono text-xs truncate flex-1">{agent.name}</span>

      {/* Source badge */}
      {agent.source === "marketplace" && (
        <span title="Marketplace" className="shrink-0">
          <Store size={9} className="text-blue-400/60" />
        </span>
      )}

      {!modelInfo.isInherited && (
        <span className="text-meta text-muted-foreground/50 shrink-0 hidden group-hover:inline">
          {modelInfo.version && modelInfo.version !== modelInfo.label
            ? modelInfo.version
            : modelInfo.label}
        </span>
      )}
      <span className="flex items-center gap-1.5 shrink-0">
        <span
          className="text-meta text-text-tertiary flex items-center gap-0.5 min-w-[20px] justify-end"
          title={`${agent.tools?.length ?? 0} tool${(agent.tools?.length ?? 0) === 1 ? "" : "s"}`}
        >
          <Wrench size={8} />
          {agent.tools?.length ?? 0}
        </span>
        <span
          className="text-meta text-chart-4/50 flex items-center gap-0.5 min-w-[20px] justify-end"
          title={
            agent.skills && agent.skills.length > 0
              ? `${agent.skills.length} skill${agent.skills.length === 1 ? "" : "s"}: ${agent.skills.map((s) => `/${s}`).join(", ")}`
              : "0 skills"
          }
        >
          <Puzzle size={8} />
          {agent.skills?.length ?? 0}
        </span>
      </span>

      {/* Add to workspace */}
      {onAddToWorkspace && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddToWorkspace();
              }}
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted/80"
              title={inWorkspace ? "Add another instance" : "Add to workspace"}
            >
              <Plus size={10} className="text-muted-foreground/50" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {inWorkspace ? "Add another instance" : "Add to workspace"}
          </TooltipContent>
        </Tooltip>
      )}

      {/* Enable/disable toggle */}
      {onToggleEnabled && (
        <StatusPill
          enabled={!isDisabled}
          onToggle={() => onToggleEnabled(agent.name, !!isDisabled)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0"
          title={isDisabled ? "Enable agent" : "Disable agent"}
        />
      )}
    </div>
  );
}
