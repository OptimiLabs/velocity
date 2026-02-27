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

function normalizedDependsOn(node: WorkflowNode): string[] {
  if (!Array.isArray(node.dependsOn)) return [];
  return node.dependsOn.filter((id): id is string => typeof id === "string");
}

function normalizeEffort(
  effort: unknown,
): "low" | "medium" | "high" | undefined {
  if (typeof effort !== "string") return undefined;
  const normalized = effort.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
}

function normalizeModel(model: unknown): string | undefined {
  if (typeof model !== "string") return undefined;
  const normalized = model.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.trim();
    if (!normalized) continue;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

function formatList(values: string[], max = 6): string {
  if (values.length <= max) return values.join(", ");
  return `${values.slice(0, max).join(", ")} (+${values.length - max} more)`;
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
    for (const dep of normalizedDependsOn(n)) {
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
      const key = [...normalizedDependsOn(node)].sort().join(",");
      if (!depKeyMap.has(key)) depKeyMap.set(key, []);
      depKeyMap.get(key)!.push(id);
    }

    for (const [, groupIds] of depKeyMap) {
      if (groupIds.length < 2) continue;
      const sampleNode = nodeMap.get(groupIds[0]);
      if (!sampleNode) continue;
      const sharedDepLabels = normalizedDependsOn(sampleNode).map(
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
  const scopedModelByAgent = new Map(
    (workflow.scopedAgents ?? [])
      .map((agent) => {
        const model = normalizeModel(agent.model);
        return model ? ([agent.name, model] as const) : null;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );
  const scopedEffortByAgent = new Map(
    (workflow.scopedAgents ?? [])
      .map((agent) => {
        const effort = normalizeEffort(agent.effort);
        return effort ? ([agent.name, effort] as const) : null;
      })
      .filter((entry): entry is readonly [string, "low" | "medium" | "high"] => entry !== null),
  );
  const scopedToolsByAgent = new Map(
    (workflow.scopedAgents ?? []).map((agent) => [
      agent.name,
      normalizeStringList(agent.tools),
    ]),
  );
  const scopedDisallowedToolsByAgent = new Map(
    (workflow.scopedAgents ?? []).map((agent) => [
      agent.name,
      normalizeStringList(agent.disallowedTools),
    ]),
  );
  const scopedSkillsByAgent = new Map(
    (workflow.scopedAgents ?? []).map((agent) => [
      agent.name,
      normalizeStringList(agent.skills),
    ]),
  );

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
    const deps = normalizedDependsOn(n);

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

    const depsText =
      deps.length > 0
        ? ` (depends on: ${deps
            .map((d) => nodes.find((nd) => nd.id === d)?.label ?? d)
            .join(", ")})`
        : "";
    const agent = n.agentName ? ` [agent: ${n.agentName}]` : "";
    const stepModel =
      normalizeModel(n.overrides?.model) ??
      normalizeModel(n.model) ??
      normalizeModel(n.agentName ? scopedModelByAgent.get(n.agentName) : undefined);
    const model = stepModel ? ` [model: ${stepModel}]` : "";
    const stepEffort =
      normalizeEffort(n.overrides?.effort) ??
      normalizeEffort(n.effort) ??
      normalizeEffort(n.agentName ? scopedEffortByAgent.get(n.agentName) : undefined);
    const effort = stepEffort ? ` [effort: ${stepEffort}]` : "";
    const stepSkills = Array.from(
      new Set([
        ...normalizeStringList(n.skills),
        ...normalizeStringList(
          n.agentName ? scopedSkillsByAgent.get(n.agentName) : undefined,
        ),
      ]),
    );
    const stepTools = normalizeStringList(
      n.agentName ? scopedToolsByAgent.get(n.agentName) : undefined,
    );
    const stepDisallowedTools = normalizeStringList(
      n.agentName ? scopedDisallowedToolsByAgent.get(n.agentName) : undefined,
    );
    const label =
      typeof n.label === "string" && n.label.trim().length > 0
        ? n.label
        : `Step ${i + 1}`;
    const taskDescription =
      typeof n.taskDescription === "string" && n.taskDescription.trim().length > 0
        ? n.taskDescription
        : "(No task description provided)";
    stepLines.push(
      `${i + 1}. **${label}**${depsText}${agent}${model}${effort}`,
      `   ${taskDescription}`,
    );
    if (stepSkills.length > 0) {
      stepLines.push(`   Skills: ${formatList(stepSkills, 8)}`);
    }
    if (stepTools.length > 0) {
      stepLines.push(`   Preferred tools: ${formatList(stepTools)}`);
    }
    if (stepDisallowedTools.length > 0) {
      stepLines.push(`   Disallowed tools: ${formatList(stepDisallowedTools)}`);
    }
    if (n.overrides?.systemPrompt) {
      stepLines.push(`   Step override: ${n.overrides.systemPrompt}`);
    }
    stepLines.push("");
  }

  let prompt = `You are now executing the "${workflow.name}" workflow. Do NOT describe or summarize these steps — you must actually perform each one.\n\n`;
  prompt += `## Clarify First\n\n`;
  prompt += `Before executing any step, you must start by asking clarifying questions.\n`;
  prompt += `Ask concise questions that remove ambiguity about requirements, constraints, success criteria, and missing context.\n`;
  prompt += `Wait for answers before executing steps.\n\n`;

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
  prompt += `If a step includes [model: ...] or [effort: ...], apply those settings in the dispatched subagent task prompt.\n`;
  prompt += `Respect each step's Skills, Preferred tools, and Disallowed tools lines.\n`;
  prompt += `MCP and plugin capabilities are exposed as runtime tools — use their exact tool names when relevant.\n\n`;

  if (parallelGroups.length > 0) {
    prompt += `When multiple steps share the same dependencies and no step depends on another within the group, launch them **all in a single message** using parallel Task tool calls.\n`;
    prompt += `Do NOT execute parallel steps sequentially — this wastes time.\n\n`;
  }

  prompt += `Each step must be completed before moving to steps that depend on it.\n`;

  if (workflow.cwd) {
    prompt += `Working directory: \`${workflow.cwd}\`\n`;
  }

  prompt += `\nBegin by asking clarifying questions now.\n`;

  return prompt;
}
