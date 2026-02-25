import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";

const LAYER_SPACING_Y = 250;
const NODE_SPACING_X = 220;

/**
 * Topological sort + layered positioning for a DAG of workflow nodes.
 * Nodes at the same dependency depth share a Y layer.
 */
export function autoLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowNode[] {
  if (nodes.length === 0) return [];

  // Build adjacency: target -> sources (what each node depends on)
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    children.set(n.id, []);
  }
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    children.get(e.source)?.push(e.target);
  }

  // Assign layers via BFS (longest-path from roots)
  const layers = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nodes) {
    if ((inDegree.get(n.id) ?? 0) === 0) {
      queue.push(n.id);
      layers.set(n.id, 0);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const layer = layers.get(id) ?? 0;
    for (const child of children.get(id) ?? []) {
      const prev = layers.get(child) ?? 0;
      layers.set(child, Math.max(prev, layer + 1));
      const deg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, deg);
      if (deg === 0) queue.push(child);
    }
  }

  // Handle any unvisited nodes (cycles or disconnected)
  for (const n of nodes) {
    if (!layers.has(n.id)) layers.set(n.id, 0);
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  // Position nodes
  const posMap = new Map<string, { x: number; y: number }>();
  for (const [layer, ids] of layerGroups) {
    const y = layer * LAYER_SPACING_Y + 50;
    const totalWidth = (ids.length - 1) * NODE_SPACING_X;
    const startX = -totalWidth / 2;
    ids.forEach((id, i) => {
      posMap.set(id, { x: startX + i * NODE_SPACING_X + 300, y });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: posMap.get(n.id) ?? n.position,
  }));
}

/**
 * Remove nodes that aren't connected to the main workflow graph.
 * Keeps the largest connected component (treating edges as undirected).
 * This prevents the AI from generating orphan steps that clutter the canvas.
 */
export function pruneDisconnectedNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  if (nodes.length <= 1) return { nodes, edges };

  // Build undirected adjacency list
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  // Find connected components via BFS
  const visited = new Set<string>();
  const components: Set<string>[] = [];

  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const component = new Set<string>();
    const queue = [n.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.add(id);
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(component);
  }

  // Keep the largest component
  const largest = components.reduce((a, b) => (a.size >= b.size ? a : b));

  if (largest.size === nodes.length) return { nodes, edges };

  const pruned = components.filter((c) => c !== largest);
  if (pruned.length > 0) {
    const dropped = pruned.flatMap((c) => [...c]);
    console.warn(
      `[workflow-gen] Pruned ${dropped.length} disconnected node(s): ${dropped.join(", ")}`,
    );
  }

  return {
    nodes: nodes.filter((n) => largest.has(n.id)),
    edges: edges.filter(
      (e) => largest.has(e.source) && largest.has(e.target),
    ),
  };
}

/**
 * Build edges from the dependsOn arrays on nodes.
 */
export function buildEdgesFromDeps(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      edges.push({
        id: `e-${dep}-${node.id}`,
        source: dep,
        target: node.id,
      });
    }
  }
  return edges;
}
