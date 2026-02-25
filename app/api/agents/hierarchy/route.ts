import { NextResponse } from "next/server";
import { jsonWithCache } from "@/lib/api/cache-headers";
import fs from "fs";
import path from "path";
import { TODOS_DIR } from "@/lib/claude-paths";

interface TodoItem {
  content: string;
  status: string;
  activeForm?: string;
  id?: string;
}

interface AgentNode {
  id: string;
  sessionId: string;
  tasks: TodoItem[];
  taskCount: number;
  completedCount: number;
}

export async function GET() {
  if (!fs.existsSync(TODOS_DIR)) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const files = fs.readdirSync(TODOS_DIR).filter((f) => f.endsWith(".json"));
  const agentMap = new Map<string, AgentNode>();
  const edges: { source: string; target: string }[] = [];

  // Group files by session ID
  const sessionGroups = new Map<string, string[]>();

  for (const file of files) {
    // Naming: {session-id}-agent-{agent-id}.json
    const match = file.match(/^(.+?)-agent-(.+?)\.json$/);
    if (!match) continue;

    const [, sessionId, agentId] = match;
    const group = sessionGroups.get(sessionId) || [];
    group.push(agentId);
    sessionGroups.set(sessionId, group);

    // Read tasks
    const filePath = path.join(TODOS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const tasks: TodoItem[] = JSON.parse(content);
      if (!Array.isArray(tasks)) continue;

      const completedCount = tasks.filter(
        (t) => t.status === "completed",
      ).length;

      agentMap.set(agentId, {
        id: agentId,
        sessionId,
        tasks,
        taskCount: tasks.length,
        completedCount,
      });
    } catch {
      // Skip invalid files
    }
  }

  // Build edges: if a session has multiple agents, the session-id agent is the parent
  for (const [sessionId, agentIds] of sessionGroups) {
    if (agentIds.length > 1 && agentIds.includes(sessionId)) {
      // sessionId agent is the root, others are children
      for (const childId of agentIds) {
        if (childId !== sessionId) {
          edges.push({ source: sessionId, target: childId });
        }
      }
    }
  }

  // Convert to React Flow format
  const nodes = Array.from(agentMap.values())
    .sort((a, b) => b.taskCount - a.taskCount)
    .slice(0, 50) // Limit to 50 nodes for performance
    .map((agent, i) => ({
      id: agent.id,
      type: "agent",
      position: { x: (i % 6) * 220, y: Math.floor(i / 6) * 150 },
      data: {
        label: agent.id.slice(0, 8),
        taskCount: agent.taskCount,
        completedCount: agent.completedCount,
        sessionId: agent.sessionId,
        firstTask: agent.tasks[0]?.content || "",
      },
    }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const filteredEdges = edges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: true,
    }));

  return jsonWithCache({ nodes, edges: filteredEdges }, "stats");
}
