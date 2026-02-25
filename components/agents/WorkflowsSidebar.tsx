"use client";

import { useState } from "react";
import {
  Bot,
  GitBranch,
  Layers,
  Sparkles,
  Store,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { cn } from "@/lib/utils";
import { AgentInventoryItem } from "./workspace/AgentInventoryItem";
import { WorkflowInventoryItem } from "./workspace/WorkflowInventoryItem";
import { parseInstanceId } from "@/lib/workflow/instance";
import type { Agent } from "@/types/agent";
import type { Workflow } from "@/types/workflow";

interface WorkflowsSidebarProps {
  agents: Agent[];
  scopedAgents?: Agent[];
  workflows: Workflow[];
  selectedId: string | null;
  selectedType: string | null;
  collapsed: boolean;
  width: number;
  onSelectAgent: (name: string) => void;
  onSelectWorkflow: (id: string) => void;
  onToggleCollapse: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onToggleAgent?: (name: string, enabled: boolean) => void;
  workspaceAgentNames?: Set<string>;
  onAddToWorkspace?: (agent: Agent) => void;
  hideWorkflows?: boolean;
  onRenameWorkflow?: (id: string, name: string) => void;
}

export function WorkflowsSidebar({
  agents,
  scopedAgents = [],
  workflows,
  selectedId,
  selectedType,
  collapsed,
  width,
  onSelectAgent,
  onSelectWorkflow,
  onToggleCollapse,
  onDragStart,
  onToggleAgent,
  workspaceAgentNames,
  onAddToWorkspace,
  hideWorkflows,
  onRenameWorkflow,
}: WorkflowsSidebarProps) {
  const searchQuery = useWorkspaceStore((s) => s.searchQuery);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    workflows: true,
    "agents:scoped": true,
    agents: true,
    "agents:custom": true,
    "agents:preset": true,
    "agents:marketplace": false,
  });

  const toggle = (s: string) =>
    setExpanded((prev) => ({ ...prev, [s]: !prev[s] }));

  const q = searchQuery.toLowerCase();
  const selectedAgentName =
    selectedType === "agent" && selectedId ? parseInstanceId(selectedId) : null;
  const selectedWorkflowId = selectedType === "workflow" ? selectedId : null;
  const filteredWorkflows = q
    ? workflows.filter((w) => w.name.toLowerCase().includes(q))
    : workflows;
  const filteredAgents = q
    ? agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q),
      )
    : agents;

  const filteredScoped = q
    ? scopedAgents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description?.toLowerCase().includes(q),
      )
    : scopedAgents;

  const customAgents = filteredAgents.filter(
    (a) => !a.source || a.source === "custom",
  );
  const presetAgents = filteredAgents.filter((a) => a.source === "preset");
  const marketplaceAgents = filteredAgents.filter(
    (a) => a.source === "marketplace",
  );

  if (collapsed) {
    return (
      <div className="w-12 border-r border-border/50 bg-card/30 backdrop-blur-sm flex flex-col items-center py-3 gap-3 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <PanelLeft size={16} />
        </button>
        {!hideWorkflows && (
          <button
            onClick={() => {
              onToggleCollapse();
              setExpanded((prev) => ({ ...prev, workflows: true }));
            }}
            title="Workflows"
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <GitBranch size={16} />
          </button>
        )}
        {scopedAgents.length > 0 && (
          <button
            onClick={() => {
              onToggleCollapse();
              setExpanded((prev) => ({ ...prev, "agents:scoped": true }));
            }}
            title="Workflow Agents"
            className="text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <Layers size={16} />
          </button>
        )}
        <button
          onClick={() => {
            onToggleCollapse();
            setExpanded((prev) => ({ ...prev, agents: true }));
          }}
          title="Inventory"
          className="text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <Bot size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="border-r border-border/50 bg-card/35 backdrop-blur-sm flex flex-col shrink-0 relative overflow-hidden"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border/30 bg-background/30">
        <div>
          <div className="text-meta uppercase tracking-wider text-muted-foreground/50 font-medium">
            Inventory
          </div>
          <div className="text-micro uppercase tracking-wider text-muted-foreground/40 mt-0.5">
            Drag agents to canvas
          </div>
        </div>
        <button
          onClick={onToggleCollapse}
          className="text-muted-foreground/50 hover:text-foreground transition-colors"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {/* Workflows — TOP */}
        {!hideWorkflows && (
          <>
            <SectionHeader
              icon={GitBranch}
              label="Workflows"
              count={filteredWorkflows.length}
              expanded={expanded.workflows ?? true}
              onToggle={() => toggle("workflows")}
            />
            {(expanded.workflows ?? true) && (
              <div className="ml-1 space-y-0.5">
                {filteredWorkflows.map((w) => (
                  <WorkflowInventoryItem
                    key={w.id}
                    workflow={w}
                    selected={selectedWorkflowId === w.id}
                    onSelect={() => onSelectWorkflow(w.id)}
                    onRename={onRenameWorkflow}
                  />
                ))}
                {filteredWorkflows.length === 0 && (
                  <p className="text-meta text-text-tertiary px-2 py-1">
                    No workflows
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* Workflow Agents (scoped) */}
        {filteredScoped.length > 0 && (
          <>
            <SectionHeader
              icon={Layers}
              label="Workflow Agents"
              count={filteredScoped.length}
              expanded={expanded["agents:scoped"] ?? true}
              onToggle={() => toggle("agents:scoped")}
            />
            {(expanded["agents:scoped"] ?? true) && (
              <div className="ml-1 space-y-0.5">
                {filteredScoped.map((a) => (
                  <AgentInventoryItem
                    key={a.name}
                    agent={a}
                    selected={selectedAgentName === a.name}
                    onSelect={() => onSelectAgent(a.name)}
                    onToggleEnabled={onToggleAgent}
                    inWorkspace={workspaceAgentNames?.has(a.name)}
                    onAddToWorkspace={
                      onAddToWorkspace ? () => onAddToWorkspace(a) : undefined
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* My Agents */}
        <SectionHeader
          icon={Bot}
          label="My Agents"
          count={customAgents.length}
          expanded={expanded["agents:custom"] ?? true}
          onToggle={() => toggle("agents:custom")}
        />
        {(expanded["agents:custom"] ?? true) && (
          <div className="ml-1 space-y-0.5">
            {customAgents.map((a) => (
              <AgentInventoryItem
                key={a.name}
                agent={a}
                selected={selectedAgentName === a.name}
                onSelect={() => onSelectAgent(a.name)}
                onToggleEnabled={onToggleAgent}
                inWorkspace={workspaceAgentNames?.has(a.name)}
                onAddToWorkspace={
                  onAddToWorkspace ? () => onAddToWorkspace(a) : undefined
                }
              />
            ))}
            {customAgents.length === 0 && (
              <p className="text-meta text-text-tertiary px-2 py-1">
                No agents
              </p>
            )}
          </div>
        )}

        {/* Presets */}
        <SectionHeader
          icon={Sparkles}
          label="Presets"
          count={presetAgents.length}
          expanded={expanded["agents:preset"] ?? true}
          onToggle={() => toggle("agents:preset")}
        />
        {(expanded["agents:preset"] ?? true) && (
          <div className="ml-1 space-y-0.5">
            {presetAgents.map((a) => (
              <AgentInventoryItem
                key={a.name}
                agent={a}
                selected={selectedAgentName === a.name}
                onSelect={() => onSelectAgent(a.name)}
                onToggleEnabled={onToggleAgent}
                inWorkspace={workspaceAgentNames?.has(a.name)}
                onAddToWorkspace={
                  onAddToWorkspace ? () => onAddToWorkspace(a) : undefined
                }
              />
            ))}
          </div>
        )}

        {/* Marketplace */}
        {marketplaceAgents.length > 0 && (
          <>
            <SectionHeader
              icon={Store}
              label="Marketplace"
              count={marketplaceAgents.length}
              expanded={expanded["agents:marketplace"] ?? false}
              onToggle={() => toggle("agents:marketplace")}
            />
            {(expanded["agents:marketplace"] ?? false) && (
              <div className="ml-1 space-y-0.5">
                {marketplaceAgents.map((a) => (
                  <AgentInventoryItem
                    key={a.name}
                    agent={a}
                    selected={selectedAgentName === a.name}
                    onSelect={() => onSelectAgent(a.name)}
                    onToggleEnabled={onToggleAgent}
                    inWorkspace={workspaceAgentNames?.has(a.name)}
                    onAddToWorkspace={
                      onAddToWorkspace
                        ? () => onAddToWorkspace(a)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Drag handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors"
        onMouseDown={onDragStart}
      />
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  label,
  count,
  expanded,
  onToggle,
}: {
  icon: typeof Bot;
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      onClick={onToggle}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs transition-colors",
        expanded
          ? "border-border/40 bg-muted/25 text-foreground/80"
          : "border-transparent text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20",
      )}
    >
      <Chevron size={12} />
      <Icon size={12} />
      <span className="uppercase tracking-wider text-meta font-medium">
        {label}
      </span>
      {count > 0 && (
        <span className="ml-auto text-meta text-text-quaternary bg-muted/50 px-1 rounded">
          {count}
        </span>
      )}
    </button>
  );
}
