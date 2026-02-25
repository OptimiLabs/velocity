"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from "@xyflow/react";

import { AgentNode } from "./AgentNode";

const nodeTypes = { agent: AgentNode };

interface AgentGraphProps {
  initialNodes: Node[];
  initialEdges: Edge[];
}

export function AgentGraph({ initialNodes, initialEdges }: AgentGraphProps) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div className="h-[600px] w-full border border-border/50 rounded-lg overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} color="var(--border)" />
        <Controls
          showInteractive={false}
          className="!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground"
        />
        <MiniMap
          nodeColor="var(--chart-2)"
          maskColor="var(--minimap-mask)"
          className="!bg-card !border-border"
        />
      </ReactFlow>
    </div>
  );
}
