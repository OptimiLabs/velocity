"use client";

import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import {
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type ReactFlowInstance,
  type OnSelectionChangeParams,
  MarkerType,
  ConnectionMode,
  SelectionMode,
} from "@xyflow/react";
import { GraphWorkspace } from "@/components/ui/graph-workspace";
import { AgentCanvasNode, type AgentCanvasNodeData } from "./AgentCanvasNode";
import { cn } from "@/lib/utils";
import { Bot, Trash2, Pencil, Copy, PanelLeftClose } from "lucide-react";
import type { Agent } from "@/types/agent";
import type { Workflow } from "@/types/workflow";
import { parseInstanceId } from "@/lib/workflow/instance";

const nodeTypes = { agentCanvas: AgentCanvasNode };

const POSITIONS_KEY = "agent-canvas-positions";

function loadPositions(): Record<string, { x: number; y: number }> {
  try {
    return JSON.parse(localStorage.getItem(POSITIONS_KEY) || "{}");
  } catch {
    return {};
  }
}

function savePositions(positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {}
}

const EDGES_KEY = "agent-canvas-edges";

function loadEdges(): Edge[] {
  try {
    return JSON.parse(localStorage.getItem(EDGES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveEdges(edges: Edge[]) {
  try {
    localStorage.setItem(EDGES_KEY, JSON.stringify(edges));
  } catch {}
}

const defaultEdgeOptions = {
  type: "smoothstep" as const,
  animated: true,
  interactionWidth: 20,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "var(--edge-default)",
  },
  style: { strokeWidth: 1.5, stroke: "var(--edge-default)" },
};

const buildEdgeOptions = {
  ...defaultEdgeOptions,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "var(--edge-active)",
  },
  style: {
    strokeWidth: 1.5,
    stroke: "var(--edge-active)",
    strokeDasharray: "5 3",
  },
  interactionWidth: 20,
};

type CanvasAgent = Agent & { instanceId?: string };

interface WorkspaceCanvasProps {
  agents: CanvasAgent[];
  activeWorkflow: Workflow | null;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onDropAgent: (name: string, position: { x: number; y: number }) => void;
  onAttachSkill?: (agentName: string, skillId: string) => void;
  onEdgesChange?: (edges: Edge[]) => void;
  onEditAgent?: (name: string) => void;
  onDeleteAgent?: (name: string, nodeId?: string) => void;
  canDeleteAgent?: (agent?: Agent) => boolean;
  deleteAgentLabel?: string;
  onRemoveFromWorkspace?: (id: string) => void;
  onDuplicateAgent?: (name: string) => void;
  onSelectionChange?: (nodeIds: string[]) => void;
  onNodesDelete?: (nodeIds: string[]) => void;
  onClearEdges?: () => void;
  onClearCanvas?: () => void;
  multiSelectedIds?: Set<string>;
  clearSelectionKey?: number;
  hasMultiSelection?: boolean;
}

export function WorkspaceCanvas({
  agents,
  activeWorkflow,
  selectedId,
  onSelectNode,
  onDropAgent,
  onAttachSkill,
  onEdgesChange: onEdgesChangeCallback,
  onEditAgent,
  onDeleteAgent,
  canDeleteAgent,
  deleteAgentLabel,
  onRemoveFromWorkspace,
  onDuplicateAgent,
  onSelectionChange,
  onNodesDelete: onNodesDeleteCallback,
  multiSelectedIds,
  clearSelectionKey,
  hasMultiSelection,
}: WorkspaceCanvasProps) {
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Map workflow node info by node ID (instance ID or agent name for legacy)
  const workflowNodeMap = useMemo(() => {
    if (!activeWorkflow)
      return new Map<
        string,
        { role: string; status: string; position: { x: number; y: number } }
      >();
    const map = new Map<
      string,
      { role: string; status: string; position: { x: number; y: number } }
    >();
    for (const n of activeWorkflow.nodes) {
      if (n.agentName) {
        // Key by node ID (which is the instance ID for new workflows)
        map.set(n.id, {
          role: n.label,
          status: n.status,
          position: n.position,
        });
      }
    }
    return map;
  }, [activeWorkflow]);

  // Build nodes (defer localStorage read until after mount to avoid hydration mismatch)
  const initialNodes = useMemo(() => {
    const positions = mounted ? loadPositions() : {};
    return agents.map((agent, i): Node => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      // Use instanceId if present, else fall back to agent name (legacy)
      const nodeId = agent.instanceId ?? agent.name;
      const wfInfo = workflowNodeMap.get(nodeId);

      // Position priority: workflow lens position > localStorage > grid fallback
      const position = wfInfo?.position ??
        positions[nodeId] ?? { x: col * 240, y: row * 180 };

      const nodeData: AgentCanvasNodeData = {
        name: agent.name,
        description: agent.description || "",
        model: agent.model,
        color: agent.color,
        icon: agent.icon,
        category: agent.category,
        toolCount: agent.tools?.length ?? 0,
        usageCount: agent.usageCount,
        workflowRole: wfInfo?.role,
        workflowStatus: wfInfo?.status as AgentCanvasNodeData["workflowStatus"],
        selected: selectedId === nodeId || (multiSelectedIds?.has(nodeId) ?? false),
        dimmed: false,
        enabled: agent.enabled,
        source: agent.source,
        scope: agent.scope,
        skillCount: agent.skills?.length ?? 0,
        skillNames: agent.skills ?? [],
        onAttachSkill,
      };

      return {
        id: nodeId,
        type: "agentCanvas",
        position,
        data: nodeData,
      };
    });
  }, [
    agents,
    selectedId,
    workflowNodeMap,
    onAttachSkill,
    mounted,
    multiSelectedIds,
  ]);

  // Build edges from active workflow (browse mode) or restore from localStorage
  const initialEdges = useMemo((): Edge[] => {
    if (activeWorkflow) {
      // Build lookup from agent name → canvas node ID (instance ID)
      const agentNameToNodeId = new Map<string, string>();
      for (const agent of agents) {
        const nodeId = agent.instanceId ?? agent.name;
        if (!agentNameToNodeId.has(agent.name)) {
          agentNameToNodeId.set(agent.name, nodeId);
        }
      }

      // All canvas node IDs for direct match checking
      const allNodeIds = new Set(agents.map((a) => a.instanceId ?? a.name));
      const seenPairs = new Set<string>();
      const result: Edge[] = [];

      for (const e of activeWorkflow.edges) {
        // Resolve edge source/target: first try direct node ID match (instance IDs
        // from remapped workflows), then fall back to agent name lookup
        const sourceNode = activeWorkflow.nodes.find((n) => n.id === e.source);
        const targetNode = activeWorkflow.nodes.find((n) => n.id === e.target);
        const sourceName = sourceNode?.agentName ?? e.source;
        const targetName = targetNode?.agentName ?? e.target;

        // Skip self-loops (same agent assigned to both source and target steps)
        if (sourceName === targetName) continue;

        // Resolve to canvas node IDs (instance IDs)
        // If the edge source/target already IS a node ID on the canvas, use it directly;
        // otherwise look up by agent name
        const sourceNodeId = allNodeIds.has(e.source) ? e.source : agentNameToNodeId.get(sourceName);
        const targetNodeId = allNodeIds.has(e.target) ? e.target : agentNameToNodeId.get(targetName);

        if (!sourceNodeId || !targetNodeId) continue;
        if (sourceNodeId === targetNodeId) continue;

        // Skip duplicate edges (same source->target pair)
        const pairKey = `${sourceNodeId}->${targetNodeId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);

        result.push({
          id: e.id,
          source: sourceNodeId,
          target: targetNodeId,
          ...defaultEdgeOptions,
        });
      }

      return result;
    }
    return mounted ? loadEdges() : [];
  }, [activeWorkflow, agents, mounted]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when data changes
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);
  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  // Clear ReactFlow internal node selection when parent requests it
  useEffect(() => {
    if (clearSelectionKey === undefined || clearSelectionKey === 0) return;
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
  }, [clearSelectionKey, setNodes]);

  // Sync edges to parent + persist to localStorage
  const edgesRef = useRef(edges);
  useEffect(() => {
    if (edges !== edgesRef.current) {
      edgesRef.current = edges;
      onEdgesChangeCallback?.(edges);
      if (mounted) saveEdges(edges);
    }
  }, [edges, onEdgesChangeCallback, mounted]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, ...buildEdgeOptions }, eds));
    },
    [setEdges],
  );

  const handleEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      const deletedIds = new Set(deletedEdges.map((e) => e.id));
      setEdges((eds) => eds.filter((e) => !deletedIds.has(e.id)));
    },
    [setEdges],
  );

  // Node right-click context menu
  const [nodeMenu, setNodeMenu] = useState<{
    nodeId: string;
    agentName: string;
    x: number;
    y: number;
  } | null>(null);

  // Edge right-click context menu
  const [edgeMenu, setEdgeMenu] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.preventDefault();
      setNodeMenu(null);
      setEdgeMenu({ edgeId: edge.id, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const deleteEdgeFromMenu = useCallback(() => {
    if (!edgeMenu) return;
    setEdges((eds) => eds.filter((e) => e.id !== edgeMenu.edgeId));
    setEdgeMenu(null);
  }, [edgeMenu, setEdges]);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.preventDefault();
      setEdgeMenu(null);
      const agentName = parseInstanceId(node.id);
      setNodeMenu({ nodeId: node.id, agentName, x: event.clientX, y: event.clientY });
    },
    [],
  );

  // Close any context menu on click-outside or escape
  useEffect(() => {
    if (!edgeMenu && !nodeMenu) return;
    const close = () => {
      setEdgeMenu(null);
      setNodeMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [edgeMenu, nodeMenu]);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      onSelectionChange?.(selectedNodes.map((n) => n.id));
    },
    [onSelectionChange],
  );

  const handleNodesDelete = useCallback(
    (deletedNodes: Node[]) => {
      if (onNodesDeleteCallback) {
        onNodesDeleteCallback(deletedNodes.map((n) => n.id));
      }
    },
    [onNodesDeleteCallback],
  );

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Let ReactFlow handle Cmd/Ctrl+click for multi-select toggle
      if (event.metaKey || event.ctrlKey) return;
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const onNodeDragStop = useCallback((_: React.MouseEvent, node: Node) => {
    const positions = loadPositions();
    positions[node.id] = { x: node.position.x, y: node.position.y };
    savePositions(positions);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      // Handle skill drops on canvas (node-level handled by AgentCanvasNode)
      const skillId = e.dataTransfer.getData("application/skill-id");
      if (skillId && onAttachSkill && reactFlowRef.current) {
        // Hit-test: find which node is under the cursor
        const position = reactFlowRef.current.screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });
        const targetNode = nodes.find((n) => {
          const dx = Math.abs(n.position.x + 100 - position.x);
          const dy = Math.abs(n.position.y + 40 - position.y);
          return dx < 130 && dy < 60;
        });
        if (targetNode) {
          onAttachSkill(parseInstanceId(targetNode.id), skillId);
          return;
        }
      }

      // Handle agent drops
      const agentName = e.dataTransfer.getData("application/agent-name");
      if (!agentName || !reactFlowRef.current) return;
      const position = reactFlowRef.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      onDropAgent(agentName, position);
    },
    [onDropAgent, onAttachSkill, nodes],
  );

  if (agents.length === 0) {
    return (
      <div
        style={{ width: "100%", height: "100%" }}
        className={cn(
          "flex items-center justify-center border-2 border-dashed rounded-lg transition-colors",
          isDragOver
            ? "border-primary/30 bg-primary/[0.03]"
            : "border-transparent",
        )}
        onDragOver={(e) => {
          onDragOver(e);
          setIsDragOver(true);
        }}
        onDragEnter={() => setIsDragOver(true)}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          const agentName = e.dataTransfer.getData("application/agent-name");
          if (!agentName) return;
          // No ReactFlow instance yet — use a centered default position
          onDropAgent(agentName, { x: 100, y: 100 });
        }}
      >
        <div className="text-center space-y-2">
          <Bot className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Drag agents from the sidebar to build a workflow
          </p>
          <p className="text-xs text-muted-foreground">
            Drop agents here to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%" }} className="relative">
      <GraphWorkspace
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        minZoom={0.3}
        backgroundVariant={activeWorkflow ? "cross" : "dots"}
        backgroundGap={activeWorkflow ? 32 : 20}
        backgroundSize={activeWorkflow ? 1.25 : 1}
        backgroundColor={activeWorkflow ? "var(--edge-active)" : undefined}
        backgroundClassName={
          activeWorkflow
            ? "!bg-[radial-gradient(900px_280px_at_8%_0%,rgba(59,130,246,0.16),transparent),radial-gradient(900px_360px_at_100%_100%,rgba(16,185,129,0.10),transparent)]"
            : "!bg-blue-500/[0.04]"
        }
        showInteractiveControls={activeWorkflow ? true : undefined}
        miniMap={
          activeWorkflow
            ? {
                className:
                  "!bg-card/90 !backdrop-blur !border-border/80 !shadow-md",
                nodeColor: (node) => {
                  const nodeData = node.data as AgentCanvasNodeData;
                  if (nodeData?.selected) return "var(--primary)";
                  if (nodeData?.scope === "workflow") return "var(--chart-2)";
                  return "var(--chart-1)";
                },
              }
            : undefined
        }
        flowProps={{
          onConnect,
          onEdgeContextMenu,
          onNodeContextMenu,
          onEdgesDelete: handleEdgesDelete,
          onNodeClick,
          onNodeDragStop,
          onDragOver,
          onDrop,
          onInit: (instance) => {
            reactFlowRef.current = instance;
          },
          defaultEdgeOptions: buildEdgeOptions,
          connectionMode: ConnectionMode.Strict,
          connectionLineStyle: {
            stroke: "var(--edge-active)",
            strokeWidth: 2,
          },
          connectionRadius: 30,
          selectionOnDrag: true,
          selectionMode: SelectionMode.Partial,
          multiSelectionKeyCode: ["Meta", "Control"],
          onSelectionChange: handleSelectionChange,
          deleteKeyCode: null,
          onNodesDelete: handleNodesDelete,
          edgesReconnectable: true,
        }}
      />

      {activeWorkflow && (
        <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md border border-border/70 bg-card/85 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="font-semibold text-foreground">IN</span> depends on ·{" "}
          <span className="font-semibold text-foreground">OUT</span> continues
        </div>
      )}

      {/* Edge right-click context menu */}
      {edgeMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[140px]"
          style={{ left: edgeMenu.x, top: edgeMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={deleteEdgeFromMenu}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
          >
            <Trash2 size={12} />
            Delete connection
          </button>
        </div>
      )}

      {/* Node right-click context menu */}
      {nodeMenu && (() => {
        const agent = agents.find((a) => a.name === nodeMenu.agentName);
        const canDelete = canDeleteAgent
          ? canDeleteAgent(agent)
          : agent?.source !== "preset";
        return (
          <div
            className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[160px]"
            style={{ left: nodeMenu.x, top: nodeMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            {onEditAgent && (
              <button
                onClick={() => { onEditAgent(nodeMenu.agentName); setNodeMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
              >
                <Pencil size={12} />
                Edit
              </button>
            )}
            {onDuplicateAgent && (
              <button
                onClick={() => { onDuplicateAgent(nodeMenu.agentName); setNodeMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
              >
                <Copy size={12} />
                Duplicate
              </button>
            )}
            {onRemoveFromWorkspace && (
              <button
                onClick={() => { onRemoveFromWorkspace(nodeMenu.nodeId); setNodeMenu(null); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
              >
                <PanelLeftClose size={12} />
                Remove from Canvas
              </button>
            )}
            {onDeleteAgent && canDelete && (
              <>
                <div className="my-1 border-t border-border/50" />
                <button
                  onClick={() => {
                    onDeleteAgent(nodeMenu.agentName, nodeMenu.nodeId);
                    setNodeMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  {deleteAgentLabel ?? "Delete Agent"}
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Build mode hint (hidden when bulk selection toolbar is showing) */}
      {!hasMultiSelection && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-xs text-text-tertiary bg-card/80 backdrop-blur px-3 py-1.5 rounded-md border border-border/50">
          {edges.length === 0
            ? "Connect with OUT \u2192 IN handles"
            : "Right-click nodes or connections for actions"}
        </div>
      )}
    </div>
  );
}
