import { getDb } from "./index";
import type { WorkflowScopedAgent } from "@/types/workflow";

function generateId(): string {
  return `wa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToAgent(row: Record<string, unknown>): WorkflowScopedAgent {
  return {
    id: row.id as string,
    workflowId: row.workflow_id as string,
    name: row.name as string,
    description: (row.description as string) ?? "",
    model: (row.model as string) || undefined,
    effort: (row.effort as string) || undefined,
    tools: parseJsonArray(row.tools),
    disallowedTools: parseJsonArray(row.disallowed_tools),
    color: (row.color as string) || undefined,
    icon: (row.icon as string) || undefined,
    category: (row.category as string) || undefined,
    prompt: (row.prompt as string) ?? "",
    skills: parseJsonArray(row.skills),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function listWorkflowAgents(workflowId: string): WorkflowScopedAgent[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM workflow_agents WHERE workflow_id = ? ORDER BY name",
    )
    .all(workflowId) as Record<string, unknown>[];
  return rows.map(rowToAgent);
}

export function getWorkflowAgent(
  workflowId: string,
  name: string,
): WorkflowScopedAgent | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM workflow_agents WHERE workflow_id = ? AND name = ?")
    .get(workflowId, name) as Record<string, unknown> | undefined;
  return row ? rowToAgent(row) : null;
}

export function upsertWorkflowAgent(
  workflowId: string,
  data: {
    name: string;
    description?: string;
    model?: string;
    effort?: string;
    tools?: string[];
    disallowedTools?: string[];
    color?: string;
    icon?: string;
    category?: string;
    prompt?: string;
    skills?: string[];
  },
): WorkflowScopedAgent {
  const db = getDb();
  const existing = getWorkflowAgent(workflowId, data.name);

  if (existing) {
    db.prepare(
      `UPDATE workflow_agents SET
        description = ?, model = ?, effort = ?, tools = ?, disallowed_tools = ?,
        color = ?, icon = ?, category = ?, prompt = ?, skills = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE workflow_id = ? AND name = ?`,
    ).run(
      data.description ?? existing.description,
      data.model ?? existing.model ?? null,
      data.effort ?? existing.effort ?? null,
      JSON.stringify(data.tools ?? existing.tools),
      JSON.stringify(data.disallowedTools ?? existing.disallowedTools),
      data.color ?? existing.color ?? null,
      data.icon ?? existing.icon ?? null,
      data.category ?? existing.category ?? null,
      data.prompt ?? existing.prompt,
      JSON.stringify(data.skills ?? existing.skills),
      workflowId,
      data.name,
    );
    return getWorkflowAgent(workflowId, data.name)!;
  }

  const id = generateId();
  db.prepare(
    `INSERT INTO workflow_agents (id, workflow_id, name, description, model, effort, tools, disallowed_tools, color, icon, category, prompt, skills)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    workflowId,
    data.name,
    data.description ?? "",
    data.model ?? null,
    data.effort ?? null,
    JSON.stringify(data.tools ?? []),
    JSON.stringify(data.disallowedTools ?? []),
    data.color ?? null,
    data.icon ?? null,
    data.category ?? null,
    data.prompt ?? "",
    JSON.stringify(data.skills ?? []),
  );
  return getWorkflowAgent(workflowId, data.name)!;
}

export function deleteWorkflowAgent(workflowId: string, name: string): boolean {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM workflow_agents WHERE workflow_id = ? AND name = ?")
    .run(workflowId, name);
  return result.changes > 0;
}
