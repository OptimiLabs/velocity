"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAgents } from "@/hooks/useAgents";
import {
  useWorkflow,
  useWorkflows,
  useDeleteWorkflow,
  useUpdateWorkflow,
  useGenerateWorkflow,
} from "@/hooks/useWorkflows";
import { useSidebarResize, useResizablePanel } from "@/hooks/useSidebarResize";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkflowCreationStore } from "@/stores/workflowCreationStore";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const WorkspaceCanvas = dynamic(
  () =>
    import("@/components/agents/workspace/WorkspaceCanvas").then(
      (m) => m.WorkspaceCanvas,
    ),
  { ssr: false, loading: () => <Skeleton className="flex-1" /> },
);
import { DetailPanel } from "@/components/agents/workspace/DetailPanel";
import { CanvasBuildToolbar } from "@/components/agents/workspace/CanvasBuildToolbar";
import { SaveWorkflowDialog } from "@/components/agents/workspace/SaveWorkflowDialog";
import { DeployDialog } from "@/components/agents/workspace/DeployDialog";
import { DeployDialog as CommandDeployDialog } from "@/components/workflows/DeployDialog";
import { WorkflowsSidebar } from "@/components/agents/WorkflowsSidebar";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import type { WorkflowNodeOverrides, WorkflowScopedAgent } from "@/types/workflow";
import { scopedAgentToAgent } from "@/lib/agents/workflow-agent-utils";
import type { Edge } from "@xyflow/react";
import { generateInstanceId, parseInstanceId } from "@/lib/workflow/instance";
import {
  Search,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Terminal,
  Trash2,
  Loader2,
  X,
  Sparkles,
  ChevronDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineEditText } from "@/components/ui/inline-edit-text";
import { useConfirm } from "@/hooks/useConfirm";
import { cn } from "@/lib/utils";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import {
  useWorkflowBuilderLayoutStore,
  type WorkflowBuilderLayoutMode,
} from "@/stores/workflowBuilderLayoutStore";

interface WorkflowCanvasBuilderProps {
  workflowId: string;
}

export function WorkflowCanvasBuilder({
  workflowId,
}: WorkflowCanvasBuilderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const providerScope = useProviderScopeStore((s) => s.providerScope);

  // Data
  const { data: workflow, isLoading } = useWorkflow(workflowId);
  const { data: agents = [] } = useAgents(providerScope);
  const { data: workflows = [] } = useWorkflows();
  const deleteWorkflow = useDeleteWorkflow();
  const updateWorkflow = useUpdateWorkflow();
  const generateWorkflow = useGenerateWorkflow();
  const { confirm } = useConfirm();

  // AI intent consumption
  const pendingAIIntent = useWorkflowCreationStore((s) => s.pendingAIIntent);
  const clearPendingAIIntent = useWorkflowCreationStore(
    (s) => s.clearPendingAIIntent,
  );
  const [generatingFromIntent, setGeneratingFromIntent] = useState(false);
  const [generatingStartedAt, setGeneratingStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [aiPromptExpanded, setAiPromptExpanded] = useState(false);
  const hasConsumedIntent = useRef(false);

  // Elapsed timer for generation overlay
  useEffect(() => {
    if (!generatingStartedAt) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - generatingStartedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [generatingStartedAt]);

  // Selection state (local instead of URL params)
  const [selection, setSelectionState] = useState<{
    type: string;
    id: string;
  } | null>(null);

  // Sidebar resize
  const { sidebarWidth, sidebarCollapsed, handleDragStart, toggleCollapse } =
    useSidebarResize();
  const { width: detailWidth, handleDragStart: handleDetailDragStart } =
    useResizablePanel({
      minWidth: 320,
      maxWidth: 760,
      defaultWidth: 400,
      storageKey: "workflow-builder-detail-panel-width",
      side: "right",
    });

  // Workspace store
  const {
    setDetailMode,
    setBuildWorkflowId,
    workspaceAgents,
    addToWorkspace,
    removeFromWorkspace,
    clearWorkspace,
    searchQuery,
    setSearchQuery,
  } = useWorkspaceStore();

  // Fullscreen + panel visibility (persisted per mode)
  const isFullscreen = useWorkflowBuilderLayoutStore((s) => s.isFullscreen);
  const setFullscreen = useWorkflowBuilderLayoutStore((s) => s.setFullscreen);
  const toggleFullscreen = useWorkflowBuilderLayoutStore(
    (s) => s.toggleFullscreen,
  );
  const normalLeftOpen = useWorkflowBuilderLayoutStore((s) => s.normal.leftOpen);
  const normalRightOpen = useWorkflowBuilderLayoutStore(
    (s) => s.normal.rightOpen,
  );
  const fullscreenLeftOpen = useWorkflowBuilderLayoutStore(
    (s) => s.fullscreen.leftOpen,
  );
  const fullscreenRightOpen = useWorkflowBuilderLayoutStore(
    (s) => s.fullscreen.rightOpen,
  );
  const setLeftOpen = useWorkflowBuilderLayoutStore((s) => s.setLeftOpen);
  const setRightOpen = useWorkflowBuilderLayoutStore((s) => s.setRightOpen);
  const toggleLeft = useWorkflowBuilderLayoutStore((s) => s.toggleLeft);
  const toggleRight = useWorkflowBuilderLayoutStore((s) => s.toggleRight);

  const layoutMode: WorkflowBuilderLayoutMode = isFullscreen
    ? "fullscreen"
    : "normal";
  const leftPanelOpen = isFullscreen ? fullscreenLeftOpen : normalLeftOpen;
  const rightPanelOpen = isFullscreen ? fullscreenRightOpen : normalRightOpen;
  const workflowProvider = (workflow?.provider ?? providerScope) as ConfigProvider;

  // Set buildWorkflowId on mount
  useEffect(() => {
    setBuildWorkflowId(workflowId);
    return () => setBuildWorkflowId(null);
  }, [workflowId, setBuildWorkflowId]);


  // Hydrate workspace from workflow's saved nodes when switching workflows
  const hydratedWorkflowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!workflow || hydratedWorkflowRef.current === workflowId) return;
    // Don't hydrate if an AI intent is pending (the intent handler manages workspace)
    if (pendingAIIntent) return;

    hydratedWorkflowRef.current = workflowId;
    clearWorkspace();

    // Populate workspace from workflow's saved nodes
    for (const node of workflow.nodes) {
      if (node.agentName) {
        addToWorkspace(node.id);
      }
    }
  }, [workflow, workflowId, pendingAIIntent, clearWorkspace, addToWorkspace]);

  // Consume pending AI intent from creation modal
  useEffect(() => {
    if (!workflow || !pendingAIIntent || hasConsumedIntent.current) return;
    hasConsumedIntent.current = true;

    const intent = pendingAIIntent;
    // NOTE: Do NOT clear pendingAIIntent here — it guards the hydration effect
    // from running clearWorkspace() while the async AI generation is in progress.
    // It's cleared in the finally block below.

    const run = async () => {
      setGeneratingFromIntent(true);
      setGeneratingStartedAt(Date.now());
      setOverlayDismissed(false);
      // Mark as hydrated so the hydration effect doesn't clear our workspace
      // when clearPendingAIIntent() fires in the finally block
      hydratedWorkflowRef.current = workflowId;
      // Track instance IDs so we generate each agent's ID exactly once
      const instanceIdMap = new Map<string, string>();
      try {
        // Add selected agents to workspace if using existing agents
        if (intent.agentMode === "existing" && intent.selectedAgents) {
          for (const name of intent.selectedAgents) {
            const instanceId = generateInstanceId(name);
            instanceIdMap.set(name, instanceId);
            addToWorkspace(instanceId);
          }
        }

        // Map agent names to objects with descriptions for richer AI context
        const agentsWithDescriptions = intent.selectedAgents
          ?.map((name) => {
            const agent = agents.find((a) => a.name === name);
            return agent
              ? { name: agent.name, description: agent.description }
              : { name, description: "" };
          });

        const result = await generateWorkflow.mutateAsync({
          prompt: intent.prompt,
          existingAgents: agentsWithDescriptions,
        });

        // Auto-create any agents that don't exist yet
        const existingNames = new Set(agents.map((a) => a.name));
        const newAgentNames = [
          ...new Set(
            result.nodes
              .map((n: { agentName: string | null }) => n.agentName)
              .filter(
                (name: string | null): name is string =>
                  !!name && !existingNames.has(name),
              ),
          ),
        ];

        if (newAgentNames.length > 0) {
          // Create agents directly from workflow-generated task descriptions
          // (avoids spawning N separate claude -p sessions for agent builds)
          const createResults = await Promise.all(
            newAgentNames.map((name) => {
              const node = result.nodes.find(
                (n: { agentName: string | null }) => n.agentName === name,
              );
              const roleLabel = node?.label ?? name;
              const taskDesc = node?.taskDescription ?? intent.prompt;
              const description = node?.taskDescription
                ? `${roleLabel}: ${node.taskDescription.slice(0, 150)}`
                : `Agent for workflow: ${intent.prompt.slice(0, 100)}`;
              const prompt = [
                `# Role: ${roleLabel}`,
                "",
                `## Task`,
                taskDesc,
                "",
                `## Guidelines`,
                `- Focus only on the scope described above`,
                `- Follow existing project conventions and patterns`,
                `- Report completion status when done`,
              ].join("\n");

              return fetch(`/api/workflows/${workflowId}/agents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description, prompt }),
              });
            }),
          );

          // Check for failed agent creations
          const failedCreates = createResults.filter((r) => !r.ok);
          if (failedCreates.length > 0) {
            console.error(
              `[workflow-gen] ${failedCreates.length}/${createResults.length} scoped agent creations failed`,
            );
          }

          // Attach AI-suggested skills to scoped agents
          const skillAttachPromises: Promise<unknown>[] = [];
          for (const node of result.nodes) {
            if (node.agentName && node.skills && node.skills.length > 0 && newAgentNames.includes(node.agentName)) {
              skillAttachPromises.push(
                fetch(`/api/workflows/${workflowId}/agents`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name: node.agentName, skills: node.skills }),
                }).catch(() => {
                  // Non-critical — skill may not exist
                }),
              );
            }
          }
          if (skillAttachPromises.length > 0) {
            await Promise.allSettled(skillAttachPromises);
          }

          await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
        }

        // Add all workflow agents to workspace canvas (reuse existing instance IDs)
        const addedAgentNames = new Set<string>();
        for (const node of result.nodes) {
          if (node.agentName && !addedAgentNames.has(node.agentName)) {
            addedAgentNames.add(node.agentName);
            const instanceId = instanceIdMap.get(node.agentName) ?? generateInstanceId(node.agentName);
            instanceIdMap.set(node.agentName, instanceId);
            addToWorkspace(instanceId);
          }
        }

        // Remap workflow node IDs and edges to use instance IDs so edges connect properly
        type ResultNode = (typeof result.nodes)[number];
        type ResultEdge = (typeof result.edges)[number];

        const remappedNodes = result.nodes.map((node: ResultNode) => {
          const instanceId = node.agentName ? instanceIdMap.get(node.agentName) : null;
          if (!instanceId) return node;
          return {
            ...node,
            id: instanceId,
            dependsOn: node.dependsOn.map((dep: string) => {
              const depNode = result.nodes.find((n: ResultNode) => n.id === dep);
              const depInstanceId = depNode?.agentName ? instanceIdMap.get(depNode.agentName) : null;
              return depInstanceId ?? dep;
            }),
          };
        });

        const remappedEdges = result.edges.map((edge: ResultEdge) => {
          const sourceNode = result.nodes.find((n: ResultNode) => n.id === edge.source);
          const targetNode = result.nodes.find((n: ResultNode) => n.id === edge.target);
          const sourceId = sourceNode?.agentName ? instanceIdMap.get(sourceNode.agentName) : edge.source;
          const targetId = targetNode?.agentName ? instanceIdMap.get(targetNode.agentName) : edge.target;
          return { ...edge, source: sourceId!, target: targetId! };
        });

        updateWorkflow.mutate({
          id: workflowId,
          data: {
            ...(result.name ? { name: result.name } : {}),
            generatedPlan: result.plan,
            nodes: remappedNodes,
            edges: remappedEdges,
          },
        });
      } catch (err) {
        console.error("[workflow-gen] Intent processing failed:", err);
        toast.error("Failed to generate workflow");
        // Clean up the empty skeleton so it doesn't pollute the list
        deleteWorkflow.mutate(workflowId, {
          onSuccess: () => router.push("/workflows"),
          onError: () => router.push("/workflows"), // suppress toast — this is cleanup, not user action
        });
      } finally {
        setGeneratingFromIntent(false);
        setGeneratingStartedAt(null);
        clearPendingAIIntent();
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflow]);

  // Dialogs
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [deployWorkflowId, setDeployWorkflowId] = useState<string | null>(null);
  const [commandDeployId, setCommandDeployId] = useState<string | null>(null);

  // Canvas edges
  const [canvasEdges, setCanvasEdges] = useState<Edge[]>([]);

  // Multi-select
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  // Workspace agents list — maps instance IDs to agent objects (allows duplicates)
  // Merges global agents with workflow-scoped agents; global wins on name collision
  const workspaceAgentsList = useMemo(() => {
    const globalMap = new Map(agents.map((a) => [a.name, a]));
    const scopedMap = new Map(
      (workflow?.scopedAgents ?? []).map((sa: WorkflowScopedAgent) => [sa.name, scopedAgentToAgent(sa)]),
    );
    // Merge: global wins over scoped
    const agentMap = new Map([...scopedMap, ...globalMap]);
    return workspaceAgents
      .map((instanceId) => {
        const name = parseInstanceId(instanceId);
        const agent = agentMap.get(name);
        return agent ? { ...agent, instanceId } : null;
      })
      .filter(Boolean) as (Agent & { instanceId: string })[];
  }, [agents, workspaceAgents, workflow?.scopedAgents]);

  // Selection helpers
  const setSelected = useCallback(
    (type: string, id: string) => {
      setSelectionState({ type, id });
      setDetailMode("view");
    },
    [setDetailMode],
  );

  const clearSelected = useCallback(() => {
    setSelectionState(null);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    toggleFullscreen();
  }, [toggleFullscreen]);

  const handleToggleLeftPanel = useCallback(() => {
    toggleLeft(layoutMode);
  }, [layoutMode, toggleLeft]);

  const handleToggleRightPanel = useCallback(() => {
    toggleRight(layoutMode);
  }, [layoutMode, toggleRight]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          '[data-workflow-builder-search="true"]',
        );
        input?.focus();
      }
      if (e.key === "Escape") {
        if (isFullscreen) {
          setFullscreen(false);
          return;
        }
        clearSelected();
      }
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSaveDialogOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clearSelected, isFullscreen, setFullscreen]);

  // Handlers
  const handleDropAgent = (
    name: string,
    position: { x: number; y: number },
  ) => {
    const instanceId = generateInstanceId(name);
    try {
      const key = "agent-canvas-positions";
      const positions = JSON.parse(localStorage.getItem(key) || "{}");
      positions[instanceId] = position;
      localStorage.setItem(key, JSON.stringify(positions));
    } catch {
      /* ignore */
    }
    addToWorkspace(instanceId);
    setSelected("agent", instanceId);
  };

  const resolveAgentContext = useCallback(
    (agentName: string) => {
      const normalizedName = parseInstanceId(agentName);
      const agent = agents.find((a) => a.name === normalizedName);
      return {
        name: normalizedName,
        provider: (agent?.provider ?? workflowProvider) as ConfigProvider,
        projectPath:
          agent?.scope === "project" ? (agent.projectPath ?? undefined) : undefined,
      };
    },
    [agents, workflowProvider],
  );

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

  const handleAddToWorkspace = useCallback(
    (agent: Agent) => {
      const instanceId = generateInstanceId(agent.name);
      addToWorkspace(instanceId);
    },
    [addToWorkspace],
  );

  const handleRemoveFromWorkspace = useCallback(
    (instanceId: string) => {
      removeFromWorkspace(instanceId);
      setCanvasEdges((prev) =>
        prev.filter((e) => e.source !== instanceId && e.target !== instanceId),
      );
      try {
        const positions = JSON.parse(
          localStorage.getItem("agent-canvas-positions") || "{}",
        );
        delete positions[instanceId];
        localStorage.setItem(
          "agent-canvas-positions",
          JSON.stringify(positions),
        );
      } catch {
        /* ignore */
      }
      clearSelected();
    },
    [removeFromWorkspace, setCanvasEdges, clearSelected],
  );

  const handleDeleteScopedAgent = useCallback(
    async (agentName: string) => {
      if (!workflow) return;
      const scopedExists = (workflow.scopedAgents ?? []).some(
        (agent) => agent.name === agentName,
      );
      if (!scopedExists) {
        toast.error("Only workflow-scoped agents can be deleted here");
        return;
      }

      const confirmed = await confirm({
        title: `Delete scoped agent "${agentName}"?`,
        description:
          "This removes the scoped agent from this workflow only.",
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (confirmed !== true) return;

      try {
        const res = await fetch(
          `/api/workflows/${workflowId}/agents/${encodeURIComponent(agentName)}`,
          { method: "DELETE" },
        );
        if (!res.ok) throw new Error("Failed to delete scoped agent");

        for (const instanceId of workspaceAgents.filter(
          (id) => parseInstanceId(id) === agentName,
        )) {
          handleRemoveFromWorkspace(instanceId);
        }
        setSelectedNodeIds((prev) =>
          prev.filter((id) => parseInstanceId(id) !== agentName),
        );
        await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId] });
        toast.success(`Deleted scoped agent "${agentName}"`);
      } catch {
        toast.error("Failed to delete scoped agent");
      }
    },
    [
      workflow,
      confirm,
      workflowId,
      workspaceAgents,
      handleRemoveFromWorkspace,
      queryClient,
    ],
  );

  const handleBulkRemove = useCallback(() => {
    const removedSet = new Set(selectedNodeIds);
    for (const id of selectedNodeIds) {
      removeFromWorkspace(id);
    }
    setCanvasEdges((prev) =>
      prev.filter((e) => !removedSet.has(e.source) && !removedSet.has(e.target)),
    );
    try {
      const positions = JSON.parse(
        localStorage.getItem("agent-canvas-positions") || "{}",
      );
      for (const id of selectedNodeIds) {
        delete positions[id];
      }
      localStorage.setItem(
        "agent-canvas-positions",
        JSON.stringify(positions),
      );
    } catch {
      /* ignore */
    }
    setSelectedNodeIds([]);
    clearSelected();
  }, [selectedNodeIds, removeFromWorkspace, setCanvasEdges, clearSelected]);

  const handleEdgesChange = useCallback((edges: Edge[]) => {
    setCanvasEdges(edges);
  }, []);

  const handleSaveWorkflowOverrides = useCallback(
    (nodeId: string, overrides: WorkflowNodeOverrides) => {
      if (!workflow) return;
      const updatedNodes = workflow.nodes.map((n) =>
        n.id === nodeId ? { ...n, overrides } : n,
      );
      updateWorkflow.mutate(
        { id: workflowId, data: { nodes: updatedNodes } },
        { onSuccess: () => toast.success("Workflow override saved") },
      );
    },
    [workflow, workflowId, updateWorkflow],
  );

  const handleSaveWorkflow = useCallback(
    (data: {
      name: string;
      description: string;
      cwd: string;
      nodes: import("@/types/workflow").WorkflowNode[];
      edges: import("@/types/workflow").WorkflowEdge[];
    }) => {
      updateWorkflow.mutate(
        { id: workflowId, data },
        {
          onSuccess: () => {
            toast.success("Workflow updated");
          },
        },
      );
    },
    [workflowId, updateWorkflow],
  );

  const handleDeploy = useCallback(
    (wfId: string) => {
      router.push(`/?workflow=${wfId}`);
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
      id: a.instanceId,
      agentName: a.name,
      position: positions[a.instanceId] ?? {
        x: (i % 4) * 240,
        y: Math.floor(i / 4) * 180,
      },
    }));
  }, [workspaceAgentsList]);
  const enabledWorkspaceAgentCount = useMemo(
    () => workspaceAgentsList.filter((a) => a.enabled !== false).length,
    [workspaceAgentsList],
  );
  const detailSelection = selection;
  const fullscreenDetailOpen = isFullscreen && rightPanelOpen;
  const fullscreenOverlayOpen = isFullscreen && (leftPanelOpen || fullscreenDetailOpen);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col h-full p-6 gap-4 bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(59,130,246,0.06),transparent),radial-gradient(900px_500px_at_100%_0%,rgba(16,185,129,0.05),transparent)]">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 flex-1" />
      </div>
    );
  }

  // Workflow not found
  if (!workflow) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 bg-[radial-gradient(1000px_500px_at_0%_0%,rgba(59,130,246,0.06),transparent),radial-gradient(900px_500px_at_100%_0%,rgba(16,185,129,0.05),transparent)]">
        <p className="text-sm text-muted-foreground">Workflow not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push("/workflows")}>
          <ArrowLeft size={14} className="mr-1.5" />
          Back to workflows
        </Button>
      </div>
    );
  }

  const handleDeleteWorkflow = async () => {
    const ok = await confirm({
      title: `Delete workflow "${workflow.name}"?`,
    });
    if (!ok) return;
    deleteWorkflow.mutate(workflowId, {
      onSuccess: () => {
        router.push("/workflows");
      },
    });
  };

  const detailPanelContent = (
    <DetailPanel
      selection={detailSelection}
      onClose={clearSelected}
      agents={[
        ...agents,
        ...(workflow?.scopedAgents ?? []).map(scopedAgentToAgent).filter(
          (sa) => !agents.some((a) => a.name === sa.name),
        ),
      ]}
      workflows={workflows}
      onSaveAgent={() => {}}
      onDeleteAgent={() => {}}
      onDeleteWorkflow={(id) => deleteWorkflow.mutate(id)}
      workflowMode
      activeWorkflow={workflow}
      onSaveWorkflowOverrides={handleSaveWorkflowOverrides}
      onLaunchWorkflow={(id) => router.push(`/?workflow=${id}`)}
      onToggleAgent={handleToggleAgent}
      onCloneAgent={() => {}}
      onDetachSkill={handleDetachSkill}
      onDeployWorkflow={(id) => setDeployWorkflowId(id)}
      onDeployWorkflowAsCommand={(id) => setCommandDeployId(id)}
      workspaceAgentNames={new Set(workspaceAgents.map(parseInstanceId))}
      onRemoveFromWorkspace={() => {
        if (detailSelection) handleRemoveFromWorkspace(detailSelection.id);
      }}
      onAddToWorkspace={(name) => addToWorkspace(generateInstanceId(name))}
      onRenameWorkflow={(id, name) =>
        updateWorkflow.mutate({ id, data: { name } })
      }
      width={detailWidth}
      onDragStart={handleDetailDragStart}
      onPromoteAgent={async (name) => {
        try {
          const res = await fetch(
            `/api/workflows/${workflowId}/agents/${encodeURIComponent(name)}/promote`,
            { method: "POST" },
          );
          if (!res.ok) throw new Error("Promote failed");
          await queryClient.invalidateQueries({ queryKey: ["agents"] });
          toast.success(`${name} promoted to global agent`);
        } catch {
          toast.error("Failed to promote agent");
        }
      }}
    />
  );

  const emptyDetailPanel = (
    <div
      className="border-l border-border/50 bg-card/50 flex flex-col shrink-0"
      style={{ width: detailWidth }}
    >
      <div className="flex items-center px-4 py-2.5 border-b border-border/30">
        <span className="text-sm font-medium text-muted-foreground">
          Details
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center p-5">
        <p className="text-xs text-muted-foreground text-center">
          Select an agent or workflow to view details.
        </p>
      </div>
    </div>
  );

  const rightPanelContent = detailSelection ? detailPanelContent : emptyDetailPanel;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col",
        isFullscreen
          ? "bg-background"
          : "bg-[radial-gradient(1100px_520px_at_5%_-10%,rgba(59,130,246,0.08),transparent),radial-gradient(1000px_520px_at_100%_0%,rgba(16,185,129,0.06),transparent)]",
      )}
    >
      {/* Toolbar */}
      <div
        className={cn(
          "shrink-0",
          isFullscreen
            ? "border-b border-border/50 bg-background/85 backdrop-blur"
            : "px-2 pt-2",
        )}
      >
        <div
          className={cn(
            "px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-2",
            !isFullscreen &&
              "rounded-xl border border-border/60 bg-card/75 shadow-sm backdrop-blur",
          )}
        >
          <button
            onClick={() => router.push("/workflows")}
            className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground"
          >
            <ArrowLeft size={16} />
          </button>

          {workflow ? (
            <InlineEditText
              value={workflow.name}
              onSave={(name) =>
                updateWorkflow.mutate({ id: workflow.id, data: { name } })
              }
            />
          ) : (
            <span className="text-sm font-medium truncate">Workflow</span>
          )}

          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search inventory..."
              data-workflow-builder-search="true"
              className="h-7 text-xs pl-8 pr-12"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-7 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted/70 transition-colors"
                title="Clear search"
                aria-label="Clear inventory search"
              >
                <X size={11} />
              </button>
            )}
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-micro text-text-quaternary bg-muted/50 px-1 py-0.5 rounded font-mono">
              ⌘K
            </kbd>
          </div>


          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-meta tabular-nums text-muted-foreground">
              {enabledWorkspaceAgentCount}/{workspaceAgentsList.length} active
            </span>
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-meta tabular-nums text-muted-foreground">
              {canvasEdges.length} links
            </span>
            {selectedNodeIds.length > 0 && (
              <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-meta tabular-nums text-primary">
                {selectedNodeIds.length} selected
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5"
              onClick={() => setCommandDeployId(workflowId)}
            >
              <Terminal size={13} />
              Deploy Command
            </Button>
            <Button
              variant={isFullscreen ? "secondary" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs gap-1.5"
              onClick={handleToggleFullscreen}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={handleDeleteWorkflow}
              title="Delete workflow"
              aria-label="Delete workflow"
            >
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
      </div>

      <div className={cn("flex flex-1 min-h-0 overflow-hidden", !isFullscreen && "p-2")}>
        <div
          className={cn(
            "relative flex flex-1 min-h-0 overflow-hidden",
            isFullscreen
              ? "bg-background"
              : "rounded-xl border border-border/60 bg-background/75 shadow-sm backdrop-blur",
          )}
        >
          {fullscreenOverlayOpen && (
            <button
              type="button"
              aria-label="Close workflow side panels"
              className="absolute inset-0 z-20 bg-background/35"
              onClick={() => {
                if (leftPanelOpen) setLeftOpen("fullscreen", false);
                if (fullscreenDetailOpen) setRightOpen("fullscreen", false);
              }}
            />
          )}

          {!isFullscreen && leftPanelOpen && (
            <div className="relative z-10 flex h-full min-h-0">
              <WorkflowsSidebar
                agents={agents}
                scopedAgents={(workflow?.scopedAgents ?? []).map(scopedAgentToAgent)}
                workflows={workflow ? [workflow] : []}
                selectedId={selection?.id ?? null}
                selectedType={selection?.type ?? null}
                collapsed={sidebarCollapsed}
                width={sidebarWidth}
                onSelectAgent={(name) => setSelected("agent", name)}
                onSelectWorkflow={(id) => setSelected("workflow", id)}
                onToggleCollapse={toggleCollapse}
                onDragStart={handleDragStart}
                onToggleAgent={handleToggleAgent}
                workspaceAgentNames={new Set(workspaceAgents.map(parseInstanceId))}
                onAddToWorkspace={handleAddToWorkspace}
                hideWorkflows
                onRenameWorkflow={(id, name) =>
                  updateWorkflow.mutate({ id, data: { name } })
                }
              />
              <button
                type="button"
                onClick={handleToggleLeftPanel}
                className="absolute -right-4 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground/80 shadow-md backdrop-blur transition-colors hover:bg-muted/70"
                title="Collapse inventory panel"
                aria-label="Collapse inventory panel"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          )}

          {isFullscreen && leftPanelOpen && (
            <div className="absolute left-0 top-0 bottom-0 z-30 border-r border-border/50 bg-background/95 shadow-2xl backdrop-blur-md flex h-full min-h-0">
              <WorkflowsSidebar
                agents={agents}
                scopedAgents={(workflow?.scopedAgents ?? []).map(scopedAgentToAgent)}
                workflows={workflow ? [workflow] : []}
                selectedId={selection?.id ?? null}
                selectedType={selection?.type ?? null}
                collapsed={false}
                width={sidebarWidth}
                onSelectAgent={(name) => setSelected("agent", name)}
                onSelectWorkflow={(id) => setSelected("workflow", id)}
                onToggleCollapse={() => setLeftOpen("fullscreen", false)}
                onDragStart={handleDragStart}
                onToggleAgent={handleToggleAgent}
                workspaceAgentNames={new Set(workspaceAgents.map(parseInstanceId))}
                onAddToWorkspace={handleAddToWorkspace}
                hideWorkflows
                onRenameWorkflow={(id, name) =>
                  updateWorkflow.mutate({ id, data: { name } })
                }
              />
              <button
                type="button"
                onClick={handleToggleLeftPanel}
                className="absolute -right-4 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground/80 shadow-md backdrop-blur transition-colors hover:bg-muted/70"
                title="Collapse inventory panel"
                aria-label="Collapse inventory panel"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          )}

          {!leftPanelOpen && (
            <button
              type="button"
              onClick={handleToggleLeftPanel}
              className="absolute left-2 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/85 text-muted-foreground shadow-md backdrop-blur transition-colors hover:bg-muted/60 hover:text-foreground"
              title="Expand inventory panel"
              aria-label="Expand inventory panel"
            >
              <ChevronRight size={14} />
            </button>
          )}

          {/* Center: Canvas */}
          <div className="flex-1 relative bg-[radial-gradient(1000px_340px_at_10%_0%,rgba(59,130,246,0.14),transparent),radial-gradient(1000px_380px_at_100%_100%,rgba(16,185,129,0.12),transparent)]">
            <WorkspaceCanvas
              agents={workspaceAgentsList}
              activeWorkflow={workflow ?? null}
              selectedId={selection?.type === "agent" ? selection.id : null}
              onSelectNode={(instanceId) => setSelected("agent", instanceId)}
              onDropAgent={handleDropAgent}
              onAttachSkill={handleAttachSkill}
              onEdgesChange={handleEdgesChange}
              onRemoveFromWorkspace={handleRemoveFromWorkspace}
              onDeleteAgent={handleDeleteScopedAgent}
              canDeleteAgent={(agent) => agent?.scope === "workflow"}
              deleteAgentLabel="Delete from Workflow"
              onNodesDelete={(nodeIds) => {
                for (const id of nodeIds) {
                  handleRemoveFromWorkspace(id);
                }
              }}
              onSelectionChange={setSelectedNodeIds}
            />

            {generatingFromIntent && !overlayDismissed && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4">
                  <Loader2 size={24} className="animate-spin text-primary" />
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-sm font-medium text-foreground">
                      {elapsedSeconds < 15
                        ? "Designing workflow structure..."
                        : elapsedSeconds < 45
                          ? "Planning agent tasks and dependencies..."
                          : elapsedSeconds < 90
                            ? "Claude is being thorough — this may take a few minutes."
                            : "Still working — complex prompts can take 2–5 minutes with Opus."}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {Math.floor(elapsedSeconds / 60)}m {String(elapsedSeconds % 60).padStart(2, "0")}s
                    </p>
                  </div>
                  {elapsedSeconds >= 30 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground"
                      onClick={() => setOverlayDismissed(true)}
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            )}

            {generatingFromIntent && overlayDismissed && (
              <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
                <Loader2 size={12} className="animate-spin text-primary" />
                <span className="text-xs tabular-nums text-muted-foreground">
                  Generating… {Math.floor(elapsedSeconds / 60)}m {String(elapsedSeconds % 60).padStart(2, "0")}s
                </span>
              </div>
            )}

            {workflow?.generatedPlan && (
              <div className="absolute top-3 left-3 z-10">
                {!aiPromptExpanded ? (
                  <button
                    onClick={() => setAiPromptExpanded(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md hover:bg-accent transition-colors"
                  >
                    <Sparkles size={12} className="text-primary" />
                    <span className="text-xs font-medium text-foreground">AI Prompt</span>
                    <ChevronDown size={12} className="text-muted-foreground -rotate-90" />
                  </button>
                ) : (
                  <div className="w-[380px] max-h-[400px] overflow-y-auto rounded-lg border border-border bg-popover shadow-md">
                    <div className="sticky top-0 flex items-center justify-between border-b border-border bg-popover px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} className="text-primary" />
                        <span className="text-xs font-medium text-foreground">AI Prompt</span>
                      </div>
                      <button
                        onClick={() => setAiPromptExpanded(false)}
                        className="rounded p-0.5 hover:bg-accent transition-colors"
                      >
                        <X size={14} className="text-muted-foreground" />
                      </button>
                    </div>
                    <div className="space-y-3 p-3">
                      {workflow.description && (
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Original Prompt
                          </p>
                          <div className="rounded-md border-l-2 border-primary/40 bg-muted/50 px-3 py-2">
                            <p className="text-xs text-foreground whitespace-pre-wrap">
                              {workflow.description}
                            </p>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          AI Plan
                        </p>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {workflow.generatedPlan}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <CanvasBuildToolbar
              edgeCount={canvasEdges.length}
              nodeCount={enabledWorkspaceAgentCount}
              hasWorkflow={true}
              onSaveWorkflow={() => setSaveDialogOpen(true)}
              showDeploy={false}
            />

            {/* Bulk action bar */}
            {selectedNodeIds.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-popover border border-border rounded-lg shadow-lg px-3 py-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {selectedNodeIds.length} selected
                </span>
                <div className="w-px h-4 bg-border" />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleBulkRemove}
                >
                  <Trash2 size={12} />
                  Remove from Canvas
                </Button>
                <button
                  onClick={() => setSelectedNodeIds([])}
                  className="text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>

          {!isFullscreen && rightPanelOpen && (
            <div className="relative z-10 flex h-full min-h-0">
              {rightPanelContent}
              <button
                type="button"
                onClick={handleToggleRightPanel}
                className="absolute -left-4 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground/80 shadow-md backdrop-blur transition-colors hover:bg-muted/70"
                title="Collapse details panel"
                aria-label="Collapse details panel"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {fullscreenDetailOpen && (
            <div className="absolute right-0 top-0 bottom-0 z-30 shadow-2xl backdrop-blur-md flex h-full min-h-0">
              {rightPanelContent}
              <button
                type="button"
                onClick={handleToggleRightPanel}
                className="absolute -left-4 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/90 text-foreground/80 shadow-md backdrop-blur transition-colors hover:bg-muted/70"
                title="Collapse details panel"
                aria-label="Collapse details panel"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          {!rightPanelOpen && (
            <button
              type="button"
              onClick={handleToggleRightPanel}
              className="absolute right-2 top-1/2 z-40 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/85 shadow-md backdrop-blur transition-colors text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              title={
                rightPanelOpen
                  ? "Collapse details panel"
                  : "Expand details panel"
              }
              aria-label={
                rightPanelOpen
                  ? "Collapse details panel"
                  : "Expand details panel"
              }
            >
              {rightPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          )}
        </div>
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
        existingName={workflow?.name}
        existingDescription={workflow?.description}
        existingCwd={workflow?.cwd}
        existingWorkflowNodes={workflow?.nodes}
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
        onDeployed={() => {
          queryClient.invalidateQueries({ queryKey: ["workflows"] });
          if (commandDeployId) {
            queryClient.invalidateQueries({ queryKey: ["workflow", commandDeployId] });
          }
        }}
      />
    </div>
  );
}
