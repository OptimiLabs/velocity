"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MarkerType,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import { GraphWorkspace } from "@/components/ui/graph-workspace";
import { cn } from "@/lib/utils";
import { getSessionProvider } from "@/lib/providers/session-registry";
import { ClaudeMdNode } from "./nodes/ClaudeMdNode";
import { ReferencedFileNode } from "./nodes/ReferencedFileNode";
import { FolderNode } from "./nodes/FolderNode";
import { EntrypointNode } from "./nodes/EntrypointNode";
import { useRoutingStore } from "@/stores/routingStore";
import {
  useAddGraphEdge,
  useRemoveGraphEdge,
  useSaveNodePosition,
} from "@/hooks/useRoutingGraph";
import type { RoutingGraph } from "@/types/routing-graph";
import {
  FileCheck,
  Zap,
  Bot,
  BookOpen,
  FolderOpen,
  Network,
  CircleDot,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Link2,
  X,
} from "lucide-react";
import type { ConfigProvider } from "@/types/provider";

const NODE_LEGEND = [
  {
    icon: FileCheck,
    label: "Entrypoint file",
    color: "text-emerald-500 dark:text-emerald-400",
  },
  { icon: Zap, label: "Skill", color: "text-amber-500 dark:text-amber-400" },
  { icon: Bot, label: "Agent", color: "text-violet-500 dark:text-violet-400" },
  { icon: BookOpen, label: "Knowledge", color: "text-muted-foreground" },
  { icon: FolderOpen, label: "Folder", color: "text-zinc-400 dark:text-zinc-300" },
  {
    icon: Network,
    label: "Entrypoint",
    color: "text-indigo-400 dark:text-indigo-300",
  },
];

const EDGE_LEGEND = [
  { label: "Reference", stroke: "#52525b", dash: undefined },
  { label: "Contains", stroke: "#71717a", dash: "4 3" },
  { label: "Table entry", stroke: "#14b8a6", dash: "2 4" },
  { label: "Entrypoint", stroke: "#2563eb", dash: "6 4" },
  { label: "Manual link", stroke: "#7c3aed", dash: undefined },
];

const EDGE_TYPE_META: Record<string, { label: string; badge: string }> = {
  manual: {
    label: "Manual link",
    badge: "bg-violet-500/15 text-violet-400 border-violet-500/35",
  },
  entrypoint: {
    label: "Entrypoint",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/35",
  },
  structural: {
    label: "Contains",
    badge: "bg-zinc-500/15 text-zinc-400 border-zinc-500/35",
  },
  "table-entry": {
    label: "Table entry",
    badge: "bg-teal-500/15 text-teal-400 border-teal-500/35",
  },
  "inline-mention": {
    label: "Inline mention",
    badge: "bg-amber-500/15 text-amber-400 border-amber-500/35",
  },
  "relative-path": {
    label: "Relative path",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/35",
  },
  "tilde-path": {
    label: "Tilde path",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/35",
  },
  path: {
    label: "Path reference",
    badge: "bg-cyan-500/15 text-cyan-400 border-cyan-500/35",
  },
  reference: {
    label: "Reference",
    badge: "bg-zinc-500/15 text-zinc-300 border-zinc-500/35",
  },
};

type RoutingEdgeData = {
  context?: string;
  referenceType?: string;
  isManual?: boolean;
  edgeType?: string;
  originalOpacity?: number;
};

function resolveEdgeType(data: RoutingEdgeData | undefined): string {
  if (!data) return "reference";
  if (data.isManual || data.referenceType === "manual") return "manual";
  if (data.edgeType === "entrypoint") return "entrypoint";
  if (data.edgeType === "contains" || data.referenceType === "structural") {
    return "structural";
  }
  if (data.edgeType === "table-entry" || data.referenceType === "table-entry") {
    return "table-entry";
  }
  if (data.referenceType === "inline-mention") return "inline-mention";
  if (data.referenceType === "relative-path") return "relative-path";
  if (data.referenceType === "tilde-path") return "tilde-path";
  if (data.referenceType === "path") return "path";
  if (data.edgeType && EDGE_TYPE_META[data.edgeType]) return data.edgeType;
  return "reference";
}

function GraphLegend() {
  const [open, setOpen] = useState(true);

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col items-start">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground bg-background/90 backdrop-blur-sm border border-border/60 rounded-lg shadow-sm hover:text-foreground transition-colors"
      >
        Legend
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-1.5 p-3 bg-background/95 backdrop-blur-sm border border-border/60 rounded-lg shadow-md animate-in fade-in slide-in-from-top-1 duration-150 min-w-[196px]">
          <div className="space-y-1.5 mb-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Nodes
            </p>
            {NODE_LEGEND.map(({ icon: Icon, label, color }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-[11px] text-muted-foreground"
              >
                <Icon size={12} className={color} />
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border/40 pt-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Edges
            </p>
            {EDGE_LEGEND.map(({ label, stroke, dash }) => (
              <div
                key={label}
                className="flex items-center gap-2 text-[11px] text-muted-foreground"
              >
                <svg width="20" height="8" className="shrink-0">
                  <line
                    x1="0"
                    y1="4"
                    x2="16"
                    y2="4"
                    stroke={stroke}
                    strokeWidth="1.5"
                    strokeDasharray={dash}
                  />
                  <path d="M16 2 L20 4 L16 6 Z" fill={stroke} />
                </svg>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border/40 pt-2 mt-2 space-y-1.5">
            <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Pointers
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CircleDot size={12} className="text-sky-500" />
              <span>Left pin receives incoming links</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CircleDot size={12} className="text-emerald-500" />
              <span>Right pin sends outgoing links</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <ArrowRight size={12} className="text-muted-foreground" />
              <span>Arrowheads show direction of flow</span>
            </div>
            <p className="pt-0.5 text-[10px] text-muted-foreground/70">
              Hover or click an edge for full source/target details.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  "claude-md": ClaudeMdNode,
  skill: ReferencedFileNode,
  agent: ReferencedFileNode,
  knowledge: ReferencedFileNode,
  folder: FolderNode,
  entrypoint: EntrypointNode,
};

function miniMapNodeColor(node: Node): string {
  const nodeType = String(
    (node.data as { nodeType?: string } | undefined)?.nodeType ??
      node.type ??
      "",
  );
  switch (nodeType) {
    case "claude-md":
      return "#10b981";
    case "skill":
      return "#f59e0b";
    case "agent":
      return "#8b5cf6";
    case "entrypoint":
      return "#3b82f6";
    case "folder":
      return "#71717a";
    case "knowledge":
    default:
      return "#64748b";
  }
}

interface RoutingCanvasProps {
  flowNodes: Node[];
  flowEdges: Edge[];
  graph: RoutingGraph;
  providerScope: ConfigProvider;
}

/** Child component that runs inside ReactFlow tree to use fitView */
function FocusHandler() {
  const { focusNodeId, setFocusNodeId, layoutMode, visibleNodeTypes } =
    useRoutingStore();
  const { fitView } = useReactFlow();
  const visibleNodeTypesKey = Array.from(visibleNodeTypes).sort().join("|");

  useEffect(() => {
    if (!focusNodeId) return;
    const timer = setTimeout(() => {
      fitView({
        nodes: [{ id: focusNodeId }],
        duration: 400,
        padding: 0.5,
        maxZoom: 1.2,
      });
      setFocusNodeId(null);
    }, 50);
    return () => clearTimeout(timer);
  }, [focusNodeId, fitView, setFocusNodeId]);

  // Re-fit view when layout mode or filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.4, duration: 300 });
    }, 50);
    return () => clearTimeout(timer);
  }, [layoutMode, visibleNodeTypesKey, fitView]);

  return null;
}

export function RoutingCanvas({
  flowNodes,
  flowEdges,
  graph: _graph,
  providerScope,
}: RoutingCanvasProps) {
  const {
    canvasMode,
    selectedNodeId,
    setSelectedNodeId,
    setSelectedFilePath,
    setDetailMode,
  } = useRoutingStore();

  const addGraphEdge = useAddGraphEdge();
  const removeGraphEdge = useRemoveGraphEdge();
  const savePosition = useSaveNodePosition();

  const [nodes, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [lockedEdgeId, setLockedEdgeId] = useState<string | null>(null);

  const nodeLabelById = useMemo(() => {
    return new Map(
      nodes.map((node) => {
        const label =
          (node.data as { label?: string } | undefined)?.label ?? node.id;
        return [node.id, label] as const;
      }),
    );
  }, [nodes]);

  const edgeIdSet = useMemo(() => new Set(edges.map((edge) => edge.id)), [edges]);
  const effectiveLockedEdgeId =
    lockedEdgeId && edgeIdSet.has(lockedEdgeId) ? lockedEdgeId : null;
  const effectiveHoveredEdgeId =
    hoveredEdgeId && edgeIdSet.has(hoveredEdgeId) ? hoveredEdgeId : null;
  const activeEdgeId = effectiveLockedEdgeId ?? effectiveHoveredEdgeId;
  const activeEdge = useMemo(
    () => edges.find((edge) => edge.id === activeEdgeId) ?? null,
    [edges, activeEdgeId],
  );

  const activeEdgeDetails = useMemo(() => {
    if (!activeEdge) return null;
    const edgeData = activeEdge.data as RoutingEdgeData | undefined;
    const edgeType = resolveEdgeType(edgeData);
    const edgeMeta = EDGE_TYPE_META[edgeType] ?? EDGE_TYPE_META.reference;
    return {
      sourceId: activeEdge.source,
      targetId: activeEdge.target,
      sourceLabel: nodeLabelById.get(activeEdge.source) ?? activeEdge.source,
      targetLabel: nodeLabelById.get(activeEdge.target) ?? activeEdge.target,
      edgeType,
      edgeLabel: edgeMeta.label,
      edgeBadge: edgeMeta.badge,
      context: edgeData?.context ?? "",
      referenceType: edgeData?.referenceType ?? "",
    };
  }, [activeEdge, nodeLabelById]);

  const providerLabel =
    getSessionProvider(providerScope)?.label ?? providerScope;
  const entrypointFileName =
    providerScope === "codex"
      ? "AGENTS.md"
      : providerScope === "gemini"
        ? "GEMINI.md"
        : "CLAUDE.md";

  // Sync internal xyflow state when parent-provided flow data changes
  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  // Highlight selected node and dim unconnected nodes/edges.
  // BFS uses the flowEdges prop directly (not internal state) so this effect
  // re-runs after the sync effect above overwrites internal state.
  useEffect(() => {
    if (!selectedNodeId) {
      // Clear all highlighting
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          selected: false,
          data: { ...n.data, dimmed: false, highlighted: false },
        })),
      );
      setEdges((eds) =>
        eds.map((e) => {
          const edgeData = (e.data as RoutingEdgeData | undefined) ?? {};
          return {
            ...e,
            data: edgeData,
            style: { ...e.style, opacity: edgeData.originalOpacity ?? e.style?.opacity },
          };
        }),
      );
      return;
    }

    // BFS in both directions to find the full ancestor/descendant chain.
    const connectedNodeIds = new Set<string>([selectedNodeId]);

    // Build adjacency maps from flowEdges prop (stable source of truth)
    const children = new Map<string, string[]>();
    const parents = new Map<string, string[]>();
    for (const edge of flowEdges) {
      if (!children.has(edge.source)) children.set(edge.source, []);
      children.get(edge.source)!.push(edge.target);
      if (!parents.has(edge.target)) parents.set(edge.target, []);
      parents.get(edge.target)!.push(edge.source);
    }

    // BFS forward (descendants)
    const queue: string[] = [selectedNodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of children.get(current) ?? []) {
        if (!connectedNodeIds.has(child)) {
          connectedNodeIds.add(child);
          queue.push(child);
        }
      }
    }

    // BFS backward (ancestors)
    queue.push(selectedNodeId);
    const visited = new Set<string>([selectedNodeId]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const parent of parents.get(current) ?? []) {
        if (!visited.has(parent)) {
          visited.add(parent);
          connectedNodeIds.add(parent);
          queue.push(parent);
        }
      }
    }

    // Apply edge highlighting
    setEdges((eds) =>
      eds.map((e) => {
        const edgeData = (e.data as RoutingEdgeData | undefined) ?? {};
        const baseOpacity = edgeData.originalOpacity ?? e.style?.opacity;
        const parsedOpacity =
          typeof baseOpacity === "number"
            ? baseOpacity
            : Number.parseFloat(String(baseOpacity ?? ""));
        const originalOpacity = Number.isFinite(parsedOpacity) ? parsedOpacity : 0.6;
        const isChainEdge =
          connectedNodeIds.has(e.source) && connectedNodeIds.has(e.target);
        return {
          ...e,
          data: { ...edgeData, originalOpacity },
          style: {
            ...e.style,
            opacity: isChainEdge ? Math.min(originalOpacity * 1.4, 1) : 0.08,
          },
        };
      }),
    );

    // Apply node highlighting
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        data: {
          ...n.data,
          dimmed: !connectedNodeIds.has(n.id),
          highlighted: connectedNodeIds.has(n.id) && n.id !== selectedNodeId,
        },
      })),
    );
  }, [selectedNodeId, flowEdges, setNodes, setEdges]);

  // Connect mode: create new edge
  const onConnect = useCallback(
    (connection: Connection) => {
      if (canvasMode !== "connect") return;
      if (!connection.source || !connection.target) return;

      const sourceNode = nodes.find((n) => n.id === connection.source);
      if (!sourceNode) return;

      addGraphEdge.mutate(
        {
          source: connection.source,
          target: connection.target,
          context: "Manual connection",
        },
        {
          onSuccess: () => {
            setEdges((eds) =>
              addEdge(
                {
                  ...connection,
                  id: `${connection.source}→${connection.target}`,
                  type: "smoothstep",
                  animated: true,
                  markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: "#7c3aed",
                    width: 14,
                    height: 14,
                  },
                  style: { stroke: "#7c3aed", strokeWidth: 2, opacity: 0.95 },
                  data: {
                    context: "Manual connection",
                    referenceType: "manual",
                    isManual: true,
                    edgeType: "manual",
                  } satisfies RoutingEdgeData,
                },
                eds,
              ),
            );
          },
        },
      );
    },
    [canvasMode, nodes, addGraphEdge, setEdges],
  );

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      if (canvasMode !== "connect") return;
      removeGraphEdge.mutate(
        { source: edge.source, target: edge.target },
        {
          onSuccess: () => {
            if (effectiveLockedEdgeId === edge.id) setLockedEdgeId(null);
            if (effectiveHoveredEdgeId === edge.id) setHoveredEdgeId(null);
            setEdges((eds) => eds.filter((e) => e.id !== edge.id));
          },
        },
      );
    },
    [
      canvasMode,
      removeGraphEdge,
      setEdges,
      effectiveLockedEdgeId,
      effectiveHoveredEdgeId,
    ],
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      setLockedEdgeId((current) => (current === edge.id ? null : edge.id));
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedFilePath(null);
    setLockedEdgeId(null);
  }, [setSelectedNodeId, setSelectedFilePath]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setSelectedFilePath(node.data.absolutePath as string);
      setDetailMode("view");
    },
    [setSelectedNodeId, setSelectedFilePath, setDetailMode],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      savePosition.mutate({
        nodeId: node.id,
        x: node.position.x,
        y: node.position.y,
      });
    },
    [savePosition],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const data = event.dataTransfer.getData("application/knowledge-node");
      if (!data) return;
      try {
        const { path: filePath } = JSON.parse(data);
        setSelectedNodeId(filePath);
        setSelectedFilePath(filePath);
        setDetailMode("view");
      } catch {
        // ignore invalid payloads
      }
    },
    [setSelectedNodeId, setSelectedFilePath, setDetailMode],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "link";
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Backspace" && canvasMode === "connect") {
        const selectedEdges = edges.filter((e) => e.selected);
        for (const edge of selectedEdges) {
          removeGraphEdge.mutate(
            { source: edge.source, target: edge.target },
            {
              onSuccess: () => {
                setEdges((eds) => eds.filter((e) => e.id !== edge.id));
              },
            },
          );
        }
      }
      if (event.key === "Escape") {
        setLockedEdgeId(null);
      }
    },
    [canvasMode, edges, removeGraphEdge, setEdges],
  );

  return (
    <div
      className="flex-1 h-full relative bg-[radial-gradient(900px_360px_at_20%_-10%,rgba(59,130,246,0.08),transparent),radial-gradient(900px_420px_at_100%_0%,rgba(16,185,129,0.06),transparent)]"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {nodes.length === 0 ? (
        <div className="flex items-center justify-center h-full p-6">
          <div className="max-w-md rounded-2xl border border-border/60 bg-background/70 px-6 py-5 text-center shadow-sm backdrop-blur">
            <p className="text-sm font-medium text-foreground">No knowledge graph yet</p>
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              Click <strong className="text-muted-foreground">Scan</strong> to index
              {" "}
              {providerLabel} instruction files and visualize how they connect.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-micro uppercase tracking-wider text-muted-foreground">
                {providerLabel}
              </span>
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-micro uppercase tracking-wider text-muted-foreground">
                {entrypointFileName}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <GraphWorkspace
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitViewOptions={{ padding: 0.4 }}
          controlsPosition="top-right"
          showInteractiveControls={false}
          showFitViewControl={false}
          backgroundVariant="dots"
          backgroundGap={28}
          backgroundSize={1.25}
          backgroundColor="rgba(100, 116, 139, 0.24)"
          miniMap={{
            className:
              "!bg-background/95 !border-border/70 !shadow-md !h-28 !w-44",
            nodeColor: miniMapNodeColor,
          }}
          flowProps={{
            onConnect,
            onNodeClick: handleNodeClick,
            onPaneClick: handlePaneClick,
            onEdgeClick,
            onEdgeDoubleClick,
            onEdgeMouseEnter: (_event, edge) => setHoveredEdgeId(edge.id),
            onEdgeMouseLeave: () => setHoveredEdgeId(null),
            onNodeDragStop,
            nodesConnectable: canvasMode === "connect",
            nodesDraggable: true,
            edgesReconnectable: canvasMode === "connect",
          }}
        >
          <FocusHandler />
        </GraphWorkspace>
      )}
      {canvasMode === "connect" && nodes.length > 0 && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium animate-in fade-in">
          Connect from right pin to left pin · Double-click edge to remove · Esc to exit
        </div>
      )}
      {nodes.length > 0 && <GraphLegend />}

      {nodes.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-lg border border-border/70 bg-background/92 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="inline-flex items-center gap-1">
            <Link2 size={12} />
            Click edge to pin details
          </span>
        </div>
      )}

      {activeEdgeDetails && (
        <div className="absolute top-14 right-3 z-20 w-[300px] rounded-xl border border-border/70 bg-background/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Link Details
              </p>
              <span
                className={cn(
                  "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  activeEdgeDetails.edgeBadge,
                )}
              >
                {activeEdgeDetails.edgeLabel}
              </span>
            </div>
            {effectiveLockedEdgeId && (
              <button
                onClick={() => setLockedEdgeId(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                title="Unpin edge details"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="mt-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-foreground/90">
              <span className="max-w-[118px] truncate rounded bg-background/80 px-1.5 py-0.5 font-medium">
                {activeEdgeDetails.sourceLabel}
              </span>
              <ArrowRight size={12} className="text-muted-foreground/70 shrink-0" />
              <span className="max-w-[118px] truncate rounded bg-background/80 px-1.5 py-0.5 font-medium">
                {activeEdgeDetails.targetLabel}
              </span>
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground/80">
              {activeEdgeDetails.sourceId} {"->"} {activeEdgeDetails.targetId}
            </div>
          </div>

          {activeEdgeDetails.referenceType && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Reference type:{" "}
              <span className="font-medium text-foreground/85">
                {activeEdgeDetails.referenceType}
              </span>
            </p>
          )}

          {activeEdgeDetails.context ? (
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {activeEdgeDetails.context}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted-foreground/75">
              No explicit context captured for this link.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
