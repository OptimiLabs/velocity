import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  rmSync,
  readdirSync,
} from "fs";
import { dirname, join } from "path";
import { createRequire } from "module";
import { SETTINGS_FILE } from "./claude-paths";

const requireFromHere = createRequire(import.meta.url);

export interface MCPServerConfig {
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ClaudeSettings {
  mcpServers?: Record<string, MCPServerConfig>;
  disabledMcpServers?: Record<string, MCPServerConfig>;
  enabledPlugins?: Record<string, boolean>;
  autoIndexInterval?: number; // ms — 30000, 60000, 300000, 600000, 3600000
  memoryMaxAgeDays?: number; // cleanup: delete memory files older than this (default 3)
  memoryMaxFiles?: number; // cleanup: keep at most this many memory files (default 5)
  statuslinePlan?: "pro" | "max5x" | "max20x" | "api";
  statuslineExtraCredits?: number; // extra $ added to block budget
  statuslineAlertAt?: number; // alert threshold (% for plans, $ for API)
  statuslineDailyAlert?: number; // $ threshold for daily spending alert (API plan)
  statuslineWeeklyAlert?: number; // $ threshold for weekly spending alert (API plan)
  statuslineMonthlyAlert?: number; // $ threshold for monthly spending alert (API plan)
  statuslineResetMinutes?: number; // custom block duration in minutes (default 300 = 5h)
  statuslineBlockStartOverride?: string | null; // ISO timestamp — pin block start
  autoArchiveDays?: number; // auto-archive idle console sessions after N days (0 = disabled)
  disableHeaderView?: boolean; // hide page title/description headers in dashboard pages
  model?: string;
  effortLevel?: "low" | "medium" | "high";
  hooks?: Record<string, unknown[]>;
  permissions?: Record<string, unknown>;
  env?: Record<string, string>;
  envProfiles?: Record<
    string,
    { description?: string; vars: Record<string, string> }
  >;
  terminalAppearance?: Partial<{
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    cursorStyle: "block" | "underline" | "bar";
    cursorBlink: boolean;
    scrollback: number;
    theme: string;
    sessionLogging: boolean;
    bellStyle: "visual" | "badge" | "none";
    minimumContrastRatio: number;
    editorCommand: string;
  }>;
  [key: string]: unknown;
}

/** Remove hooks missing required fields (e.g. agent hook without prompt) */
function sanitizeHooks(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks || typeof settings.hooks !== "object") return settings;
  const hooks = settings.hooks as Record<string, unknown[]>;
  for (const [event, rules] of Object.entries(hooks)) {
    if (!Array.isArray(rules)) continue;
    hooks[event] = rules.filter((item) => {
      const rule = item as Record<string, unknown>;
      if (!rule.hooks || !Array.isArray(rule.hooks)) return false;
      rule.hooks = (rule.hooks as Record<string, unknown>[]).filter((h) => {
        if (h.type === "command") return !!h.command;
        if (h.type === "prompt" || h.type === "agent") return !!h.prompt;
        return true;
      });
      return (rule.hooks as unknown[]).length > 0;
    });
    if (hooks[event].length === 0) delete hooks[event];
  }
  return settings;
}

export function readSettings(): ClaudeSettings {
  try {
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    return sanitizeHooks(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function writeSettings(settings: ClaudeSettings): void {
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(
    SETTINGS_FILE,
    JSON.stringify(settings, null, 2) + "\n",
    "utf-8",
  );
}

export function readProjectSettings(cwd: string): ClaudeSettings {
  const paths = [
    join(cwd, ".claude", "settings.json"),
    join(cwd, ".claude", "settings.local.json"),
  ];
  let merged: ClaudeSettings = {};
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const raw = readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        merged = { ...merged, ...parsed };
      }
    } catch {
      /* skip unreadable files */
    }
  }
  return merged;
}

export function writeProjectSettings(
  cwd: string,
  settings: ClaudeSettings,
): void {
  const dir = join(cwd, ".claude");
  const filePath = join(dir, "settings.local.json");
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
}

export function toggleMCPServer(name: string, enabled: boolean): void {
  const settings = readSettings();
  if (enabled) {
    const config = settings.disabledMcpServers?.[name];
    if (!config) return;
    if (!settings.mcpServers) settings.mcpServers = {};
    settings.mcpServers[name] = config;
    delete settings.disabledMcpServers![name];
  } else {
    const config = settings.mcpServers?.[name];
    if (!config) return;
    if (!settings.disabledMcpServers) settings.disabledMcpServers = {};
    settings.disabledMcpServers[name] = config;
    delete settings.mcpServers![name];
  }
  writeSettings(settings);
}

export function addMCPServer(name: string, config: MCPServerConfig): void {
  const settings = readSettings();
  if (!settings.mcpServers) settings.mcpServers = {};
  settings.mcpServers[name] = config;
  writeSettings(settings);
}

export function removeMCPServer(name: string): boolean {
  const settings = readSettings();
  let found = false;
  if (settings.mcpServers && name in settings.mcpServers) {
    delete settings.mcpServers[name];
    found = true;
  }
  if (settings.disabledMcpServers && name in settings.disabledMcpServers) {
    delete settings.disabledMcpServers[name];
    found = true;
  }
  if (!found) return false;
  writeSettings(settings);
  return true;
}

export function updateMCPServer(
  name: string,
  config: Partial<MCPServerConfig>,
): boolean {
  const settings = readSettings();
  if (!settings.mcpServers?.[name]) return false;
  // Merge config, removing keys set to undefined/null
  const merged = { ...settings.mcpServers[name] };
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined || value === null) {
      delete (merged as Record<string, unknown>)[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  settings.mcpServers[name] = merged;
  writeSettings(settings);
  return true;
}

const PLUGIN_DISABLED_CONTEXT_DIR = ".velocity-disabled-context";
const PLUGIN_CONTEXT_DIRS = ["skills", "agents", "commands"] as const;

function isDirEmpty(dirPath: string): boolean {
  try {
    return readdirSync(dirPath).length === 0;
  } catch {
    return false;
  }
}

function setPluginContextDisabled(
  installPath: string,
  disabled: boolean,
): boolean {
  const disabledRoot = join(installPath, PLUGIN_DISABLED_CONTEXT_DIR);
  let moved = false;

  for (const dirName of PLUGIN_CONTEXT_DIRS) {
    const activePath = join(installPath, dirName);
    const disabledPath = join(disabledRoot, dirName);
    const from = disabled ? activePath : disabledPath;
    const to = disabled ? disabledPath : activePath;

    if (!existsSync(from)) continue;
    if (existsSync(to)) continue;

    mkdirSync(dirname(to), { recursive: true });
    renameSync(from, to);
    moved = true;
  }

  if (!disabled && existsSync(disabledRoot) && isDirEmpty(disabledRoot)) {
    rmSync(disabledRoot, { recursive: true, force: true });
  }

  return moved;
}

function resolvePluginInstallPath(pluginId: string): string | null {
  try {
    const pluginsPath = join(dirname(SETTINGS_FILE), "plugins", "installed_plugins.json");
    const raw = readFileSync(pluginsPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      plugins?: Record<string, Array<{ installPath?: string }>>;
    };
    const installs = parsed.plugins?.[pluginId];
    if (!installs || installs.length === 0) return null;
    const latest = installs[installs.length - 1];
    if (!latest?.installPath) return null;
    return latest.installPath;
  } catch {
    return null;
  }
}

export function togglePlugin(
  pluginId: string,
  enabled: boolean,
  installPath?: string,
): void {
  const settings = readSettings();
  const disabled = !enabled;
  if (installPath) {
    try {
      setPluginContextDisabled(installPath, disabled);
    } catch {
      // Keep settings toggle resilient.
    }
  } else {
    const resolvedPath = resolvePluginInstallPath(pluginId);
    if (resolvedPath) {
      try {
        setPluginContextDisabled(resolvedPath, disabled);
      } catch {
        // Keep settings toggle resilient.
      }
    }
  }
  if (!settings.enabledPlugins) settings.enabledPlugins = {};
  settings.enabledPlugins[pluginId] = enabled;
  writeSettings(settings);
}

// --- Per-project plugin overrides ---

interface ProjectPluginOverride {
  projectId: string;
  pluginId: string;
  enabled: boolean;
  createdAt: string;
}

export function getProjectPluginOverrides(
  projectId: string,
): ProjectPluginOverride[] {
  const { getDb } = requireFromHere("./db") as typeof import("./db");
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT project_id, plugin_id, enabled, created_at FROM project_plugin_overrides WHERE project_id = ?",
    )
    .all(projectId) as {
    project_id: string;
    plugin_id: string;
    enabled: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    projectId: r.project_id,
    pluginId: r.plugin_id,
    enabled: r.enabled !== 0,
    createdAt: r.created_at,
  }));
}

export function toggleProjectPlugin(
  projectId: string,
  pluginId: string,
  enabled: boolean,
): void {
  const { getDb } = requireFromHere("./db") as typeof import("./db");
  const db = getDb();
  db.prepare(
    `INSERT INTO project_plugin_overrides (project_id, plugin_id, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT (project_id, plugin_id) DO UPDATE SET enabled = excluded.enabled`,
  ).run(projectId, pluginId, enabled ? 1 : 0);
}

export function deleteProjectPluginOverride(
  projectId: string,
  pluginId: string,
): void {
  const { getDb } = requireFromHere("./db") as typeof import("./db");
  const db = getDb();
  db.prepare(
    "DELETE FROM project_plugin_overrides WHERE project_id = ? AND plugin_id = ?",
  ).run(projectId, pluginId);
}
