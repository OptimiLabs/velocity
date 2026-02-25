"use client";

import type { ReactNode } from "react";
import type {
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  NodeTypes,
  ReactFlowProps,
} from "@xyflow/react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";

const PRO_OPTIONS = { hideAttribution: true } as const;
const CONTROLS_CLASS =
  "!bg-card !border-border !shadow-sm [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground";
const MINIMAP_CLASS = "!bg-card !border-border !shadow-sm";

interface GraphWorkspaceProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  nodeTypes: NodeTypes;
  flowProps?: Omit<
    ReactFlowProps,
    | "nodes"
    | "edges"
    | "onNodesChange"
    | "onEdgesChange"
    | "nodeTypes"
    | "fitView"
    | "proOptions"
    | "children"
  >;
  minZoom?: number;
  maxZoom?: number;
  fitViewOptions?: ReactFlowProps["fitViewOptions"];
  backgroundVariant?: "dots" | "lines" | "cross";
  backgroundClassName?: string;
  backgroundGap?: number;
  backgroundSize?: number;
  backgroundColor?: string;
  controlsPosition?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  showInteractiveControls?: boolean;
  showFitViewControl?: boolean;
  miniMap?:
    | false
    | { className?: string; nodeColor?: string | ((node: Node) => string) };
  children?: ReactNode;
}

const VARIANT_MAP = {
  dots: BackgroundVariant.Dots,
  lines: BackgroundVariant.Lines,
  cross: BackgroundVariant.Cross,
} as const;

export function GraphWorkspace({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  nodeTypes,
  flowProps,
  minZoom = 0.2,
  maxZoom = 2,
  fitViewOptions,
  backgroundVariant = "dots",
  backgroundClassName,
  backgroundGap = 20,
  backgroundSize = 1,
  backgroundColor,
  controlsPosition = "bottom-left",
  showInteractiveControls,
  showFitViewControl = true,
  miniMap,
  children,
}: GraphWorkspaceProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={fitViewOptions}
      proOptions={PRO_OPTIONS}
      minZoom={minZoom}
      maxZoom={maxZoom}
      {...flowProps}
    >
      <Background
        variant={VARIANT_MAP[backgroundVariant]}
        gap={backgroundGap}
        size={backgroundSize}
        color={backgroundColor}
        className={backgroundClassName}
      />
      <Controls
        className={CONTROLS_CLASS}
        showFitView={showFitViewControl}
        showInteractive={showInteractiveControls}
        position={controlsPosition}
      />
      {miniMap !== false && (
        <MiniMap
          nodeStrokeWidth={3}
          className={miniMap?.className ?? MINIMAP_CLASS}
          nodeColor={miniMap?.nodeColor}
        />
      )}
      {children}
    </ReactFlow>
  );
}
