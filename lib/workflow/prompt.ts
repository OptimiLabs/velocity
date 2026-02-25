import type { Workflow, WorkflowNode } from "@/types/workflow";

/** Topologically sort workflow nodes respecting dependsOn */
function topoSort(nodes: WorkflowNode[]): WorkflowNode[] {
  const sorted: WorkflowNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  function visit(id: string) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      console.warn(`[topoSort] cycle detected at node "${id}", skipping`);
      return;
    }
    visiting.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    for (const dep of node.dependsOn) visit(dep);
    visiting.delete(id);
    visited.add(id);
    sorted.push(node);
  }
  nodes.forEach((n) => visit(n.id));
  return sorted;
}

/** Compose workflow nodes into a structured prompt for Claude */
export function composeWorkflowPrompt(workflow: Workflow): string {
  const sorted = topoSort(workflow.nodes);
  const steps = sorted.map((node, i) => {
    const deps =
      node.dependsOn.length > 0
        ? ` (after: ${node.dependsOn
            .map((d) => {
              const idx = sorted.findIndex((n) => n.id === d);
              return `Step ${idx + 1}`;
            })
            .join(", ")})`
        : "";
    return `## Step ${i + 1}: ${node.label}${deps}\n${node.taskDescription}`;
  });

  return [
    `Execute this workflow step by step. Complete each step fully before moving to the next.`,
    ``,
    `Workflow: ${workflow.name}`,
    workflow.description ? `Description: ${workflow.description}` : null,
    ``,
    ...steps,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
