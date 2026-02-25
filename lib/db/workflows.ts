import { getDb } from "./index";
import { listWorkflowAgents, upsertWorkflowAgent } from "./workflow-agents";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
} from "@/types/workflow";
import type { ConfigProvider } from "@/types/provider";

function generateId(): string {
  return `wf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function rowToWorkflow(row: Record<string, unknown>): Workflow {
  return {
    id: row.id as string,
    provider: ((row.provider as ConfigProvider | undefined) ?? "claude"),
    name: row.name as string,
    description: row.description as string,
    generatedPlan: row.generated_plan as string,
    nodes: (() => { try { return JSON.parse((row.nodes as string) || "[]"); } catch { return []; } })() as WorkflowNode[],
    edges: (() => { try { return JSON.parse((row.edges as string) || "[]"); } catch { return []; } })() as WorkflowEdge[],
    cwd: row.cwd as string,
    swarmId: (row.swarm_id as string) || null,
    commandName: (row.command_name as string) || null,
    commandDescription: (row.command_description as string) || null,
    activationContext: (row.activation_context as string) || null,
    autoSkillEnabled: row.auto_skill_enabled !== 0,
    projectId: (row.project_id as string) || undefined,
    projectPath: (row.project_path as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listWorkflows(
  opts?: { projectId?: string; scope?: "all" | "global" | "project" },
): Workflow[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (opts?.scope === "global") {
    conditions.push("project_id IS NULL");
  } else if (opts?.scope === "project" && opts.projectId) {
    conditions.push("project_id = ?");
    params.push(opts.projectId);
  } else if (opts?.projectId && opts?.scope !== "all") {
    conditions.push("project_id = ?");
    params.push(opts.projectId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db
    .prepare(`SELECT * FROM workflows ${where} ORDER BY updated_at DESC`)
    .all(...params) as Record<string, unknown>[];
  return rows.map(rowToWorkflow);
}

export function getWorkflow(
  id: string,
  opts?: { includeAgents?: boolean },
): Workflow | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM workflows WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const workflow = rowToWorkflow(row);
  if (opts?.includeAgents !== false) {
    workflow.scopedAgents = listWorkflowAgents(id);
  }
  return workflow;
}

export function createWorkflow(data: {
  provider?: ConfigProvider;
  name: string;
  description?: string;
  generatedPlan?: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
  cwd?: string;
  commandName?: string | null;
  commandDescription?: string | null;
  activationContext?: string | null;
  autoSkillEnabled?: boolean;
  projectId?: string;
  projectPath?: string;
}): Workflow {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO workflows (id, provider, name, description, generated_plan, nodes, edges, cwd, status,
      command_name, command_description, activation_context, auto_skill_enabled,
      project_id, project_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    data.provider ?? "claude",
    data.name,
    data.description ?? "",
    data.generatedPlan ?? "",
    JSON.stringify(data.nodes ?? []),
    JSON.stringify(data.edges ?? []),
    data.cwd ?? "",
    data.commandName ?? null,
    data.commandDescription ?? null,
    data.activationContext ?? null,
    data.autoSkillEnabled !== false ? 1 : 0,
    data.projectId ?? null,
    data.projectPath ?? null,
    now,
    now,
  );

  return getWorkflow(id)!;
}

export function updateWorkflow(
  id: string,
  data: {
    provider?: ConfigProvider;
    name?: string;
    description?: string;
    generatedPlan?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    cwd?: string;
    swarmId?: string | null;
    commandName?: string | null;
    commandDescription?: string | null;
    activationContext?: string | null;
    autoSkillEnabled?: boolean;
  },
): Workflow | null {
  const db = getDb();
  const existing = getWorkflow(id, { includeAgents: false });
  if (!existing) return null;

  const now = new Date().toISOString();
  const sets: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];

  if (data.provider !== undefined) {
    sets.push("provider = ?");
    params.push(data.provider);
  }
  if (data.name !== undefined) {
    sets.push("name = ?");
    params.push(data.name);
  }
  if (data.description !== undefined) {
    sets.push("description = ?");
    params.push(data.description);
  }
  if (data.generatedPlan !== undefined) {
    sets.push("generated_plan = ?");
    params.push(data.generatedPlan);
  }
  if (data.nodes !== undefined) {
    sets.push("nodes = ?");
    params.push(JSON.stringify(data.nodes));
  }
  if (data.edges !== undefined) {
    sets.push("edges = ?");
    params.push(JSON.stringify(data.edges));
  }
  if (data.cwd !== undefined) {
    sets.push("cwd = ?");
    params.push(data.cwd);
  }
  if (data.swarmId !== undefined) {
    sets.push("swarm_id = ?");
    params.push(data.swarmId);
  }
  if (data.commandName !== undefined) {
    sets.push("command_name = ?");
    params.push(data.commandName);
  }
  if (data.commandDescription !== undefined) {
    sets.push("command_description = ?");
    params.push(data.commandDescription);
  }
  if (data.activationContext !== undefined) {
    sets.push("activation_context = ?");
    params.push(data.activationContext);
  }
  if (data.autoSkillEnabled !== undefined) {
    sets.push("auto_skill_enabled = ?");
    params.push(data.autoSkillEnabled ? 1 : 0);
  }

  params.push(id);
  db.prepare(`UPDATE workflows SET ${sets.join(", ")} WHERE id = ?`).run(
    ...params,
  );

  return getWorkflow(id);
}

export function duplicateWorkflow(id: string): Workflow | null {
  const existing = getWorkflow(id);
  if (!existing) return null;
  const copy = createWorkflow({
    provider: existing.provider,
    name: `${existing.name} (Copy)`,
    description: existing.description,
    generatedPlan: existing.generatedPlan,
    nodes: existing.nodes,
    edges: existing.edges,
    cwd: existing.cwd,
  });
  if (copy && existing.scopedAgents) {
    for (const sa of existing.scopedAgents) {
      upsertWorkflowAgent(copy.id, {
        name: sa.name,
        description: sa.description,
        model: sa.model,
        effort: sa.effort,
        tools: sa.tools,
        disallowedTools: sa.disallowedTools,
        color: sa.color,
        icon: sa.icon,
        category: sa.category,
        prompt: sa.prompt,
        skills: sa.skills,
      });
    }
    copy.scopedAgents = listWorkflowAgents(copy.id);
  }
  return copy;
}

export function deleteWorkflow(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM workflows WHERE id = ?").run(id);
  return result.changes > 0;
}
