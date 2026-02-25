import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { AGENTS_DIR, DISABLED_AGENTS_DIR } from "../claude-paths";
import { getDb } from "@/lib/db";
import type { Agent } from "@/types/agent";

function parseStringList(val: unknown): string[] {
  if (typeof val === "string") return val.split(",").map((t) => t.trim());
  if (Array.isArray(val)) return val.filter((v) => typeof v === "string");
  return [];
}

function parseOptionalAreaPath(val: unknown): string | undefined {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return trimmed ? trimmed : undefined;
}

function parseAgentFile(
  filePath: string,
  fallbackName: string,
  options?: {
    scope?: "global" | "project";
    projectPath?: string;
    disabled?: boolean;
  },
): Agent | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content: prompt } = matter(raw);
    return {
      name: data.name || fallbackName,
      description:
        typeof data.description === "string"
          ? data.description.split("\n")[0].slice(0, 200)
          : "",
      model: data.model,
      effort: data.effort,
      tools: parseStringList(data.tools),
      disallowedTools: parseStringList(data.disallowedTools || data.deniedTools),
      color: data.color,
      icon: data.icon,
      category: data.category,
      prompt: prompt.trim(),
      filePath,
      scope: options?.scope,
      projectPath: options?.projectPath,
      areaPath: parseOptionalAreaPath(data.areaPath),
      enabled: options?.disabled ? false : true,
    };
  } catch {
    return null;
  }
}

function listAgentsFromDir(
  dir: string,
  options?: {
    scope?: "global" | "project";
    projectPath?: string;
    disabled?: boolean;
  },
): Agent[] {
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => {
      const parsed = parseAgentFile(
        path.join(dir, f),
        path.basename(f, ".md"),
        options,
      );
      return parsed ? [parsed] : [];
    });
}

function dedupeByName(items: Agent[]): Agent[] {
  const seen = new Set<string>();
  const out: Agent[] = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  return out;
}

function getProjectAgentsDir(projectPath: string): string {
  return path.join(projectPath, ".claude", "agents");
}

function getProjectDisabledAgentsDir(projectPath: string): string {
  return path.join(projectPath, ".claude.local", "disabled", "agents");
}

function listKnownProjectPaths(): string[] {
  try {
    const db = getDb();
    const out = new Set<string>();

    const projectRows = db
      .prepare("SELECT path FROM projects WHERE path IS NOT NULL AND path != ''")
      .all() as { path: string }[];
    for (const row of projectRows) {
      if (row.path?.trim()) out.add(row.path);
    }

    const sessionRows = db
      .prepare(
        "SELECT DISTINCT project_path FROM sessions WHERE project_path IS NOT NULL AND project_path != ''",
      )
      .all() as { project_path: string }[];
    for (const row of sessionRows) {
      if (row.project_path?.trim()) out.add(row.project_path);
    }

    return Array.from(out);
  } catch {
    return [];
  }
}

function buildAgentMarkdown(agent: Agent): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };
  if (agent.model) frontmatter.model = agent.model;
  if (agent.effort) frontmatter.effort = agent.effort;
  if (agent.tools && agent.tools.length > 0) {
    frontmatter.tools = agent.tools.join(", ");
  }
  if (agent.disallowedTools && agent.disallowedTools.length > 0) {
    frontmatter.disallowedTools = agent.disallowedTools.join(", ");
  }
  if (agent.color) frontmatter.color = agent.color;
  if (agent.icon) frontmatter.icon = agent.icon;
  if (agent.category) frontmatter.category = agent.category;
  if (agent.scope === "project" && agent.areaPath) {
    frontmatter.areaPath = agent.areaPath;
  }
  return matter.stringify(agent.prompt, frontmatter);
}

function moveAgentFile(from: string, to: string, disabled: boolean): boolean {
  if (!fs.existsSync(from)) return false;

  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) {
    fs.rmSync(to, { force: true });
  }
  fs.renameSync(from, to);

  const db = getDb();
  db.prepare(
    "UPDATE instruction_files SET is_active = ?, updated_at = ? WHERE file_path = ? OR file_path = ?",
  ).run(disabled ? 0 : 1, new Date().toISOString(), from, to);

  return true;
}

export function listAgents(): Agent[] {
  const activeAgents = listAgentsFromDir(AGENTS_DIR, {
    scope: "global",
    disabled: false,
  });
  const disabledAgents = listAgentsFromDir(DISABLED_AGENTS_DIR, {
    scope: "global",
    disabled: true,
  });
  return dedupeByName([...activeAgents, ...disabledAgents]);
}

export function getAgent(name: string): Agent | null {
  const safeName = path.basename(name);
  const activePath = path.join(AGENTS_DIR, `${safeName}.md`);
  const disabledPath = path.join(DISABLED_AGENTS_DIR, `${safeName}.md`);

  return (
    parseAgentFile(activePath, safeName, { scope: "global", disabled: false }) ||
    parseAgentFile(disabledPath, safeName, { scope: "global", disabled: true }) ||
    listAgents().find((a) => a.name === name) ||
    null
  );
}

export function getAgentByName(name: string): Agent | null {
  return getAgent(name);
}

const SAFE_AGENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/;

export function validateAgentName(name: string): string | null {
  if (!name || !SAFE_AGENT_NAME.test(name)) {
    return "Agent name must start with a letter or number and contain only letters, numbers, spaces, hyphens, or underscores";
  }
  if (name.includes("..")) {
    return "Agent name must not contain '..'";
  }
  return null;
}

export function saveAgent(agent: Agent): void {
  const nameError = validateAgentName(agent.name);
  if (nameError) {
    throw new Error(nameError);
  }

  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }

  const content = buildAgentMarkdown(agent);
  const filePath = agent.filePath || path.join(AGENTS_DIR, `${agent.name}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function deleteAgent(name: string): boolean {
  const safeName = path.basename(name);
  const activePath = path.join(AGENTS_DIR, `${safeName}.md`);
  const disabledPath = path.join(DISABLED_AGENTS_DIR, `${safeName}.md`);
  let deleted = false;

  for (const filePath of [activePath, disabledPath]) {
    try {
      fs.unlinkSync(filePath);
      deleted = true;
    } catch {
      // ignore missing file
    }
  }

  return deleted;
}

// --- Project-scoped agents ---

export function listProjectAgents(projectPath: string): Agent[] {
  const activeDir = getProjectAgentsDir(projectPath);
  const disabledDir = getProjectDisabledAgentsDir(projectPath);
  const activeAgents = listAgentsFromDir(activeDir, {
    scope: "project",
    projectPath,
    disabled: false,
  });
  const disabledAgents = listAgentsFromDir(disabledDir, {
    scope: "project",
    projectPath,
    disabled: true,
  });
  return dedupeByName([...activeAgents, ...disabledAgents]);
}

export function getProjectAgent(projectPath: string, name: string): Agent | null {
  const safeName = path.basename(name);
  const activePath = path.join(getProjectAgentsDir(projectPath), `${safeName}.md`);
  const disabledPath = path.join(
    getProjectDisabledAgentsDir(projectPath),
    `${safeName}.md`,
  );

  return (
    parseAgentFile(activePath, safeName, {
      scope: "project",
      projectPath,
      disabled: false,
    }) ||
    parseAgentFile(disabledPath, safeName, {
      scope: "project",
      projectPath,
      disabled: true,
    }) ||
    null
  );
}

export function saveProjectAgent(projectPath: string, agent: Agent): void {
  const content = buildAgentMarkdown(agent);
  const defaultPath = path.join(getProjectAgentsDir(projectPath), `${agent.name}.md`);
  const filePath =
    agent.filePath && path.basename(agent.filePath) === `${agent.name}.md`
      ? agent.filePath
      : defaultPath;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

export function deleteProjectAgent(projectPath: string, name: string): boolean {
  const safeName = path.basename(name);
  const activePath = path.join(getProjectAgentsDir(projectPath), `${safeName}.md`);
  const disabledPath = path.join(
    getProjectDisabledAgentsDir(projectPath),
    `${safeName}.md`,
  );
  let deleted = false;

  for (const filePath of [activePath, disabledPath]) {
    try {
      fs.unlinkSync(filePath);
      deleted = true;
    } catch {
      // ignore missing file
    }
  }

  return deleted;
}

/**
 * Toggle custom agent context files by moving them between active and disabled storage.
 * This keeps disabled agents out of provider context loading while preserving fast restore.
 */
export function setAgentDisabled(name: string, disabled: boolean): boolean {
  const safeName = path.basename(name);

  const globalActivePath = path.join(AGENTS_DIR, `${safeName}.md`);
  const globalDisabledPath = path.join(DISABLED_AGENTS_DIR, `${safeName}.md`);
  const projectPaths = listKnownProjectPaths();

  const candidates: { from: string; to: string }[] = [];

  if (disabled) {
    candidates.push({ from: globalActivePath, to: globalDisabledPath });
    for (const projectPath of projectPaths) {
      candidates.push({
        from: path.join(getProjectAgentsDir(projectPath), `${safeName}.md`),
        to: path.join(getProjectDisabledAgentsDir(projectPath), `${safeName}.md`),
      });
    }
  } else {
    candidates.push({ from: globalDisabledPath, to: globalActivePath });
    for (const projectPath of projectPaths) {
      candidates.push({
        from: path.join(getProjectDisabledAgentsDir(projectPath), `${safeName}.md`),
        to: path.join(getProjectAgentsDir(projectPath), `${safeName}.md`),
      });
    }
  }

  let movedAny = false;
  for (const { from, to } of candidates) {
    if (moveAgentFile(from, to, disabled)) {
      movedAny = true;
    }
  }

  if (movedAny) return true;
  return candidates.some(({ to }) => fs.existsSync(to));
}

export function listAllAgents(): Agent[] {
  const globalAgents = listAgents().map((a) => ({
    ...a,
    scope: "global" as const,
  }));
  return globalAgents;
}

export function listAllAgentsWithProjects(projectPaths: string[]): Agent[] {
  const globalAgents = listAgents().map((a) => ({
    ...a,
    scope: "global" as const,
  }));
  const projectAgents = projectPaths.flatMap((pp) => listProjectAgents(pp));
  return [...globalAgents, ...projectAgents];
}
