import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, unlinkSync, readFileSync, rmSync, statSync } from "fs";
import { join } from "path";
import { deleteSkill } from "@/lib/skills";
import { CLAUDE_DIR, SKILLS_DIR } from "@/lib/claude-paths";
import { trackPluginUninstall } from "@/app/api/marketplace/install/route";
import { getCodexInstructionDirs } from "@/lib/codex/skills";
import { GEMINI_SKILLS_DIR } from "@/lib/gemini/paths";
import { deleteProviderAgent } from "@/lib/providers/agent-files";
import {
  readSettings,
  writeSettings,
} from "@/lib/claude-settings";
import {
  readProviderMcpState,
  writeProviderMcpState,
} from "@/lib/providers/mcp-settings";
import { invalidateMarketplaceCache } from "@/app/api/marketplace/search/route";
import { fullScan } from "@/lib/instructions/indexer";
import { getMarketplaceInstallNameCandidates } from "@/lib/marketplace/install-names";
import type { ConfigProvider } from "@/types/provider";

function normalizeTargetProvider(value: unknown): ConfigProvider {
  return value === "codex" || value === "gemini" ? value : "claude";
}

function removeAgentForProvider(provider: ConfigProvider, name: string): boolean {
  const normalized = name.endsWith(".md") ? name.slice(0, -3) : name;
  return deleteProviderAgent(provider, normalized);
}

function removeSkillEntryForProvider(
  provider: ConfigProvider,
  skillName: string,
): boolean {
  const baseName = skillName.replace(/\.md$/, "");
  let removed = false;
  if (provider === "codex") {
    for (const dir of getCodexInstructionDirs()) {
      const filePath = join(dir, `${baseName}.md`);
      const disabledPath = `${filePath}.disabled`;
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        removed = true;
      }
      if (existsSync(disabledPath)) {
        unlinkSync(disabledPath);
        removed = true;
      }
    }
    return removed;
  }
  if (provider === "gemini") {
    const filePath = join(GEMINI_SKILLS_DIR, `${baseName}.md`);
    const disabledPath = `${filePath}.disabled`;
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      removed = true;
    }
    if (existsSync(disabledPath)) {
      unlinkSync(disabledPath);
      removed = true;
    }
    return removed;
  }

  const dirPath = join(SKILLS_DIR, baseName);
  if (existsSync(dirPath) && statSync(dirPath).isDirectory()) {
    rmSync(dirPath, { recursive: true });
    return true;
  }
  const filePath = join(SKILLS_DIR, skillName);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    removed = true;
  }
  return removed;
}

function removeSkillForProvider(provider: ConfigProvider, name: string): boolean {
  if (provider === "claude") {
    return deleteSkill(name);
  }
  const candidates = getMarketplaceInstallNameCandidates(name);
  let removed = false;
  for (const candidate of candidates) {
    removed = removeSkillEntryForProvider(provider, candidate) || removed;
  }
  return removed;
}

function removeMcpForProvider(provider: ConfigProvider, name: string): boolean {
  const state = readProviderMcpState(provider);
  let removed = false;
  if (state.enabled[name]) {
    delete state.enabled[name];
    removed = true;
  }
  if (provider === "claude" && state.disabled[name]) {
    delete state.disabled[name];
    removed = true;
  }
  if (removed) {
    writeProviderMcpState(provider, state);
  }
  return removed;
}

export async function POST(request: Request) {
  try {
    const { type, name, targetProvider } = await request.json();
    if (!type || !name) {
      return NextResponse.json(
        { error: "type and name required" },
        { status: 400 },
      );
    }
    const provider = normalizeTargetProvider(targetProvider);

    switch (type) {
      case "skill": {
        const ok = removeSkillForProvider(provider, name);
        if (!ok)
          return NextResponse.json(
            { error: "Skill not found" },
            { status: 404 },
          );
        try { fullScan(); } catch { /* non-critical */ }
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "mcp-server": {
        const candidates = getMarketplaceInstallNameCandidates(name);
        const ok = candidates.some((candidate) =>
          removeMcpForProvider(provider, candidate),
        );
        if (!ok)
          return NextResponse.json(
            { error: "MCP server not found" },
            { status: 404 },
          );
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "plugin": {
        if (provider !== "claude") {
          const removedSkill = removeSkillForProvider(provider, name);
          const removedAgent = removeAgentForProvider(provider, name);
          if (!removedSkill && !removedAgent) {
            return NextResponse.json(
              { error: "Plugin artifacts not found" },
              { status: 404 },
            );
          }
          try { fullScan(); } catch { /* non-critical */ }
          invalidateMarketplaceCache();
          return NextResponse.json({ success: true });
        }
        try {
          execSync(`claude plugin remove ${name}`, {
            timeout: 15000,
            encoding: "utf-8",
          });
          return NextResponse.json({ success: true });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Plugin removal failed";
          return NextResponse.json({ error: message }, { status: 500 });
        }
      }
      case "agent": {
        removeAgentForProvider(provider, name);
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "marketplace-plugin": {
        // Read installed_plugins.json to find what was installed
        const pluginsPath = join(CLAUDE_DIR, "plugins", "installed_plugins.json");
        let pluginData: Record<string, unknown> | null = null;
        const nameCandidates = getMarketplaceInstallNameCandidates(name);
        try {
          const data = JSON.parse(readFileSync(pluginsPath, "utf-8"));
          const plugins = (data.plugins || {}) as Record<string, Record<string, unknown>>;
          const key = Object.keys(plugins).find(
            (k) =>
              nameCandidates.some(
                (candidate) =>
                  k.startsWith(`${provider}:${candidate}@`) ||
                  k.startsWith(candidate + "@"),
              ),
          );
          if (key) pluginData = plugins[key];
        } catch { /* file may not exist */ }

        if (pluginData) {
          // Remove agent files
          for (const agentName of (pluginData.agents as string[]) || []) {
            const normalized = agentName.endsWith(".md")
              ? agentName.slice(0, -3)
              : agentName;
            deleteProviderAgent(provider, normalized);
          }
          // Remove skill/command files (may be directories or flat files)
          for (const skillName of [
            ...((pluginData.skills as string[]) || []),
            ...((pluginData.commands as string[]) || []),
          ]) {
            for (const candidate of getMarketplaceInstallNameCandidates(skillName)) {
              removeSkillEntryForProvider(provider, candidate);
            }
          }
          // Remove provider-specific MCP server entries installed with the plugin.
          for (const mcpName of (pluginData.mcpServers as string[]) || []) {
            for (const candidate of getMarketplaceInstallNameCandidates(mcpName)) {
              removeMcpForProvider(provider, candidate);
            }
          }
          // Remove from registry
          trackPluginUninstall(name, provider);
        }
        // Re-index and invalidate cache so marketplace reflects the change
        try { fullScan(); } catch { /* non-critical */ }
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "hook": {
        const settings = readSettings();
        if (!settings.hooks)
          return NextResponse.json(
            { error: "No hooks configured" },
            { status: 404 },
          );
        // Remove hook rules whose inner hooks reference this name
        const hooks = settings.hooks as Record<string, unknown[]>;
        for (const event of Object.keys(hooks)) {
          hooks[event] = hooks[event].filter((rule: unknown) => {
            const ruleObj = rule as Record<string, unknown>;
            const innerHooks = (ruleObj.hooks as Record<string, unknown>[]) || [];
            // Keep rule if none of its hooks match the uninstall target
            return !innerHooks.some((h) => {
              const cmd = (h.command as string) || "";
              return cmd === name || cmd.includes(name);
            });
          });
          if (hooks[event].length === 0) delete hooks[event];
        }
        settings.hooks = hooks;
        writeSettings(settings);
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "statusline": {
        const settings = readSettings();
        delete settings.statusLine;
        writeSettings(settings);
        const scriptPath = join(CLAUDE_DIR, "statusline-usage.sh");
        if (existsSync(scriptPath)) unlinkSync(scriptPath);
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}` },
          { status: 400 },
        );
    }
  } catch {
    return NextResponse.json({ error: "Uninstall failed" }, { status: 500 });
  }
}
