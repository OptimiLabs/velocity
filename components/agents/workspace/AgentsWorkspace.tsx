"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAgents, useSaveAgent, useDeleteAgent } from "@/hooks/useAgents";
import {
  useWorkflows,
  useDeleteWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
} from "@/hooks/useWorkflows";
import { useSidebarResize, useResizablePanel } from "@/hooks/useSidebarResize";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { WorkspaceToolbar } from "./WorkspaceToolbar";
import { InventorySidebar } from "./InventorySidebar";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const WorkspaceCanvas = dynamic(
  () => import("./WorkspaceCanvas").then((m) => m.WorkspaceCanvas),
  { ssr: false, loading: () => <Skeleton className="flex-1" /> }
);
import { DetailPanel } from "./DetailPanel";
import { CanvasBuildToolbar } from "./CanvasBuildToolbar";
import { BulkActionToolbar } from "./BulkActionToolbar";
import { SaveWorkflowDialog } from "./SaveWorkflowDialog";
import { DeployDialog } from "./DeployDialog";
import { DeployDialog as CommandDeployDialog } from "@/components/workflows/DeployDialog";
import { ActivationContextModal } from "@/components/workflows/ActivationContextModal";
import { AgentEditor } from "../AgentEditor";
import { AgentBuilderChat } from "../AgentBuilderChat";
import { AgentCard } from "../AgentCard";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import type { Edge } from "@xyflow/react";
import { parseInstanceId } from "@/lib/workflow/instance";

export function AgentsWorkspace() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // URL state
  const view = (searchParams.get("view") as "canvas" | "list") || "canvas";
  const selectedParam = searchParams.get("selected");

  const selection = useMemo(() => {
    if (!selectedParam) return null;
    const [type, ...rest] = selectedParam.split(":");
    return { type, id: rest.join(":") };
  }, [selectedParam]);

  // Data
  const { data: agents = [] } = useAgents();
  const { data: workflows = [] } = useWorkflows();
  const saveAgent = useSaveAgent();
  const deleteAgent = useDeleteAgent();
  const deleteWorkflow = useDeleteWorkflow();
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();

  // Sidebar resize
  const { sidebarWidth, sidebarCollapsed, handleDragStart, toggleCollapse } =
    useSidebarResize();

  // Detail panel resize
  const { width: detailWidth, handleDragStart: handleDetailDragStart } =
    useResizablePanel({
      minWidth: 300,
      maxWidth: 700,
      defaultWidth: 380,
      storageKey: "agents-detail-panel-width",
      side: "right",
    });

  // Detail mode + canvas mode + workspace
  const {
    setDetailMode,
    buildWorkflowId,
    setBuildWorkflowId,
    addToWorkspace,
    removeFromWorkspace,
    buildWorkspaceAgents,
    addToBuildWorkspace,
    removeFromBuildWorkspace,
  } = useWorkspaceStore();

  // Dialogs
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorAgent, setEditorAgent] = useState<Partial<Agent> | null>(null);
  const [builderChatOpen, setBuilderChatOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deployWorkflowId, setDeployWorkflowId] = useState<string | null>(null);
  const [commandDeployId, setCommandDeployId] = useState<string | null>(null);
  const [activationContextWorkflowId, setActivationContextWorkflowId] =
    useState<string | null>(null);

  // Canvas edges tracking for build mode
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);

  // Multi-select state (local, not URL-driven)
  const [multiSelectedIds, setMultiSelectedIds] = useState<Set<string>>(
    new Set(),
  );
  const [clearSelectionKey, setClearSelectionKey] = useState(0);
  const hasMultiSelection = multiSelectedIds.size >= 2;

  // Hydration guard — defer localStorage reads until after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Agents on canvas (always editable — no browse mode)
  const activeAgentNames = buildWorkspaceAgents;
  const activeAgentsList = useMemo(
    () => agents.filter((a) => activeAgentNames.includes(a.name)),
    [agents, activeAgentNames],
  );

  // URL updaters
  const setView = useCallback(
    (v: "canvas" | "list") => {
      const params = new URLSearchParams(searchParams.toString());
      if (v === "canvas") params.delete("view");
      else params.set("view", v);
      router.push(`/workflows?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setSelected = useCallback(
    (type: string, id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("selected", `${type}:${id}`);
      router.push(`/workflows?${params.toString()}`);
      setDetailMode("view");
    },
    [router, searchParams, setDetailMode],
  );

  const clearSelected = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("selected");
    router.push(`/workflows?${params.toString()}`);
  }, [router, searchParams]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";

      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          '[placeholder*="Search"]',
        );
        input?.focus();
      }
      if (e.key === "Escape") {
        setMultiSelectedIds(new Set());
        setClearSelectionKey((k) => k + 1);
        clearSelected();
      }
      if (
        !isInput &&
        e.key === "e" &&
        !e.metaKey &&
        !e.ctrlKey &&
        selection?.type === "agent"
      ) {
        setDetailMode("edit");
      }
      // Cmd+S → save workflow
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSaveDialogOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    clearSelected,
    selection,
    setDetailMode,
    view,
  ]);

  // Handlers
  const handleCreateAgent = () => {
    setBuilderChatOpen(true);
  };

  const handleSaveAgent = (agent: Partial<Agent>) => {
    const isNew = agent.name && !agents.some((a) => a.name === agent.name);
    saveAgent.mutate(agent, {
      onSuccess: () => {
        if (isNew && agent.name) addToWorkspace(agent.name);
      },
    });
  };

  const handleAIGenerated = (agent: Partial<Agent>) => {
    setEditorAgent(agent);
    setEditorOpen(true);
  };

  const handleDropAgent = (
    name: string,
    position: { x: number; y: number },
  ) => {
    try {
      const key = "agent-canvas-positions";
      const positions = JSON.parse(localStorage.getItem(key) || "{}");
      positions[name] = position;
      localStorage.setItem(key, JSON.stringify(positions));
    } catch {
      /* ignore */
    }
    if (!buildWorkspaceAgents.includes(name)) addToBuildWorkspace(name);
    setSelected("agent", name);
  };

  const handleListEdit = (agent: Agent) => {
    setEditorAgent(agent);
    setEditorOpen(true);
  };

  const resolveAgentContext = useCallback(
    (agentName: string) => {
      const normalizedName = parseInstanceId(agentName);
      const agent = agents.find((a) => a.name === normalizedName);
      return {
        name: normalizedName,
        provider: (agent?.provider ?? "claude") as ConfigProvider,
        projectPath:
          agent?.scope === "project" ? (agent.projectPath ?? undefined) : undefined,
      };
    },
    [agents],
  );

  // Toggle agent enabled/disabled
  const handleToggleAgent = useCallback(
    async (name: string, enabled: boolean) => {
      const context = resolveAgentContext(name);
      try {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: context.provider,
            name: context.name,
            enabled,
            projectPath: context.projectPath,
          }),
        });
        if (!res.ok) throw new Error("Failed to toggle agent");
        queryClient.invalidateQueries({ queryKey: ["agents"] });
      } catch {
        toast.error("Failed to toggle agent");
      }
    },
    [queryClient, resolveAgentContext],
  );

  // Attach/detach skills
  const handleAttachSkill = useCallback(
    async (agentName: string, skillId: string) => {
      const context = resolveAgentContext(agentName);
      try {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: context.provider,
            name: context.name,
            attachSkill: skillId,
            projectPath: context.projectPath,
          }),
        });
        if (!res.ok) throw new Error("Failed to attach skill");
        queryClient.invalidateQueries({ queryKey: ["agents"] });
        toast.success(`Skill attached to ${context.name}`);
      } catch {
        toast.error("Failed to attach skill");
      }
    },
    [queryClient, resolveAgentContext],
  );

  const handleDetachSkill = useCallback(
    async (agentName: string, skillId: string) => {
      const context = resolveAgentContext(agentName);
      try {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: context.provider,
            name: context.name,
            detachSkill: skillId,
            projectPath: context.projectPath,
          }),
        });
        if (!res.ok) throw new Error("Failed to detach skill");
        queryClient.invalidateQueries({ queryKey: ["agents"] });
        toast.success("Skill detached");
      } catch {
        toast.error("Failed to detach skill");
      }
    },
    [queryClient, resolveAgentContext],
  );

  // Clone preset agent
  const handleCloneAgent = useCallback((agent: Agent) => {
    setEditorAgent({
      ...agent,
      name: `${agent.name}-custom`,
      source: "custom",
      filePath: "",
    });
    setEditorOpen(true);
  }, []);

  // Add to workspace (or fork if already present)
  const handleAddToWorkspace = useCallback(
    (agent: Agent) => {
      if (buildWorkspaceAgents.includes(agent.name)) {
        // Already in workspace — fork with new name
        const baseName = agent.name.replace(/-\d+$/, "");
        const existingCopies = agents.filter(
          (a) =>
            a.name === baseName ||
            a.name.match(new RegExp(`^${baseName}-\\d+$`)),
        );
        const nextNum = existingCopies.length + 1;
        setEditorAgent({
          ...agent,
          name: `${baseName}-${nextNum}`,
          source: "custom",
          filePath: "",
        });
        setEditorOpen(true);
      } else {
        addToBuildWorkspace(agent.name);
      }
    },
    [buildWorkspaceAgents, agents, addToBuildWorkspace],
  );

  // Remove from workspace
  const handleRemoveFromWorkspace = useCallback(
    (name: string) => {
      removeFromBuildWorkspace(name);
      try {
        const positions = JSON.parse(
          localStorage.getItem("agent-canvas-positions") || "{}",
        );
        delete positions[name];
        localStorage.setItem(
          "agent-canvas-positions",
          JSON.stringify(positions),
        );
      } catch {
        /* ignore */
      }
      clearSelected();
    },
    [removeFromBuildWorkspace, clearSelected],
  );

  // Re-pull marketplace agent
  const handleRePullAgent = useCallback(
    async (agent: Agent) => {
      if (!agent.sourceUrl) {
        toast.error("No source URL for this agent");
        return;
      }
      toast.info("Checking for updates...");
      // In practice this would fetch from the sourceUrl
      // For now just invalidate to refresh
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    [queryClient],
  );

  // Multi-select: rubber-band or Cmd+click selection from canvas
  const handleCanvasSelectionChange = useCallback(
    (nodeIds: string[]) => {
      const newSet = new Set(nodeIds);
      setMultiSelectedIds(newSet);
      if (nodeIds.length === 1) {
        setSelected("agent", parseInstanceId(nodeIds[0]));
      } else if (nodeIds.length === 0) {
        clearSelected();
      }
    },
    [setSelected, clearSelected],
  );

  // Single-click on node: collapse multi-select → single
  const handleCanvasNodeSelect = useCallback(
    (nodeId: string) => {
      setSelected("agent", parseInstanceId(nodeId));
      setMultiSelectedIds(new Set([nodeId]));
    },
    [setSelected],
  );

  // Bulk action: remove selected agents from canvas
  const handleBulkRemoveFromCanvas = useCallback(() => {
    for (const id of multiSelectedIds) {
      const name = parseInstanceId(id);
      removeFromBuildWorkspace(name);
      try {
        const positions = JSON.parse(
          localStorage.getItem("agent-canvas-positions") || "{}",
        );
        delete positions[name];
        localStorage.setItem(
          "agent-canvas-positions",
          JSON.stringify(positions),
        );
      } catch {
        /* ignore */
      }
    }
    setMultiSelectedIds(new Set());
    setClearSelectionKey((k) => k + 1);
    clearSelected();
  }, [multiSelectedIds, removeFromBuildWorkspace, clearSelected]);

  // Bulk action: delete selected agents
  const handleBulkDeleteAgents = useCallback(() => {
    for (const id of multiSelectedIds) {
      const name = parseInstanceId(id);
      const agent = agents.find((a) => a.name === name);
      if (agent?.source === "preset") continue;
      deleteAgent.mutate({ name });
      removeFromWorkspace(name);
    }
    setMultiSelectedIds(new Set());
    setClearSelectionKey((k) => k + 1);
    clearSelected();
  }, [multiSelectedIds, agents, deleteAgent, removeFromWorkspace, clearSelected]);

  // Canvas edge changes
  const handleEdgesChange = useCallback((edges: Edge[]) => {
    setCanvasEdges(edges);
  }, []);

  // Clear all edges
  const handleClearEdges = useCallback(() => {
    setCanvasEdges([]);
    try {
      localStorage.removeItem("agent-canvas-edges");
    } catch { /* ignore */ }
  }, []);

  // Clear entire canvas (edges + agents)
  const handleClearCanvas = useCallback(() => {
    setCanvasEdges([]);
    try {
      localStorage.removeItem("agent-canvas-edges");
      localStorage.removeItem("agent-canvas-positions");
    } catch { /* ignore */ }
    useWorkspaceStore.getState().clearBuildWorkspace();
    clearSelected();
  }, [clearSelected]);

  // Save workflow from canvas
  const handleSaveWorkflow = useCallback(
    (data: {
      name: string;
      description: string;
      cwd: string;
      nodes: import("@/types/workflow").WorkflowNode[];
      edges: import("@/types/workflow").WorkflowEdge[];
    }) => {
      if (buildWorkflowId) {
        updateWorkflow.mutate(
          { id: buildWorkflowId, data },
          {
            onSuccess: (wf) => {
              toast.success("Workflow updated");
              // Open activation context modal if never configured
              if (!wf.commandName) {
                setActivationContextWorkflowId(wf.id);
              }
            },
          },
        );
      } else {
        createWorkflow.mutate(data, {
          onSuccess: (wf) => {
            setBuildWorkflowId(wf.id);
            setSelected("workflow", wf.id);
            // Always open modal for new workflows
            setActivationContextWorkflowId(wf.id);
          },
        });
      }
    },
    [
      buildWorkflowId,
      createWorkflow,
      updateWorkflow,
      setBuildWorkflowId,
      setSelected,
    ],
  );

  // Deploy workflow — navigate to console with workflow param
  const handleDeploy = useCallback(
    (workflowId: string) => {
      router.push(`/?workflow=${workflowId}`);
    },
    [router],
  );

  // Save activation context (from modal)
  const handleSaveActivationContext = useCallback(
    (values: {
      commandName: string;
      commandDescription: string;
      activationContext: string;
      autoSkillEnabled: boolean;
    }) => {
      if (!activationContextWorkflowId) return;
      updateWorkflow.mutate({
        id: activationContextWorkflowId,
        data: values,
      });
    },
    [activationContextWorkflowId, updateWorkflow],
  );

// Canvas nodes for save dialog (defer localStorage read until after mount to avoid hydration mismatch)
  const canvasNodesForSave = useMemo(() => {
    let positions: Record<string, { x: number; y: number }> = {};
    if (mounted) {
      try {
        positions = JSON.parse(
          localStorage.getItem("agent-canvas-positions") || "{}",
        );
      } catch {}
    }
    return activeAgentsList.map((a, i) => ({
      id: a.name,
      position: positions[a.name] ?? {
        x: (i % 4) * 240,
        y: Math.floor(i / 4) * 180,
      },
    }));
  }, [activeAgentsList, mounted]);

  return (
    <div className="flex flex-col h-full">
      <WorkspaceToolbar
        view={view}
        onViewChange={setView}
        onCreateAgent={handleCreateAgent}
      />

      <div className="flex flex-1 overflow-hidden">
        <InventorySidebar
          agents={agents}
          selectedId={selection?.id ?? null}
          selectedType={selection?.type ?? null}
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          onSelectAgent={(name) => setSelected("agent", name)}
          onSelectPrompt={(filename) => setSelected("prompt", filename)}
          onToggleCollapse={toggleCollapse}
          onDragStart={handleDragStart}
          onToggleAgent={handleToggleAgent}
          workspaceAgentNames={new Set(activeAgentNames)}
          onAddToWorkspace={handleAddToWorkspace}
        />

        {/* Center: Canvas or List */}
        {view === "canvas" ? (
          <div className="flex-1 relative">
            <WorkspaceCanvas
              agents={activeAgentsList}
              activeWorkflow={null}
              selectedId={selection?.type === "agent" ? selection.id : null}
              onSelectNode={handleCanvasNodeSelect}
              onDropAgent={handleDropAgent}
              onAttachSkill={handleAttachSkill}
              onEdgesChange={handleEdgesChange}
              onSelectionChange={handleCanvasSelectionChange}
              multiSelectedIds={multiSelectedIds}
              clearSelectionKey={clearSelectionKey}
              hasMultiSelection={hasMultiSelection}
              onEditAgent={(name) => {
                setSelected("agent", name);
                setEditorAgent(agents.find((a) => a.name === name) || null);
                setEditorOpen(true);
              }}
              onDeleteAgent={(name) => {
                deleteAgent.mutate({ name });
                removeFromWorkspace(name);
              }}
              onRemoveFromWorkspace={handleRemoveFromWorkspace}
              onDuplicateAgent={(name) => {
                const agent = agents.find((a) => a.name === name);
                if (agent) {
                  setEditorAgent({ ...agent, name: `${agent.name}-copy`, source: "custom", filePath: "" });
                  setEditorOpen(true);
                }
              }}
            />

            {/* Bulk selection toolbar */}
            {hasMultiSelection && (
              <BulkActionToolbar
                count={multiSelectedIds.size}
                hasPresetSelected={Array.from(multiSelectedIds).some((id) => {
                  const name = parseInstanceId(id);
                  return agents.find((a) => a.name === name)?.source === "preset";
                })}
                onRemoveFromCanvas={handleBulkRemoveFromCanvas}
                onDeleteAgents={handleBulkDeleteAgents}
                onClear={() => {
                  setMultiSelectedIds(new Set());
                  setClearSelectionKey((k) => k + 1);
                }}
              />
            )}

            {/* Build toolbar overlay */}
            <CanvasBuildToolbar
              edgeCount={canvasEdges.length}
              nodeCount={activeAgentsList.filter((a) => a.enabled !== false).length}
              hasWorkflow={!!buildWorkflowId}
              onSaveWorkflow={() => setSaveDialogOpen(true)}
              onDeploy={() => {
                if (buildWorkflowId) setDeployWorkflowId(buildWorkflowId);
              }}
              onClearEdges={handleClearEdges}
              onClearCanvas={handleClearCanvas}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {activeAgentsList.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    No agents in workspace
                  </p>
                  <p className="text-xs text-muted-foreground/50">
                    Drag agents from the sidebar to add them
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {activeAgentsList.map((agent) => (
                  <div
                    key={agent.name}
                    onClick={() => setSelected("agent", agent.name)}
                    className="cursor-pointer"
                  >
                    <AgentCard
                      agent={agent}
                      onEdit={handleListEdit}
                      onDelete={(name) => {
                        deleteAgent.mutate({ name });
                      }}
                      onDuplicate={(a) => {
                        setEditorAgent({ ...a, name: `${a.name}-copy` });
                        setEditorOpen(true);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <DetailPanel
          selection={hasMultiSelection ? null : selection}
          onClose={clearSelected}
          agents={agents}
          workflows={workflows}
          onSaveAgent={handleSaveAgent}
          onDeleteAgent={(name) => {
            deleteAgent.mutate({ name });
            removeFromWorkspace(name);
          }}
          onDeleteWorkflow={(id) => deleteWorkflow.mutate(id)}
          onLaunchWorkflow={(id) => router.push(`/?workflow=${id}`)}
          onToggleAgent={handleToggleAgent}
          onCloneAgent={handleCloneAgent}
          onDetachSkill={handleDetachSkill}
          onRePullAgent={handleRePullAgent}
          onDeployWorkflow={(id) => setDeployWorkflowId(id)}
          onDeployWorkflowAsCommand={(id) => setCommandDeployId(id)}
          onEditActivationContext={(id) => setActivationContextWorkflowId(id)}
          onRenameWorkflow={(id, name) =>
            updateWorkflow.mutate({ id, data: { name } })
          }
          workspaceAgentNames={new Set(activeAgentNames)}
          onRemoveFromWorkspace={handleRemoveFromWorkspace}
          onAddToWorkspace={(name) => addToWorkspace(name)}
          width={detailWidth}
          onDragStart={handleDetailDragStart}
        />
      </div>

      {/* Dialogs */}
      <AgentEditor
        agent={editorAgent}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSave={handleSaveAgent}
      />
      <AgentBuilderChat
        open={builderChatOpen}
        onClose={() => setBuilderChatOpen(false)}
        onSave={handleAIGenerated}
        existingAgents={agents.map((a) => ({ name: a.name, description: a.description ?? "" }))}
      />
      <SaveWorkflowDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        canvasNodes={canvasNodesForSave}
        canvasEdges={canvasEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
        }))}
        agents={agents}
        onSave={handleSaveWorkflow}
      />
      <DeployDialog
        workflowId={deployWorkflowId}
        open={!!deployWorkflowId}
        onClose={() => setDeployWorkflowId(null)}
        onDeploy={handleDeploy}
      />
      <CommandDeployDialog
        workflowId={commandDeployId}
        workflowName={
          workflows.find((w) => w.id === commandDeployId)?.name ?? ""
        }
        open={!!commandDeployId}
        onOpenChange={(o) => !o && setCommandDeployId(null)}
      />
      <ActivationContextModal
        workflowId={activationContextWorkflowId}
        open={!!activationContextWorkflowId}
        onOpenChange={(o) => !o && setActivationContextWorkflowId(null)}
        initialValues={
          activationContextWorkflowId
            ? (() => {
                const wf = workflows.find(
                  (w) => w.id === activationContextWorkflowId,
                );
                return wf
                  ? {
                      commandName: wf.commandName,
                      commandDescription: wf.commandDescription,
                      activationContext: wf.activationContext,
                      autoSkillEnabled: wf.autoSkillEnabled,
                    }
                  : undefined;
              })()
            : undefined
        }
        onSave={handleSaveActivationContext}
      />
    </div>
  );
}
