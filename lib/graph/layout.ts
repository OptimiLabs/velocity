import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

interface LayoutOptions {
  direction?: "TB" | "LR";
  rankSep?: number;
  nodeSep?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  /** Per-node-type dimensions — keyed by node.type, falls back to nodeWidth/nodeHeight */
  nodeSizes?: Record<string, { width: number; height: number }>;
}

/**
 * Apply dagre auto-layout to ReactFlow nodes and edges.
 * Returns repositioned nodes + unchanged edges.
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {},
): { nodes: Node[]; edges: Edge[] } {
  const {
    direction = "LR",
    rankSep = 120,
    nodeSep = 60,
    nodeWidth = 180,
    nodeHeight = 60,
    nodeSizes,
  } = options;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep });

  for (const node of nodes) {
    const size = (node.type && nodeSizes?.[node.type]) || {
      width: nodeWidth,
      height: nodeHeight,
    };
    g.setNode(node.id, { width: size.width, height: size.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    const size = (node.type && nodeSizes?.[node.type]) || {
      width: nodeWidth,
      height: nodeHeight,
    };
    return {
      ...node,
      position: {
        x: pos.x - size.width / 2,
        y: pos.y - size.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
