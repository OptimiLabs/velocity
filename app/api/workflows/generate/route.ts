import { NextRequest, NextResponse } from "next/server";
import type { WorkflowNode, WorkflowEdge } from "@/types/workflow";
import {
  autoLayout,
  buildEdgesFromDeps,
  pruneDisconnectedNodes,
} from "@/lib/workflows/layout";
import { listAllSkills } from "@/lib/skills";
import { aiGenerate } from "@/lib/ai/generate";
import { extractFirstJsonObject } from "@/lib/ai/parse";
import { aiLog } from "@/lib/logger";

/** Normalize a name to kebab-case */
function toKebab(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Validate and fix AI-generated tasks in-place (permissive — logs warnings, never throws) */
function validateTasks(
  tasks: Array<{
    id?: string;
    label?: string;
    taskDescription?: string;
    agentName?: string;
    dependsOn?: string[];
    skills?: string[];
  }>,
  hasExistingAgents: boolean,
  existingNames?: Set<string>,
  validSkillNames?: Set<string>,
): Array<{
  id: string;
  label: string;
  taskDescription: string;
  agentName: string;
  dependsOn: string[];
  skills: string[];
}> {
  const validIds = new Set<string>();
  const seenAgentNames = new Set<string>();

  const result = tasks.map((t, i) => {
    // Ensure ID
    const id = t.id || `step-${i + 1}`;
    validIds.add(id);

    // Ensure label
    const label = t.label || `Task ${i + 1}`;

    // Ensure taskDescription
    const taskDescription = t.taskDescription || label;

    // Normalize agentName to kebab-case
    let agentName = t.agentName ? toKebab(t.agentName) : toKebab(label);

    // For existing-agent mode, clamp to known names
    if (hasExistingAgents && existingNames && !existingNames.has(agentName)) {
      // Try fuzzy match — pick closest existing name
      const match = [...existingNames].find(
        (n) => agentName.includes(n) || n.includes(agentName),
      );
      if (match) {
        agentName = match;
      } else {
        console.warn(
          `[workflow-gen] Agent "${agentName}" not in existing set, keeping as-is`,
        );
      }
    }

    // Deduplicate agent names (ai-create mode only — each task gets a unique agent)
    if (!hasExistingAgents && seenAgentNames.has(agentName)) {
      let suffix = 2;
      while (seenAgentNames.has(`${agentName}-${suffix}`)) suffix++;
      agentName = `${agentName}-${suffix}`;
    }
    seenAgentNames.add(agentName);

    // Strip invalid dependsOn references
    const dependsOn = (t.dependsOn ?? []).filter((dep) => {
      if (!validIds.has(dep) && dep !== id) {
        // Allow forward references to step-N pattern
        if (/^step-\d+$/.test(dep)) return true;
        console.warn(
          `[workflow-gen] Stripped invalid dependsOn "${dep}" from ${id}`,
        );
        return false;
      }
      // No self-references
      return dep !== id;
    });

    // Validate skills against known skill names
    const skills = (t.skills ?? []).filter((s) => {
      if (validSkillNames && !validSkillNames.has(s)) {
        console.warn(`[workflow-gen] Stripped unknown skill "${s}" from ${id}`);
        return false;
      }
      return true;
    });

    return { id, label, taskDescription, agentName, dependsOn, skills };
  });

  // Second pass: strip forward references that resolved to non-existent IDs
  const allIds = new Set(result.map((t) => t.id));
  for (const t of result) {
    t.dependsOn = t.dependsOn.filter((dep) => {
      if (!allIds.has(dep)) {
        console.warn(
          `[workflow-gen] Stripped dangling dependsOn "${dep}" from ${t.id}`,
        );
        return false;
      }
      return true;
    });
  }

  return result;
}

/**
 * Generate a workflow plan from a natural language prompt.
 * Returns structured nodes + edges for the React Flow canvas.
 *
 * Uses the claude CLI (no API key required) for AI generation.
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt, cwd, existingAgents, model: requestedModel } =
      (await req.json()) as {
        prompt?: string;
        cwd?: string;
        existingAgents?: { name: string; description: string }[];
        model?: string;
    };

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    aiLog.info("POST /api/workflows/generate", { promptLen: prompt.length, model: requestedModel, agentCount: existingAgents?.length ?? 0 });
    const start = Date.now();
    const result = await generateWithAI(prompt, cwd, existingAgents, requestedModel);
    aiLog.info("workflow generated", { elapsed: Date.now() - start, nodeCount: result.nodes.length, edgeCount: result.edges.length });
    return NextResponse.json(result);
  } catch (err) {
    aiLog.error("workflow generate failed", err);
    return NextResponse.json(
      { error: "Failed to generate workflow" },
      { status: 500 },
    );
  }
}

async function generateWithAI(
  prompt: string,
  cwd?: string,
  existingAgents?: { name: string; description: string }[],
  requestedModel?: string,
): Promise<{
  plan: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}> {
  const hasAgents = existingAgents && existingAgents.length > 0;

  // Fetch available skills for context
  let availableSkills: { name: string; description?: string }[] = [];
  try {
    availableSkills = listAllSkills()
      .slice(0, 20)
      .map((s) => ({
        name: s.name,
        description: s.description,
      }));
  } catch {
    // Skills unavailable — continue without them
  }

  const skillBlock =
    availableSkills.length > 0
      ? `\n\nAvailable skills that can be attached to agents:
${availableSkills.map((s) => `- "${s.name}"${s.description ? `: ${s.description}` : ""}`).join("\n")}
For each task, you may optionally include a "skills" array with skill names from the list above that are relevant to the task. Only suggest skills that genuinely match the task's purpose.`
      : "";

  const agentBlock = hasAgents
    ? `\n\nYou MUST ONLY use these exact agent names (do NOT invent new names):
${existingAgents.map((a) => `- "${a.name}": ${a.description}`).join("\n")}
You may assign multiple tasks to the same agent if appropriate, but try to distribute work evenly. Match task count closely to agent count.`
    : `\n\nNo existing agents are provided. For each task, create a UNIQUE descriptive "agentName" in kebab-case that captures the role (e.g. "code-reviewer", "test-writer", "api-designer", "docs-author").
CRITICAL: Every task MUST have a different agentName — no two tasks can share the same agentName. Each task becomes its own agent node on the canvas.`;

  const systemPrompt = `You are a task planner for a multi-agent coding system. Break the user's goal into discrete, well-scoped tasks for AI coding agents.

Return ONLY valid JSON matching this schema:
{
  "name": "2-3 word workflow title",
  "plan": "1-2 sentence approach summary",
  "tasks": [
    {
      "id": "step-1",
      "label": "3-6 word task name",
      "taskDescription": "Detailed description: specific files to touch, acceptance criteria, scope boundaries",
      "agentName": "kebab-case-role-name",
      "dependsOn": ["step-N"],
      "skills": ["skill-name"]
    }
  ]
}

Example output:
{
  "name": "API Auth System",
  "plan": "Add JWT authentication middleware with login/register endpoints and protected route guards",
  "tasks": [
    {"id":"step-1","label":"Create auth middleware","taskDescription":"Create src/middleware/auth.ts — JWT verification middleware that extracts Bearer token, validates with jsonwebtoken, attaches decoded user to req.user. Export requireAuth and optionalAuth variants. Add 401 response for invalid/missing tokens.","agentName":"auth-middleware","dependsOn":[],"skills":[]},
    {"id":"step-2","label":"Build user endpoints","taskDescription":"Create src/routes/auth.ts — POST /register (hash password with bcrypt, store in users table, return JWT) and POST /login (verify credentials, return JWT). Validate email format and password length >= 8.","agentName":"auth-endpoints","dependsOn":[],"skills":[]},
    {"id":"step-3","label":"Add route protection","taskDescription":"Update src/routes/index.ts — apply requireAuth middleware to all /api/* routes except /api/auth/*. Add GET /api/me endpoint returning current user from req.user.","agentName":"route-guard","dependsOn":["step-1","step-2"],"skills":[]},
    {"id":"step-4","label":"Write auth tests","taskDescription":"Create tests/auth.test.ts — test register (valid + duplicate email), login (valid + wrong password), protected routes (valid token + missing token + expired token). Use supertest.","agentName":"auth-tester","dependsOn":["step-3"],"skills":[]}
  ]
}

Rules:
- IDs must follow "step-N" pattern (step-1, step-2, etc.)
- agentName: required, kebab-case, describes the agent's role
- dependsOn: only reference valid step IDs. Prefer PARALLEL branches over linear chains — tasks that don't share inputs/outputs should run concurrently
- Do NOT create single linear chains when tasks are independent. If step-2 doesn't need step-1's output, they should have no dependency
- taskDescription must include: specific files/paths, what to create or modify, acceptance criteria, and scope boundaries. Vague descriptions like "set up the backend" are not acceptable
- 3-5 tasks for simple goals, 6-12 for complex ones. Each task should be completable in one focused session${agentBlock}${skillBlock}`;

  const userMessage = cwd
    ? `Project directory: ${cwd}\n\nGoal: ${prompt}`
    : `Goal: ${prompt}`;

  aiLog.info("calling aiGenerate", { model: requestedModel, promptChars: userMessage.length });
  const raw = await aiGenerate(userMessage, { system: systemPrompt, cwd, model: requestedModel, timeoutMs: 600_000 });
  aiLog.info("raw AI response", { chars: raw.length, preview: raw.slice(0, 200).replace(/\n/g, " ") });

  const jsonStr = extractFirstJsonObject(raw);
  if (!jsonStr) {
    aiLog.error("no JSON found in response", undefined, { rawPreview: raw.slice(0, 500) });
    throw new Error("No valid JSON in AI response");
  }

  const parsed = JSON.parse(jsonStr);
  const rawTasks = parsed.tasks ?? [];

  const existingNameSet = hasAgents
    ? new Set(existingAgents!.map((a) => a.name))
    : undefined;
  const validSkillNames = new Set(availableSkills.map((s) => s.name));
  const tasks = validateTasks(
    rawTasks,
    !!hasAgents,
    existingNameSet,
    validSkillNames,
  );

  const rawNodes: WorkflowNode[] = tasks.map((t) => ({
    id: t.id,
    label: t.label,
    taskDescription: t.taskDescription,
    agentName: t.agentName,
    skills: t.skills.length > 0 ? t.skills : undefined,
    status: "unconfirmed" as const,
    position: { x: 0, y: 0 },
    dependsOn: t.dependsOn,
  }));

  const rawEdges = buildEdgesFromDeps(rawNodes);
  const { nodes, edges } = pruneDisconnectedNodes(rawNodes, rawEdges);
  const positioned = autoLayout(nodes, edges);

  const name = parsed.name ?? "";
  return { plan: parsed.plan ?? "", name, nodes: positioned, edges };
}
