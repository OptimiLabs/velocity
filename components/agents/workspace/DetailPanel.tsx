"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { InlineEditText } from "@/components/ui/inline-edit-text";
import { AgentDetailView } from "./AgentDetailView";
import { AgentDetailEdit } from "./AgentDetailEdit";
import { WorkflowDetailView } from "./WorkflowDetailView";
import { PromptDetailView } from "./PromptDetailView";
import type { Agent } from "@/types/agent";
import type { Workflow, WorkflowNodeOverrides } from "@/types/workflow";
import { parseInstanceId } from "@/lib/workflow/instance";

interface DetailPanelProps {
  selection: { type: string; id: string } | null;
  onClose: () => void;
  agents: Agent[];
  workflows: Workflow[];
  onSaveAgent: (agent: Partial<Agent>) => void;
  onDeleteAgent: (name: string) => void;
  onDeleteWorkflow: (id: string) => void;
  onLaunchWorkflow: (id: string) => void;
  onToggleAgent?: (name: string, enabled: boolean) => void;
  onCloneAgent?: (agent: Agent) => void;
  onDetachSkill?: (agentName: string, skillId: string) => void;
  onRePullAgent?: (agent: Agent) => void;
  onDeployWorkflow?: (workflowId: string) => void;
  onDeployWorkflowAsCommand?: (workflowId: string) => void;
  onEditActivationContext?: (workflowId: string) => void;
  workspaceAgentNames?: Set<string>;
  onRemoveFromWorkspace?: (name: string) => void;
  onAddToWorkspace?: (name: string) => void;
  onRenameWorkflow?: (id: string, name: string) => void;
  width?: number;
  onDragStart?: (e: React.MouseEvent) => void;
  workflowMode?: boolean;
  activeWorkflow?: Workflow | null;
  onSaveWorkflowOverrides?: (nodeId: string, overrides: WorkflowNodeOverrides) => void;
  onPromoteAgent?: (name: string) => void;
}

export function DetailPanel({
  selection,
  onClose,
  agents,
  workflows,
  onSaveAgent,
  onDeleteAgent,
  onDeleteWorkflow,
  onLaunchWorkflow,
  onToggleAgent,
  onCloneAgent,
  onDetachSkill,
  onRePullAgent,
  onDeployWorkflow,
  onDeployWorkflowAsCommand,
  onEditActivationContext,
  workspaceAgentNames,
  onRemoveFromWorkspace,
  onAddToWorkspace,
  onRenameWorkflow,
  width,
  onDragStart,
  workflowMode,
  activeWorkflow,
  onSaveWorkflowOverrides,
  onPromoteAgent,
}: DetailPanelProps) {
  const detailMode = useWorkspaceStore((s) => s.detailMode);
  const setDetailMode = useWorkspaceStore((s) => s.setDetailMode);
  const isOpen = !!selection;

  const selectedAgent =
    selection?.type === "agent"
      ? agents.find((a) => a.name === parseInstanceId(selection.id))
      : null;
  const selectedWorkflow =
    selection?.type === "workflow"
      ? workflows.find((w) => w.id === selection.id)
      : null;

  const title =
    selectedAgent?.name ?? selectedWorkflow?.name ?? selection?.id ?? "";

  return (
    <div
      className={cn(
        "border-l border-border/50 bg-card/50 flex flex-col shrink-0 relative",
        "transition-all duration-200",
        isOpen
          ? "translate-x-0"
          : "translate-x-full !w-0 border-0 overflow-hidden",
      )}
      style={{ width: isOpen ? (width ?? 380) : undefined }}
    >
      {isOpen && (
        <>
          {/* Drag handle */}
          {onDragStart && (
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30 transition-colors z-10"
              onMouseDown={onDragStart}
            />
          )}
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {selectedAgent?.color && (
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedAgent.color }}
                />
              )}
              {selectedWorkflow && onRenameWorkflow ? (
                <InlineEditText
                  value={title}
                  onSave={(name) =>
                    onRenameWorkflow(selectedWorkflow.id, name)
                  }
                />
              ) : (
                <span className="text-sm font-medium truncate">{title}</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {selection?.type === "agent" &&
              detailMode === "view" &&
              selectedAgent && (() => {
                const viewWorkflowNode = workflowMode && activeWorkflow && selection
                  ? activeWorkflow.nodes.find((n) => n.id === selection.id)
                  : null;
                return (
                  <AgentDetailView
                    agent={selectedAgent}
                    onEdit={() => setDetailMode("edit")}
                    onDelete={() => {
                      onDeleteAgent(selectedAgent.name);
                      onClose();
                    }}
                    onDuplicate={() => {
                      setDetailMode("create");
                    }}
                    onToggleEnabled={onToggleAgent}
                    onClone={onCloneAgent}
                    onDetachSkill={onDetachSkill}
                    onRePull={onRePullAgent}
                    inWorkspace={workspaceAgentNames?.has(selectedAgent.name)}
                    onRemoveFromWorkspace={() => {
                      onRemoveFromWorkspace?.(selectedAgent.name);
                      onClose();
                    }}
                    onAddToWorkspace={() =>
                      onAddToWorkspace?.(selectedAgent.name)
                    }
                    hideDelete={workflowMode}
                    workflowOverrides={viewWorkflowNode?.overrides}
                    onPromote={
                      selectedAgent.scope === "workflow" && onPromoteAgent
                        ? () => onPromoteAgent(selectedAgent.name)
                        : undefined
                    }
                  />
                );
              })()}
            {selection?.type === "agent" &&
              (detailMode === "edit" || detailMode === "create") && (() => {
                const workflowNode = workflowMode && activeWorkflow && selection
                  ? activeWorkflow.nodes.find((n) => n.id === selection.id)
                  : null;
                return (
                  <AgentDetailEdit
                    agent={detailMode === "edit" ? (selectedAgent ?? null) : null}
                    onSave={(a) => {
                      onSaveAgent(a);
                      setDetailMode("view");
                    }}
                    onCancel={() => setDetailMode("view")}
                    workflowMode={workflowMode}
                    workflowOverrides={workflowNode?.overrides}
                    onSaveOverrides={
                      workflowMode && selection && onSaveWorkflowOverrides
                        ? (overrides) => {
                            onSaveWorkflowOverrides(selection.id, overrides);
                            setDetailMode("view");
                          }
                        : undefined
                    }
                  />
                );
              })()}
            {selection?.type === "workflow" && selectedWorkflow && (
              <WorkflowDetailView
                workflow={selectedWorkflow}
                onDelete={() => {
                  onDeleteWorkflow(selectedWorkflow.id);
                  onClose();
                }}
                onLaunch={() => onLaunchWorkflow(selectedWorkflow.id)}
                onDeploy={onDeployWorkflow}
                onDeployAsCommand={onDeployWorkflowAsCommand}
                onEditActivationContext={onEditActivationContext}
              />
            )}
            {selection?.type === "prompt" && selection.id && (
              <PromptDetailView filename={selection.id} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
