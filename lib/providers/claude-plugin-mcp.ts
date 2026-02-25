import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { readSettings } from "@/lib/claude-settings";

export interface ClaudePluginMcpOwner {
  plugin: string;
  pluginId: string;
  pluginEnabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function findClaudePluginMcpOwner(name: string): ClaudePluginMcpOwner | null {
  const key = name.trim();
  if (!key) return null;

  let enabledPlugins: Record<string, boolean> = {};
  try {
    enabledPlugins = readSettings().enabledPlugins || {};
  } catch {
    enabledPlugins = {};
  }

  try {
    const pluginsPath = join(
      homedir(),
      ".claude",
      "plugins",
      "installed_plugins.json",
    );
    const pluginsRaw = JSON.parse(readFileSync(pluginsPath, "utf-8")) as {
      plugins?: Record<string, unknown>;
    };
    const pluginsMap = isRecord(pluginsRaw.plugins) ? pluginsRaw.plugins : {};

    for (const [pluginId, installsRaw] of Object.entries(pluginsMap)) {
      if (!Array.isArray(installsRaw) || installsRaw.length === 0) continue;
      const latest = installsRaw[installsRaw.length - 1];
      if (!isRecord(latest) || typeof latest.installPath !== "string") continue;

      try {
        const mcpPath = join(latest.installPath, ".mcp.json");
        const mcpRaw = JSON.parse(readFileSync(mcpPath, "utf-8"));
        if (!isRecord(mcpRaw)) continue;
        if (!hasOwn(mcpRaw, key)) continue;

        return {
          plugin: pluginId.split("@")[0],
          pluginId,
          pluginEnabled: enabledPlugins[pluginId] === true,
        };
      } catch {
        // Plugin may not expose MCP servers.
      }
    }
  } catch {
    return null;
  }

  return null;
}
