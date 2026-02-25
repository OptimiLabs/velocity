import type { Workflow, WorkflowNode } from "@/types/workflow";

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export interface ParallelGroup {
  nodeIds: string[];
  sharedDepLabels: string[];
}

/**
 * Detect groups of nodes that can execute in parallel.
 * Uses BFS longest-path layering (same algorithm as layout.ts),
 * then groups nodes within each layer that share identical dependsOn sets.
 * Groups with 2+ nodes are parallel groups.
 */
export function computeParallelGroups(nodes: WorkflowNode[]): ParallelGroup[] {
  if (nodes.length <= 1) return [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency: source -> targets
  const children = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const n of nodes) {
    children.set(n.id, []);
    inDegree.set(n.id, 0);
  }
  for (const n of nodes) {
    for (const dep of n.dependsOn) {
      children.get(dep)?.push(n.id);
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
    }
  }

  // BFS longest-path layer assignment
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

  // Group nodes by layer
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  // Within each layer, group by identical dependsOn sets
  const groups: ParallelGroup[] = [];
  for (const ids of layerGroups.values()) {
    if (ids.length < 2) continue;

    const depKeyMap = new Map<string, string[]>();
    for (const id of ids) {
      const node = nodeMap.get(id);
      if (!node) continue;
      const key = [...node.dependsOn].sort().join(",");
      if (!depKeyMap.has(key)) depKeyMap.set(key, []);
      depKeyMap.get(key)!.push(id);
    }

    for (const [, groupIds] of depKeyMap) {
      if (groupIds.length < 2) continue;
      const sampleNode = nodeMap.get(groupIds[0]);
      if (!sampleNode) continue;
      const sharedDepLabels = sampleNode.dependsOn.map(
        (d) => nodeMap.get(d)?.label ?? d,
      );
      groups.push({ nodeIds: groupIds, sharedDepLabels });
    }
  }

  return groups;
}

/** Build the orchestrator prompt that becomes the command body */
export function buildCommandPrompt(workflow: Workflow): string {
  const { nodes } = workflow;
  const parallelGroups = computeParallelGroups(nodes);

  // Build a set of node IDs that are part of a parallel group for quick lookup
  const nodeToGroup = new Map<string, ParallelGroup>();
  for (const group of parallelGroups) {
    for (const id of group.nodeIds) {
      nodeToGroup.set(id, group);
    }
  }

  // Track which groups have already had their callout emitted
  const emittedGroups = new Set<ParallelGroup>();

  const stepLines: string[] = [];

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const group = nodeToGroup.get(n.id);

    // Emit parallel group callout before the first node in the group
    if (group && !emittedGroups.has(group)) {
      emittedGroups.add(group);
      const stepNums = group.nodeIds.map(
        (id) => nodes.findIndex((nd) => nd.id === id) + 1,
      );
      stepNums.sort((a, b) => a - b);
      const stepList = stepNums.join(", ");
      const depNote =
        group.sharedDepLabels.length > 0
          ? ` (all depend only on: ${group.sharedDepLabels.join(", ")})`
          : " (no dependencies)";
      stepLines.push(
        `> **Steps ${stepList} can run in parallel**${depNote}`,
        `> Launch these simultaneously using multiple Task tool calls in a single message.`,
        "",
      );
    }

    const deps =
      n.dependsOn.length > 0
        ? ` (depends on: ${n.dependsOn
            .map((d) => nodes.find((nd) => nd.id === d)?.label ?? d)
            .join(", ")})`
        : "";
    const agent = n.agentName ? ` [agent: ${n.agentName}]` : "";
    const model = n.model ? ` [model: ${n.model}]` : "";
    stepLines.push(
      `${i + 1}. **${n.label}**${deps}${agent}${model}`,
      `   ${n.taskDescription}`,
      "",
    );
  }

  let prompt = `You are now executing the "${workflow.name}" workflow. Do NOT describe or summarize these steps — you must actually perform each one.\n\n`;

  if (workflow.generatedPlan) {
    prompt += `## Plan\n${workflow.generatedPlan}\n\n`;
  }

  prompt += `## Steps\n\n${stepLines.join("\n")}\n`;

  prompt += `## How to Execute\n\n`;
  prompt += `**IMPORTANT: Do NOT just output or restate these steps. You must actually execute each step by performing the work described.**\n\n`;
  prompt += `For each step:\n`;
  prompt += `1. Use the Task tool to dispatch a subagent (type "general-purpose") with a detailed prompt describing what to do\n`;
  prompt += `2. Wait for the result before moving to dependent steps\n`;
  prompt += `3. Report progress as you go\n\n`;

  if (parallelGroups.length > 0) {
    prompt += `When multiple steps share the same dependencies and no step depends on another within the group, launch them **all in a single message** using parallel Task tool calls.\n`;
    prompt += `Do NOT execute parallel steps sequentially — this wastes time.\n\n`;
  }

  prompt += `Each step must be completed before moving to steps that depend on it.\n`;

  if (workflow.cwd) {
    prompt += `Working directory: \`${workflow.cwd}\`\n`;
  }

  prompt += `\nBegin executing now.\n`;

  return prompt;
}
