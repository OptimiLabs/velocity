import fs from "fs";
import os from "os";
import path from "path";
import matter from "gray-matter";
import { AGENTS_DIR } from "@/lib/claude-paths";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";
import {
  CODEX_CONFIG,
  CODEX_AGENTS_DIR,
  CODEX_VELOCITY_AGENTS_DIR,
  CODEX_VELOCITY_DISABLED_AGENTS_DIR,
  projectCodexConfig,
  projectCodexRoleAgentsDir,
  projectCodexVelocityAgentsDir,
  projectCodexVelocityDisabledAgentsDir,
} from "@/lib/codex/paths";
import type { CodexAgentRoleConfig, CodexConfig } from "@/lib/codex/config";
import { writeToml } from "@/lib/codex/toml";
import {
  readCodexSettingsFrom,
  writeCodexSettingsTo,
} from "@/lib/codex/settings";
import {
  getGeminiAgentDirs,
  getGeminiDisabledAgentDirs,
} from "@/lib/gemini/paths";
import { validateAgentName } from "@/lib/agents/parser";
import { getDb } from "@/lib/db";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

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

function getAgentDir(provider: ConfigProvider, projectPath?: string): string {
  if (provider === "claude") {
    return projectPath
      ? path.join(projectPath, ".claude", "agents")
      : AGENTS_DIR;
  }
  if (provider === "codex") {
    return projectPath
      ? projectCodexVelocityAgentsDir(projectPath)
      : CODEX_VELOCITY_AGENTS_DIR;
  }
  return getGeminiAgentDirs(projectPath)[0];
}

function getDisabledAgentDir(
  provider: ConfigProvider,
  projectPath?: string,
): string {
  if (provider === "claude") {
    return projectPath
      ? path.join(projectPath, ".claude.local", "disabled", "agents")
      : path.join(path.dirname(AGENTS_DIR), ".disabled", "agents");
  }
  if (provider === "codex") {
    return projectPath
      ? projectCodexVelocityDisabledAgentsDir(projectPath)
      : CODEX_VELOCITY_DISABLED_AGENTS_DIR;
  }
  return getGeminiDisabledAgentDirs(projectPath)[0];
}

function getAgentDirs(provider: ConfigProvider, projectPath?: string): string[] {
  if (provider === "gemini") {
    return getGeminiAgentDirs(projectPath);
  }
  return [getAgentDir(provider, projectPath)];
}

function getDisabledAgentDirs(
  provider: ConfigProvider,
  projectPath?: string,
): string[] {
  if (provider === "gemini") {
    return getGeminiDisabledAgentDirs(projectPath);
  }
  return [getDisabledAgentDir(provider, projectPath)];
}

function parseAgentFile(
  filePath: string,
  provider: ConfigProvider,
  projectPath?: string,
  options?: { disabled?: boolean },
): Agent | null {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const { data, content: prompt } = matter(content);
    const disabled = options?.disabled === true;
    return {
      name: typeof data.name === "string" ? data.name : path.basename(filePath, ".md"),
      provider,
      description:
        typeof data.description === "string"
          ? data.description.split("\n")[0].slice(0, 200)
          : "",
      model: typeof data.model === "string" ? data.model : undefined,
      effort:
        data.effort === "low" || data.effort === "medium" || data.effort === "high"
          ? data.effort
          : undefined,
      tools: parseStringList(data.tools),
      disallowedTools: parseStringList(data.disallowedTools || data.deniedTools),
      color: typeof data.color === "string" ? data.color : undefined,
      icon: typeof data.icon === "string" ? data.icon : undefined,
      category: typeof data.category === "string" ? data.category : undefined,
      prompt: prompt.trim(),
      filePath,
      enabled: !disabled,
      scope: projectPath ? "project" : "global",
      projectPath,
      areaPath: parseOptionalAreaPath(data.areaPath),
    };
  } catch {
    return null;
  }
}

function renderAgentMarkdown(agent: Agent): string {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description,
  };
  if (agent.model) frontmatter.model = agent.model;
  if (agent.effort) frontmatter.effort = agent.effort;
  if (agent.tools?.length) frontmatter.tools = agent.tools.join(", ");
  if (agent.disallowedTools?.length) {
    frontmatter.disallowedTools = agent.disallowedTools.join(", ");
  }
  if (agent.color) frontmatter.color = agent.color;
  if (agent.icon) frontmatter.icon = agent.icon;
  if (agent.category) frontmatter.category = agent.category;
  if (agent.scope === "project" && agent.areaPath) {
    frontmatter.areaPath = agent.areaPath;
  }
  return matter.stringify(agent.prompt || "", frontmatter);
}

function listAgentsFromDir(
  dir: string,
  provider: ConfigProvider,
  projectPath: string | undefined,
  options?: { disabled?: boolean },
): Agent[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => {
      const parsed = parseAgentFile(
        path.join(dir, f),
        provider,
        projectPath,
        options,
      );
      return parsed ? [parsed] : [];
    });
}

function dedupeByName(agents: Agent[]): Agent[] {
  const byName = new Map<string, Agent>();
  for (const agent of agents) {
    if (!byName.has(agent.name)) byName.set(agent.name, agent);
  }
  return Array.from(byName.values());
}

function moveAgentFile(from: string, to: string): boolean {
  if (!fs.existsSync(from)) return false;
  if (from === to) return true;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) {
    fs.unlinkSync(from);
    return true;
  }
  fs.renameSync(from, to);
  return true;
}

function listKnownProjectPaths(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT path FROM projects").all() as {
    path: string;
  }[];
  return rows.map((row) => row.path).filter(Boolean);
}

function getCodexConfigPath(projectPath?: string): string {
  return projectPath ? projectCodexConfig(projectPath) : CODEX_CONFIG;
}

function getCodexRoleDir(projectPath?: string): string {
  return projectPath ? projectCodexRoleAgentsDir(projectPath) : CODEX_AGENTS_DIR;
}

function toCodexConfigFilePath(rolePath: string): string {
  const home = os.homedir();
  const normalizedHome = path.resolve(home);
  const normalizedRole = path.resolve(rolePath);
  const prefix = `${normalizedHome}${path.sep}`;
  if (normalizedRole.startsWith(prefix)) {
    return `~/${normalizedRole.slice(prefix.length).split(path.sep).join("/")}`;
  }
  return normalizedRole;
}

function resolveConfigFilePath(configPath: string, configFile: string): string {
  if (configFile.startsWith("~/")) {
    return path.join(os.homedir(), configFile.slice(2));
  }
  if (path.isAbsolute(configFile)) return path.resolve(configFile);
  return path.resolve(path.dirname(configPath), configFile);
}

function isManagedCodexAgentEntry(
  entry: unknown,
  configPath: string,
  managedAgentDir: string,
): boolean {
  if (!isPlainObject(entry)) return false;
  const rawConfigFile = entry.config_file;
  if (typeof rawConfigFile !== "string" || !rawConfigFile.trim()) return false;
  const resolvedConfigFile = resolveConfigFilePath(configPath, rawConfigFile.trim());
  const normalizedManagedDir = path.resolve(managedAgentDir);
  return path.resolve(path.dirname(resolvedConfigFile)) === normalizedManagedDir;
}

function renderCodexRole(agent: Agent): Record<string, unknown> {
  const role: Record<string, unknown> = {
    prompt: agent.prompt || "",
  };
  if (agent.description) role.description = agent.description;
  if (agent.model) role.model = agent.model;
  if (agent.effort) role.model_reasoning_effort = agent.effort;
  return role;
}

function syncCodexAgentRegistry(projectPath?: string): void {
  const markdownAgentDir = getAgentDir("codex", projectPath);
  const codexRoleDir = getCodexRoleDir(projectPath);
  const activeAgents = listAgentsFromDir(markdownAgentDir, "codex", projectPath, {
    disabled: false,
  });
  const byName = new Map(activeAgents.map((agent) => [agent.name, agent]));

  const configPath = getCodexConfigPath(projectPath);
  const config = readCodexSettingsFrom(configPath) as CodexConfig;
  const currentAgentsTable = isPlainObject(config.agents)
    ? (config.agents as Record<string, CodexAgentRoleConfig>)
    : {};
  const nextAgentsTable: Record<string, CodexAgentRoleConfig> = {
    ...currentAgentsTable,
  };

  for (const [name, entry] of Object.entries(currentAgentsTable)) {
    if (!isManagedCodexAgentEntry(entry, configPath, codexRoleDir)) continue;
    if (!byName.has(name)) {
      delete nextAgentsTable[name];
      const staleRolePath = path.join(codexRoleDir, `${name}.toml`);
      if (fs.existsSync(staleRolePath)) {
        fs.unlinkSync(staleRolePath);
      }
      const staleLegacyRolePath = path.join(markdownAgentDir, `${name}.toml`);
      if (staleLegacyRolePath !== staleRolePath && fs.existsSync(staleLegacyRolePath)) {
        fs.unlinkSync(staleLegacyRolePath);
      }
    }
  }

  for (const agent of byName.values()) {
    const rolePath = path.join(codexRoleDir, `${agent.name}.toml`);
    fs.mkdirSync(path.dirname(rolePath), { recursive: true });
    writeToml(rolePath, renderCodexRole(agent));
    const legacyRolePath = path.join(markdownAgentDir, `${agent.name}.toml`);
    if (legacyRolePath !== rolePath && fs.existsSync(legacyRolePath)) {
      fs.unlinkSync(legacyRolePath);
    }
    nextAgentsTable[agent.name] = {
      config_file: toCodexConfigFilePath(rolePath),
    };
  }

  if (Object.keys(nextAgentsTable).length > 0) {
    config.agents = nextAgentsTable;
  } else {
    delete config.agents;
  }
  writeCodexSettingsTo(configPath, config);
}

const CODEX_LIST_SYNC_TTL_MS = 10 * 60_000;
const codexListSyncAttemptAt = new Map<string, number>();

function codexScopeKey(projectPath?: string): string {
  return projectPath ? `project:${path.resolve(projectPath)}` : "global";
}

function maybeSyncCodexAgentRegistry(projectPath?: string): void {
  const scopeKey = codexScopeKey(projectPath);
  const lastAttempt = codexListSyncAttemptAt.get(scopeKey) ?? 0;
  const now = Date.now();
  if (now - lastAttempt < CODEX_LIST_SYNC_TTL_MS) return;
  codexListSyncAttemptAt.set(scopeKey, now);
  syncCodexAgentRegistry(projectPath);
}

function clearCodexSyncAttempts(): void {
  codexListSyncAttemptAt.clear();
}

export function syncProviderAgentRegistry(
  provider: ConfigProvider,
  projectPath?: string,
): void {
  if (provider !== "codex") return;
  syncCodexAgentRegistry(projectPath);
  clearCodexSyncAttempts();
}

export function listProviderAgents(
  provider: ConfigProvider,
  projectPath?: string,
): Agent[] {
  if (provider === "codex") {
    // Backfill legacy markdown installs into Codex's [agents.*] registry on read,
    // but throttle sync attempts because this path can be called frequently.
    try {
      maybeSyncCodexAgentRegistry(projectPath);
    } catch {
      // Non-fatal; still return markdown-backed agents.
    }
  }
  const activeAgents = getAgentDirs(provider, projectPath).flatMap((dir) =>
    listAgentsFromDir(dir, provider, projectPath, {
      disabled: false,
    }),
  );
  const disabledAgents = getDisabledAgentDirs(provider, projectPath).flatMap(
    (dir) =>
      listAgentsFromDir(dir, provider, projectPath, {
        disabled: true,
      }),
  );
  return dedupeByName([...activeAgents, ...disabledAgents]);
}

export function getProviderAgent(
  provider: ConfigProvider,
  name: string,
  projectPath?: string,
): Agent | null {
  for (const dir of getAgentDirs(provider, projectPath)) {
    const parsed = parseAgentFile(path.join(dir, `${name}.md`), provider, projectPath, {
      disabled: false,
    });
    if (parsed) return parsed;
  }
  for (const dir of getDisabledAgentDirs(provider, projectPath)) {
    const disabledParsed = parseAgentFile(
      path.join(dir, `${name}.md`),
      provider,
      projectPath,
      { disabled: true },
    );
    if (disabledParsed) return disabledParsed;
  }
  // Fallback to full list to handle frontmatter name mismatch
  return listProviderAgents(provider, projectPath).find((a) => a.name === name) || null;
}

export function saveProviderAgent(
  provider: ConfigProvider,
  agent: Agent,
  projectPath?: string,
): string {
  const nameError = validateAgentName(agent.name);
  if (nameError) {
    throw new Error(nameError);
  }
  const activeDirs = getAgentDirs(provider, projectPath);
  const disabledDirs = getDisabledAgentDirs(provider, projectPath);
  const shouldDisable = agent.enabled === false;
  const targetDir = shouldDisable ? disabledDirs[0] : activeDirs[0];
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, `${agent.name}.md`);
  const content = renderAgentMarkdown(agent);
  fs.writeFileSync(filePath, content, "utf-8");
  const candidateDirs = [...activeDirs, ...disabledDirs];
  for (const dir of candidateDirs) {
    const candidatePath = path.join(dir, `${agent.name}.md`);
    if (candidatePath === filePath) continue;
    if (fs.existsSync(candidatePath)) {
      fs.unlinkSync(candidatePath);
    }
  }
  if (provider === "codex") {
    syncCodexAgentRegistry(projectPath);
    clearCodexSyncAttempts();
  }
  return filePath;
}

export function deleteProviderAgent(
  provider: ConfigProvider,
  name: string,
  projectPath?: string,
): boolean {
  let deleted = false;
  const candidates = [
    ...getAgentDirs(provider, projectPath),
    ...getDisabledAgentDirs(provider, projectPath),
  ];
  for (const dir of candidates) {
    const filePath = path.join(dir, `${name}.md`);
    if (!fs.existsSync(filePath)) continue;
    fs.unlinkSync(filePath);
    deleted = true;
  }
  if (provider === "codex") {
    syncCodexAgentRegistry(projectPath);
    clearCodexSyncAttempts();
  }
  return deleted;
}

export function setProviderAgentDisabled(
  provider: ConfigProvider,
  name: string,
  disabled: boolean,
  projectPath?: string,
): boolean {
  const safeName = path.basename(name);
  const candidates: { from: string; to: string }[] = [];
  const syncScopeKeys = new Set<string>();
  const addSyncScope = (candidateProjectPath?: string) => {
    if (candidateProjectPath) {
      syncScopeKeys.add(`project:${candidateProjectPath}`);
    } else {
      syncScopeKeys.add("global");
    }
  };

  const appendMoveCandidate = (targetProjectPath?: string) => {
    const activeDirs = getAgentDirs(provider, targetProjectPath);
    const disabledDirs = getDisabledAgentDirs(provider, targetProjectPath);
    const preferredActivePath = path.join(activeDirs[0], `${safeName}.md`);
    const preferredDisabledPath = path.join(disabledDirs[0], `${safeName}.md`);
    if (disabled) {
      for (const dir of activeDirs) {
        candidates.push({
          from: path.join(dir, `${safeName}.md`),
          to: preferredDisabledPath,
        });
      }
    } else {
      for (const dir of disabledDirs) {
        candidates.push({
          from: path.join(dir, `${safeName}.md`),
          to: preferredActivePath,
        });
      }
    }
    addSyncScope(targetProjectPath);
  };

  if (projectPath) {
    appendMoveCandidate(projectPath);
  } else {
    appendMoveCandidate();
    for (const knownProjectPath of listKnownProjectPaths()) {
      appendMoveCandidate(knownProjectPath);
    }
  }

  let movedAny = false;
  for (const { from, to } of candidates) {
    if (moveAgentFile(from, to)) {
      movedAny = true;
    }
  }
  if (provider === "codex") {
    for (const scopeKey of syncScopeKeys) {
      if (scopeKey === "global") {
        syncCodexAgentRegistry();
      } else {
        syncCodexAgentRegistry(scopeKey.slice("project:".length));
      }
    }
    clearCodexSyncAttempts();
  }
  if (movedAny) return true;
  return candidates.some(({ to }) => fs.existsSync(to));
}
