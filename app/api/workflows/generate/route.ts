import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

type WorkflowComplexity = "auto" | "simple" | "balanced" | "complex";
type EffortLevel = "low" | "medium" | "high";
type WorkflowPattern =
  | "bugfix"
  | "feature"
  | "refactor"
  | "migration"
  | "release"
  | "research"
  | "security"
  | "ops"
  | "data"
  | "general";
type BudgetProfile = "lean" | "balanced" | "thorough";

interface TaskCountGuidance {
  min: number;
  max: number;
  exact: number | null;
}

interface WorkflowGenerationProfile {
  pattern: WorkflowPattern;
  budget: BudgetProfile;
  requiresValidation: boolean;
  requiresDocs: boolean;
  requiresRollout: boolean;
  requiresDataSafety: boolean;
  prefersParallelism: boolean;
  focusHints: string[];
}

interface NormalizedTask {
  id: string;
  label: string;
  taskDescription: string;
  agentName: string;
  dependsOn: string[];
  skills: string[];
  effort?: EffortLevel;
}

const PORTABLE_WORKFLOW_PLANNER_DIR = path.join(
  os.tmpdir(),
  "velocity-workflow-planner",
);

function resolvePortablePlannerCwd(): string {
  try {
    fs.mkdirSync(PORTABLE_WORKFLOW_PLANNER_DIR, { recursive: true });
    return PORTABLE_WORKFLOW_PLANNER_DIR;
  } catch {
    return os.tmpdir();
  }
}

/** Normalize a name to kebab-case */
function toKebab(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function includesAny(text: string, signals: string[]): boolean {
  return signals.some((signal) => text.includes(signal));
}

function parsePromptTaskCountGuidance(prompt: string): TaskCountGuidance | null {
  const rangeMatch = prompt.match(
    /\b(\d{1,2})\s*(?:-|to)\s*(\d{1,2})\s+(?:tasks?|steps?)\b/i,
  );
  if (rangeMatch) {
    const a = clampInt(Number(rangeMatch[1]), 1, 15);
    const b = clampInt(Number(rangeMatch[2]), 1, 15);
    return {
      min: Math.min(a, b),
      max: Math.max(a, b),
      exact: null,
    };
  }

  const exactMatch = prompt.match(
    /\b(?:exactly|strictly|must have|needs?|require(?:s|d)?)\s+(\d{1,2})\s+(?:tasks?|steps?)\b/i,
  );
  if (exactMatch) {
    const exact = clampInt(Number(exactMatch[1]), 1, 15);
    return { min: exact, max: exact, exact };
  }

  const atLeastMatch = prompt.match(
    /\b(?:at least|minimum|min)\s+(\d{1,2})\s+(?:tasks?|steps?)\b/i,
  );
  const atMostMatch = prompt.match(
    /\b(?:at most|maximum|max|up to|no more than)\s+(\d{1,2})\s+(?:tasks?|steps?)\b/i,
  );
  if (atLeastMatch || atMostMatch) {
    const min = atLeastMatch ? clampInt(Number(atLeastMatch[1]), 1, 15) : 1;
    const max = atMostMatch ? clampInt(Number(atMostMatch[1]), min, 15) : 15;
    return { min, max, exact: min === max ? min : null };
  }

  return null;
}

function inferComplexityFromPrompt(prompt: string): Exclude<WorkflowComplexity, "auto"> {
  const text = prompt.toLowerCase();
  const complexSignals = [
    "end-to-end",
    "e2e",
    "architecture",
    "migration",
    "refactor",
    "deploy",
    "production",
    "pipeline",
    "ci/cd",
    "observability",
    "monitoring",
    "security",
    "performance",
    "multi-service",
    "full stack",
  ];
  if (complexSignals.some((signal) => text.includes(signal))) return "complex";

  const simpleSignals = [
    "small",
    "simple",
    "quick",
    "minor",
    "single file",
    "tiny",
  ];
  if (simpleSignals.some((signal) => text.includes(signal))) return "simple";

  return "balanced";
}

function deriveGenerationProfile(
  prompt: string,
  complexity: WorkflowComplexity,
): WorkflowGenerationProfile {
  const text = prompt.toLowerCase();

  const pattern: WorkflowPattern = (() => {
    if (
      includesAny(text, [
        "security",
        "vulnerability",
        "auth",
        "permission",
        "injection",
        "xss",
        "csrf",
        "secret",
        "audit",
      ])
    ) {
      return "security";
    }
    if (
      includesAny(text, [
        "migration",
        "migrate",
        "backfill",
        "schema change",
        "data move",
        "cutover",
      ])
    ) {
      return "migration";
    }
    if (
      includesAny(text, [
        "deploy",
        "release",
        "rollout",
        "canary",
        "staging",
        "production",
        "ship",
      ])
    ) {
      return "release";
    }
    if (
      includesAny(text, [
        "bug",
        "fix",
        "hotfix",
        "regression",
        "incident",
        "broken",
        "crash",
      ])
    ) {
      return "bugfix";
    }
    if (
      includesAny(text, [
        "refactor",
        "cleanup",
        "restructure",
        "modularize",
        "tech debt",
      ])
    ) {
      return "refactor";
    }
    if (
      includesAny(text, [
        "research",
        "spike",
        "evaluate",
        "compare",
        "investigate",
        "explore",
      ])
    ) {
      return "research";
    }
    if (
      includesAny(text, [
        "etl",
        "warehouse",
        "pipeline",
        "dataset",
        "ingest",
        "analytics",
      ])
    ) {
      return "data";
    }
    if (
      includesAny(text, [
        "monitoring",
        "alert",
        "on-call",
        "runbook",
        "observability",
        "slo",
      ])
    ) {
      return "ops";
    }
    if (
      includesAny(text, [
        "build",
        "implement",
        "feature",
        "endpoint",
        "ui",
        "workflow",
      ])
    ) {
      return "feature";
    }
    return "general";
  })();

  const budgetFromPrompt: BudgetProfile = (() => {
    if (
      includesAny(text, [
        "quick",
        "fast",
        "mvp",
        "small",
        "lightweight",
        "cheap",
        "low cost",
      ])
    ) {
      return "lean";
    }
    if (
      includesAny(text, [
        "production",
        "critical",
        "enterprise",
        "robust",
        "harden",
        "high confidence",
      ])
    ) {
      return "thorough";
    }
    return "balanced";
  })();

  const budget: BudgetProfile =
    complexity === "simple"
      ? "lean"
      : complexity === "complex"
        ? "thorough"
        : budgetFromPrompt;

  const requiresDocs =
    includesAny(text, ["docs", "documentation", "readme", "guide"]) ||
    pattern === "release" ||
    pattern === "feature";
  const requiresValidation = !includesAny(text, ["prototype only", "throwaway"]);
  const requiresRollout = pattern === "release" || pattern === "migration";
  const requiresDataSafety =
    pattern === "migration" ||
    pattern === "data" ||
    includesAny(text, ["database", "data integrity", "backfill"]);
  const prefersParallelism = !includesAny(text, [
    "sequential",
    "step by step only",
    "strict order",
  ]);

  const focusHints: string[] = [];
  if (pattern === "bugfix") {
    focusHints.push(
      "Include reproduce/triage, targeted fix, and regression-proof validation.",
    );
  }
  if (pattern === "feature") {
    focusHints.push(
      "Split into design, implementation, and verification with clear file-level boundaries.",
    );
  }
  if (pattern === "refactor") {
    focusHints.push(
      "Preserve behavior while improving structure; include compatibility checks.",
    );
  }
  if (pattern === "migration") {
    focusHints.push(
      "Include migration safety: backup/rollback path, data verification, and cutover checks.",
    );
  }
  if (pattern === "release") {
    focusHints.push(
      "Include release gates: deploy prep, rollout verification, and post-deploy monitoring.",
    );
  }
  if (pattern === "security") {
    focusHints.push(
      "Prioritize threat surface reduction, secure defaults, and explicit abuse-case tests.",
    );
  }
  if (pattern === "research") {
    focusHints.push(
      "Time-box exploration and end with decision criteria plus recommendation.",
    );
  }
  if (pattern === "ops") {
    focusHints.push(
      "Include observability, alerting thresholds, and runbook updates.",
    );
  }
  if (pattern === "data") {
    focusHints.push(
      "Include data quality checks, idempotency expectations, and reconciliation steps.",
    );
  }

  if (budget === "lean") {
    focusHints.push(
      "Optimize for speed and cost: fewer steps, low/medium effort by default, avoid unnecessary high-effort analysis.",
    );
  } else if (budget === "thorough") {
    focusHints.push(
      "Optimize for confidence: include risk-reduction steps and tighter validation gates.",
    );
  } else {
    focusHints.push(
      "Balance velocity with confidence: parallelize independent work and keep scope tight per task.",
    );
  }

  return {
    pattern,
    budget,
    requiresValidation,
    requiresDocs,
    requiresRollout,
    requiresDataSafety,
    prefersParallelism,
    focusHints,
  };
}

function deriveTaskCountGuidance(
  prompt: string,
  complexity: WorkflowComplexity,
  existingAgentCount: number,
  profile?: WorkflowGenerationProfile,
): TaskCountGuidance {
  const fromPrompt = parsePromptTaskCountGuidance(prompt);
  if (fromPrompt) return fromPrompt;

  const effectiveComplexity =
    complexity === "auto" ? inferComplexityFromPrompt(prompt) : complexity;

  let min: number;
  let max: number;
  switch (effectiveComplexity) {
    case "simple":
      min = 2;
      max = 4;
      break;
    case "balanced":
      min = 4;
      max = 7;
      break;
    case "complex":
      min = 7;
      max = 12;
      break;
    default:
      min = 3;
      max = 6;
      break;
  }

  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 140) {
    min += 2;
    max += 3;
  } else if (wordCount > 70) {
    min += 1;
    max += 2;
  } else if (wordCount < 14) {
    min = Math.max(2, min - 1);
    max = Math.max(min + 1, max - 2);
  }

  if (existingAgentCount > max) {
    min = existingAgentCount;
    max = existingAgentCount + 3;
  }

  if (profile) {
    if (profile.pattern === "bugfix") {
      min += 0;
      max += 1;
    } else if (profile.pattern === "migration" || profile.pattern === "release") {
      min += 1;
      max += 2;
    } else if (profile.pattern === "research") {
      min = Math.max(2, min - 1);
      max = Math.max(min + 1, max - 1);
    }

    if (profile.budget === "lean") {
      min = Math.max(2, min - 1);
      max = Math.max(min + 1, max - 2);
    } else if (profile.budget === "thorough") {
      min += 1;
      max += 1;
    }
  }

  min = clampInt(min, 1, 15);
  max = clampInt(max, min, 15);
  return { min, max, exact: null };
}

function isTaskCountWithinGuidance(
  count: number,
  guidance: TaskCountGuidance,
): boolean {
  if (guidance.exact != null) return count === guidance.exact;
  return count >= guidance.min && count <= guidance.max;
}

function formatTaskCountGuidance(guidance: TaskCountGuidance): string {
  if (guidance.exact != null) {
    return `Return exactly ${guidance.exact} tasks.`;
  }
  return `Return between ${guidance.min} and ${guidance.max} tasks.`;
}

function normalizeEffort(value: unknown): EffortLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
}

function inferTaskEffort(
  task: Pick<NormalizedTask, "label" | "taskDescription" | "dependsOn">,
  profile: WorkflowGenerationProfile,
): EffortLevel {
  const text = `${task.label} ${task.taskDescription}`.toLowerCase();
  const highSignals = [
    "architecture",
    "design",
    "trade-off",
    "security",
    "threat",
    "migration",
    "rollback",
    "incident",
    "root cause",
    "triage",
    "cutover",
    "reconcile",
  ];
  if (includesAny(text, highSignals) || task.dependsOn.length >= 2) return "high";

  const lowSignals = [
    "docs",
    "readme",
    "changelog",
    "lint",
    "format",
    "rename",
    "cleanup",
    "scaffold",
    "wiring",
  ];
  if (includesAny(text, lowSignals)) return "low";

  const validationSignals = [
    "test",
    "verify",
    "validation",
    "qa",
    "smoke",
    "assert",
    "regression",
  ];
  if (includesAny(text, validationSignals)) {
    return profile.budget === "thorough" ? "medium" : "low";
  }

  if (profile.budget === "lean") return "low";
  if (profile.budget === "thorough") return "medium";
  return "medium";
}

function hasTaskKeyword(tasks: NormalizedTask[], regex: RegExp): boolean {
  return tasks.some((task) => regex.test(`${task.label} ${task.taskDescription}`));
}

function isMostlyLinearChain(tasks: NormalizedTask[]): boolean {
  if (tasks.length < 5) return false;
  const directPrevCount = tasks.filter((task, index) => {
    if (index === 0) return task.dependsOn.length === 0;
    return task.dependsOn.length === 1 && task.dependsOn[0] === tasks[index - 1].id;
  }).length;
  return directPrevCount / tasks.length >= 0.8;
}

function evaluatePlanQuality(
  tasks: NormalizedTask[],
  profile: WorkflowGenerationProfile,
  guidance: TaskCountGuidance,
): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 0;

  if (!isTaskCountWithinGuidance(tasks.length, guidance)) {
    score += 5;
  }

  if (
    profile.requiresValidation &&
    !hasTaskKeyword(tasks, /\b(test|tests|testing|verify|validation|qa|smoke|regression)\b/i)
  ) {
    issues.push("Add an explicit validation/testing gate.");
    score += 4;
  }

  if (
    profile.requiresDocs &&
    !hasTaskKeyword(tasks, /\b(doc|docs|readme|guide|changelog|runbook)\b/i)
  ) {
    issues.push("Add a documentation/update step where relevant.");
    score += 2;
  }

  if (
    profile.requiresRollout &&
    !hasTaskKeyword(tasks, /\b(deploy|release|rollout|canary|monitor|observability)\b/i)
  ) {
    issues.push("Include rollout/deployment verification.");
    score += 3;
  }

  if (
    profile.requiresDataSafety &&
    !hasTaskKeyword(tasks, /\b(backup|rollback|integrity|reconcile|backfill|dual[- ]write)\b/i)
  ) {
    issues.push("Include data safety checks (backup/rollback/reconciliation).");
    score += 3;
  }

  if (
    profile.pattern === "bugfix" &&
    !hasTaskKeyword(tasks, /\b(reproduce|triage|root cause|investigate)\b/i)
  ) {
    issues.push("Include an investigation/reproduction step for bugfix workflows.");
    score += 2;
  }

  if (profile.prefersParallelism && isMostlyLinearChain(tasks)) {
    issues.push("Increase parallelism by removing unnecessary sequential dependencies.");
    score += 2;
  }

  const minDescriptionWords = profile.budget === "lean" ? 10 : 14;
  const thinDescriptionRatio =
    tasks.length <= 3
      ? profile.budget === "lean"
        ? 0.8
        : 0.66
      : profile.budget === "lean"
        ? 0.65
        : 0.4;
  const thinDescriptions = tasks.filter((task) => {
    const words = task.taskDescription.trim().split(/\s+/).filter(Boolean).length;
    return words < minDescriptionWords;
  }).length;
  if (thinDescriptions > Math.ceil(tasks.length * thinDescriptionRatio)) {
    issues.push("Make task descriptions more specific with files and acceptance criteria.");
    score += profile.budget === "lean" ? 1 : 2;
  }

  return { score, issues };
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
    effort?: string;
  }>,
  hasExistingAgents: boolean,
  profile: WorkflowGenerationProfile,
  existingNames?: Set<string>,
  validSkillNames?: Set<string>,
): NormalizedTask[] {
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

    const effort =
      normalizeEffort(t.effort) ??
      inferTaskEffort({ label, taskDescription, dependsOn }, profile);

    return { id, label, taskDescription, agentName, dependsOn, skills, effort };
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
    const { prompt, cwd, existingAgents, model: requestedModel, complexity } =
      (await req.json()) as {
        prompt?: string;
        cwd?: string;
        existingAgents?: { name: string; description: string }[];
        model?: string;
        complexity?: WorkflowComplexity;
    };

    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 },
      );
    }

    aiLog.info("POST /api/workflows/generate", {
      promptLen: prompt.length,
      model: requestedModel,
      agentCount: existingAgents?.length ?? 0,
      complexity: complexity ?? "auto",
    });
    const start = Date.now();
    const result = await generateWithAI(
      prompt,
      cwd,
      existingAgents,
      requestedModel,
      complexity ?? "auto",
    );
    aiLog.info("workflow generated", {
      elapsed: Date.now() - start,
      nodeCount: result.nodes.length,
      edgeCount: result.edges.length,
    });
    return NextResponse.json(result);
  } catch (err) {
    aiLog.error("workflow generate failed", err);
    const details =
      process.env.NODE_ENV !== "production"
        ? err instanceof Error
          ? err.message
          : String(err)
        : undefined;
    return NextResponse.json(
      { error: "Failed to generate workflow", details },
      { status: 500 },
    );
  }
}

async function generateWithAI(
  prompt: string,
  cwd?: string,
  existingAgents?: { name: string; description: string }[],
  requestedModel?: string,
  complexity: WorkflowComplexity = "auto",
): Promise<{
  plan: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}> {
  const plannerCwd = resolvePortablePlannerCwd();
  const hasAgents = existingAgents && existingAgents.length > 0;
  const profile = deriveGenerationProfile(prompt, complexity);
  const taskCountGuidance = deriveTaskCountGuidance(
    prompt,
    complexity,
    existingAgents?.length ?? 0,
    profile,
  );
  const taskCountRule = formatTaskCountGuidance(taskCountGuidance);

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
For each task, you may optionally include a "skills" array with skill names from the list above.
Only include skills that are truly relevant and cap at 2 skills per task.`
      : "";

  const profileBlock = `\n\nWorkflow profile inferred from request:
- pattern: ${profile.pattern}
- budget: ${profile.budget}
- requiresValidation: ${profile.requiresValidation ? "yes" : "no"}
- requiresDocs: ${profile.requiresDocs ? "yes" : "no"}
- requiresRollout: ${profile.requiresRollout ? "yes" : "no"}
- requiresDataSafety: ${profile.requiresDataSafety ? "yes" : "no"}
- prefersParallelism: ${profile.prefersParallelism ? "yes" : "no"}

Planning focus:
${profile.focusHints.map((hint) => `- ${hint}`).join("\n")}`;

  const agentBlock = hasAgents
    ? `\n\nYou MUST ONLY use these exact agent names (do NOT invent new names):
${existingAgents.map((a) => `- "${a.name}": ${a.description}`).join("\n")}
You may assign multiple tasks to the same agent if appropriate, but try to distribute work evenly.
Task count should reflect workload complexity, NOT the number of selected agents.`
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
      "skills": ["skill-name"],
      "effort": "low|medium|high"
    }
  ]
}

Example output:
{
  "name": "API Auth System",
  "plan": "Add JWT authentication middleware with login/register endpoints and protected route guards",
  "tasks": [
    {"id":"step-1","label":"Create auth middleware","taskDescription":"Create src/middleware/auth.ts — JWT verification middleware that extracts Bearer token, validates with jsonwebtoken, attaches decoded user to req.user. Export requireAuth and optionalAuth variants. Add 401 response for invalid/missing tokens.","agentName":"auth-middleware","dependsOn":[],"skills":[],"effort":"medium"},
    {"id":"step-2","label":"Build user endpoints","taskDescription":"Create src/routes/auth.ts — POST /register (hash password with bcrypt, store in users table, return JWT) and POST /login (verify credentials, return JWT). Validate email format and password length >= 8.","agentName":"auth-endpoints","dependsOn":[],"skills":[],"effort":"high"},
    {"id":"step-3","label":"Add route protection","taskDescription":"Update src/routes/index.ts — apply requireAuth middleware to all /api/* routes except /api/auth/*. Add GET /api/me endpoint returning current user from req.user.","agentName":"route-guard","dependsOn":["step-1","step-2"],"skills":[],"effort":"medium"},
    {"id":"step-4","label":"Write auth tests","taskDescription":"Create tests/auth.test.ts — test register (valid + duplicate email), login (valid + wrong password), protected routes (valid token + missing token + expired token). Use supertest.","agentName":"auth-tester","dependsOn":["step-3"],"skills":[],"effort":"low"}
  ]
}

Rules:
- IDs must follow "step-N" pattern (step-1, step-2, etc.)
- agentName: required, kebab-case, describes the agent's role
- effort: required, one of low/medium/high. Use low for deterministic/mechanical tasks, medium for implementation, high for architecture/risk-heavy decisions
- dependsOn: only reference valid step IDs. Prefer PARALLEL branches over linear chains — tasks that don't share inputs/outputs should run concurrently
- Do NOT create single linear chains when tasks are independent. If step-2 doesn't need step-1's output, they should have no dependency
- taskDescription must include: specific files/paths, what to create or modify, acceptance criteria, and scope boundaries. Vague descriptions like "set up the backend" are not acceptable
- Never include machine-specific absolute paths (e.g. /Users/..., C:\\...). Use project-relative paths rooted at <project-root>
- Do NOT reference local repository names or host-specific directory names
- ${taskCountRule}
- If the user request is underspecified, make practical assumptions and still return an executable "good enough" plan instead of placeholders
- Each task should be completable in one focused session${profileBlock}${agentBlock}${skillBlock}`;

  const portabilityContext = cwd
    ? "The execution directory is selected at runtime. Keep this workflow portable and describe file targets relative to <project-root>."
    : "This workflow may run in any repository. Keep it portable and describe file targets relative to <project-root>.";
  const userMessage = `Goal: ${prompt}\n\n${portabilityContext}`;

  const existingNameSet = hasAgents
    ? new Set(existingAgents!.map((a) => a.name))
    : undefined;
  const validSkillNames = new Set(availableSkills.map((s) => s.name));

  const runAttempt = async (followupInstruction?: string) => {
    const fullUserMessage = followupInstruction
      ? `${userMessage}\n\n${followupInstruction}`
      : userMessage;

    aiLog.info("calling aiGenerate", {
      model: requestedModel,
      promptChars: fullUserMessage.length,
      guidance: taskCountRule,
    });
    const raw = await aiGenerate(fullUserMessage, {
      system: systemPrompt,
      cwd: plannerCwd,
      model: requestedModel,
      timeoutMs: 600_000,
    });
    if (typeof raw !== "string" || raw.trim().length === 0) {
      throw new Error("AI returned empty response");
    }
    aiLog.info("raw AI response", {
      chars: raw.length,
      preview: raw.slice(0, 200).replace(/\n/g, " "),
    });

    const jsonStr = extractFirstJsonObject(raw);
    if (!jsonStr) {
      aiLog.error("no JSON found in response", undefined, {
        rawPreview: raw.slice(0, 500),
      });
      throw new Error("No valid JSON in AI response");
    }

    const parsed = JSON.parse(jsonStr);
    const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    const tasks = validateTasks(
      rawTasks,
      !!hasAgents,
      profile,
      existingNameSet,
      validSkillNames,
    );
    if (tasks.length === 0) {
      throw new Error("AI returned no valid tasks");
    }
    return { parsed, tasks };
  };

  const buildRetryInstruction = (
    currentTasks: NormalizedTask[],
    qualityIssues: string[],
    hasCountMismatch: boolean,
  ) => {
    const countInstruction =
      taskCountGuidance.exact != null
        ? `Use exactly ${taskCountGuidance.exact} tasks.`
        : `Use between ${taskCountGuidance.min} and ${taskCountGuidance.max} tasks.`;
    const issuesSection =
      qualityIssues.length > 0
        ? `\nQuality issues to fix:\n${qualityIssues
            .slice(0, 5)
            .map((issue) => `- ${issue}`)
            .join("\n")}`
        : "";
    const draftSummary = currentTasks
      .slice(0, 12)
      .map(
        (task) =>
          `- ${task.id} | ${task.label} | deps: ${task.dependsOn.join(",") || "none"}`,
      )
      .join("\n");
    return `Regenerate the workflow plan with stronger quality and execution efficiency.
${countInstruction}
${hasCountMismatch ? "Fix the task-count mismatch from the previous draft." : ""}
Keep tasks concrete and parallel where possible.${issuesSection}

Previous draft summary:
${draftSummary}`;
  };

  let generation = await runAttempt();
  const firstQuality = evaluatePlanQuality(
    generation.tasks,
    profile,
    taskCountGuidance,
  );
  const firstCountMismatch = !isTaskCountWithinGuidance(
    generation.tasks.length,
    taskCountGuidance,
  );
  const shouldRetryForQuality = firstQuality.score >= 3;
  if (firstCountMismatch || shouldRetryForQuality) {
    aiLog.info("retrying workflow generation after quality check", {
      count: generation.tasks.length,
      guidance: taskCountRule,
      qualityScore: firstQuality.score,
      issues: firstQuality.issues,
    });
    try {
      const retryInstruction = buildRetryInstruction(
        generation.tasks,
        firstQuality.issues,
        firstCountMismatch,
      );
      const retried = await runAttempt(retryInstruction);
      const retriedQuality = evaluatePlanQuality(
        retried.tasks,
        profile,
        taskCountGuidance,
      );
      if (retriedQuality.score <= firstQuality.score || firstCountMismatch) {
        generation = retried;
      }
    } catch (retryErr) {
      aiLog.info("workflow generation retry failed; using first draft", {
        error: retryErr instanceof Error ? retryErr.message : String(retryErr),
      });
    }
  }

  const { parsed, tasks } = generation;

  const rawNodes: WorkflowNode[] = tasks.map((t) => ({
    id: t.id,
    label: t.label,
    taskDescription: t.taskDescription,
    agentName: t.agentName,
    effort: t.effort,
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
