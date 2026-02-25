"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAgents } from "@/hooks/useAgents";
import {
  useWorkflows,
  useDeleteWorkflow,
  useCreateWorkflow,
  useUpdateWorkflow,
} from "@/hooks/useWorkflows";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const WorkspaceCanvas = dynamic(
  () => import("./workspace/WorkspaceCanvas").then((m) => m.WorkspaceCanvas),
  { ssr: false, loading: () => <Skeleton className="flex-1" /> },
);
import { DetailPanel } from "./workspace/DetailPanel";
import { CanvasBuildToolbar } from "./workspace/CanvasBuildToolbar";
import { SaveWorkflowDialog } from "./workspace/SaveWorkflowDialog";
import { DeployDialog } from "./workspace/DeployDialog";
import { DeployDialog as CommandDeployDialog } from "@/components/workflows/DeployDialog";
import { WorkflowsSidebar } from "./WorkflowsSidebar";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import type { Edge } from "@xyflow/react";
import { Plus, ArrowLeft } from "lucide-react";
import { SearchField } from "@/components/ui/search-field";
import { Button } from "@/components/ui/button";

interface WorkflowsViewProps {
  onBack?: () => void;
}

export function WorkflowsView({ onBack }: WorkflowsViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // URL state
  const selectedParam = searchParams.get("selected");
  const selection = useMemo(() => {
    if (!selectedParam) return null;
    const [type, ...rest] = selectedParam.split(":");
    return { type, id: rest.join(":") };
  }, [selectedParam]);

  // Data
  const { data: agents = [] } = useAgents();
  const { data: workflows = [] } = useWorkflows();
  const deleteWorkflow = useDeleteWorkflow();
  const createWorkflow = useCreateWorkflow();
  const updateWorkflow = useUpdateWorkflow();

  // Sidebar resize
  const { sidebarWidth, sidebarCollapsed, handleDragStart, toggleCollapse } =
    useSidebarResize();

  // Canvas + workspace store
  const {
    setDetailMode,
    buildWorkflowId,
    setBuildWorkflowId,
    workspaceAgents,
    addToWorkspace,
    removeFromWorkspace,
    searchQuery,
    setSearchQuery,
  } = useWorkspaceStore();

  // Dialogs
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deployWorkflowId, setDeployWorkflowId] = useState<string | null>(null);
  const [commandDeployId, setCommandDeployId] = useState<string | null>(null);

  // Canvas edges
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);

  // Workspace agents
  const workspaceAgentsList = useMemo(
    () => agents.filter((a) => workspaceAgents.includes(a.name)),
    [agents, workspaceAgents],
  );

  // Derive active workflow from URL selection
  const activeWorkflow = useMemo(() => {
    if (selection?.type !== "workflow") return null;
    return workflows.find((w) => w.id === selection.id) ?? null;
  }, [selection, workflows]);

  // URL updaters
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
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          '[placeholder*="Search"]',
        );
        input?.focus();
      }
      if (e.key === "Escape") {
        clearSelected();
      }
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSaveDialogOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearSelected]);

  // Handlers
  const handleCreateWorkflow = () => {
    createWorkflow.mutate(
      { name: "New Workflow" },
      {
        onSuccess: (wf) => setSelected("workflow", wf.id),
      },
    );
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
    if (!workspaceAgents.includes(name)) addToWorkspace(name);
    setSelected("agent", name);
  };

  const resolveAgentContext = useCallback(
    (agentName: string) => {
      const agent = agents.find((a) => a.name === agentName);
      return {
        name: agentName,
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

  const handleCloneAgent = useCallback((_agent: Agent) => {}, []);

  const handleAddToWorkspace = useCallback(
    (agent: Agent) => {
      if (!workspaceAgents.includes(agent.name)) {
        addToWorkspace(agent.name);
      }
    },
    [workspaceAgents, addToWorkspace],
  );

  const handleRemoveFromWorkspace = useCallback(
    (name: string) => {
      removeFromWorkspace(name);
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
    [removeFromWorkspace, clearSelected],
  );

  const handleEdgesChange = useCallback((edges: Edge[]) => {
    setCanvasEdges(edges);
  }, []);

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
            onSuccess: () => {
              toast.success("Workflow updated");
            },
          },
        );
      } else {
        createWorkflow.mutate(data, {
          onSuccess: (wf) => {
            setBuildWorkflowId(wf.id);
            setSelected("workflow", wf.id);
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

  const handleDeploy = useCallback(
    (workflowId: string) => {
      router.push(`/?workflow=${workflowId}`);
    },
    [router],
  );

const canvasNodesForSave = useMemo(() => {
    let positions: Record<string, { x: number; y: number }> = {};
    if (typeof window !== "undefined") {
      try {
        positions = JSON.parse(
          localStorage.getItem("agent-canvas-positions") || "{}",
        );
      } catch {
        /* ignore */
      }
    }
    return workspaceAgentsList.map((a, i) => ({
      id: a.name,
      position: positions[a.name] ?? {
        x: (i % 4) * 240,
        y: Math.floor(i / 4) * 180,
      },
    }));
  }, [workspaceAgentsList]);

  const handleSaveAgent = useCallback((_agent: Partial<Agent>) => {}, []);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border/50 bg-card/50 flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <ArrowLeft size={16} />
          </button>
        )}

        <div className="relative flex-1 max-w-xs">
          <SearchField
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search workflows, inventory..."
            inputSize="sm"
            className="pr-12"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-micro text-text-quaternary bg-muted/50 px-1 py-0.5 rounded font-mono">
            ⌘K
          </kbd>
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <Button
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={handleCreateWorkflow}
          >
            <Plus size={11} />
            New Workflow
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: workflows top, agents bottom */}
        <WorkflowsSidebar
          agents={agents}
          workflows={workflows}
          selectedId={selection?.id ?? null}
          selectedType={selection?.type ?? null}
          collapsed={sidebarCollapsed}
          width={sidebarWidth}
          onSelectAgent={(name) => setSelected("agent", name)}
          onSelectWorkflow={(id) => setSelected("workflow", id)}
          onToggleCollapse={toggleCollapse}
          onDragStart={handleDragStart}
          onToggleAgent={handleToggleAgent}
          workspaceAgentNames={new Set(workspaceAgents)}
          onAddToWorkspace={handleAddToWorkspace}
          onRenameWorkflow={(id, name) =>
            updateWorkflow.mutate({ id, data: { name } })
          }
        />

        {/* Center: Canvas */}
        <div className="flex-1 relative">
          <WorkspaceCanvas
            agents={workspaceAgentsList}
            activeWorkflow={activeWorkflow}
            selectedId={selection?.type === "agent" ? selection.id : null}
            onSelectNode={(name) => setSelected("agent", name)}
            onDropAgent={handleDropAgent}
            onAttachSkill={handleAttachSkill}
            onEdgesChange={handleEdgesChange}
          />

          <CanvasBuildToolbar
            edgeCount={canvasEdges.length}
            nodeCount={
              workspaceAgentsList.filter((a) => a.enabled !== false).length
            }
            hasWorkflow={!!buildWorkflowId}
            onSaveWorkflow={() => setSaveDialogOpen(true)}
            onDeploy={() => {
              if (buildWorkflowId) setDeployWorkflowId(buildWorkflowId);
            }}
          />
        </div>

        {/* Detail panel */}
        <DetailPanel
          selection={selection}
          onClose={clearSelected}
          agents={agents}
          workflows={workflows}
          onSaveAgent={handleSaveAgent}
          onDeleteAgent={() => {}}
          onDeleteWorkflow={(id) => deleteWorkflow.mutate(id)}
          onLaunchWorkflow={(id) => router.push(`/?workflow=${id}`)}
          onToggleAgent={handleToggleAgent}
          onCloneAgent={handleCloneAgent}
          onDetachSkill={handleDetachSkill}
          onDeployWorkflow={(id) => setDeployWorkflowId(id)}
          onDeployWorkflowAsCommand={(id) => setCommandDeployId(id)}
          workspaceAgentNames={new Set(workspaceAgents)}
          onRemoveFromWorkspace={handleRemoveFromWorkspace}
          onAddToWorkspace={(name) => addToWorkspace(name)}
          onRenameWorkflow={(id, name) =>
            updateWorkflow.mutate({ id, data: { name } })
          }
        />
      </div>

      {/* Dialogs */}
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
    </div>
  );
}
