import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { CLAUDE_DIR } from "@/lib/claude-paths";
import {
  readSettings,
  writeSettings,
} from "@/lib/claude-settings";
import { invalidateMarketplaceCache } from "@/app/api/marketplace/search/route";
import { fullScan } from "@/lib/instructions/indexer";
import { getMarketplaceInstallNameCandidates } from "@/lib/marketplace/install-names";
import {
  findMarketplacePluginEntry,
  removeMarketplacePluginComponentReferences,
  removeMarketplacePluginEntry,
  type MarketplaceInstalledPluginRecord,
} from "@/lib/marketplace/installed-plugins";
import {
  normalizeTargetProvider,
  removeAgentForProvider,
  removeMcpForProvider,
  removeSkillEntryForProvider,
} from "@/lib/marketplace/plugin-artifacts";
import {
  discoverRepo,
  parseGitHubUrl,
  type DiscoveredComponent,
} from "@/lib/marketplace/repo-tree";
import type { ConfigProvider } from "@/types/provider";

function removeSkillForProvider(provider: ConfigProvider, name: string): boolean {
  const candidates = getMarketplaceInstallNameCandidates(name);
  let removed = false;
  for (const candidate of candidates) {
    removed = removeSkillEntryForProvider(provider, candidate) || removed;
  }
  return removed;
}

function removeAgentForProviderName(
  provider: ConfigProvider,
  name: string,
): boolean {
  const normalized = name.endsWith(".md") ? name.slice(0, -3) : name;
  let removed = false;
  for (const candidate of getMarketplaceInstallNameCandidates(normalized)) {
    removed = removeAgentForProvider(provider, candidate) || removed;
  }
  return removed;
}

function removeMcpForProviderName(provider: ConfigProvider, name: string): boolean {
  let removed = false;
  for (const candidate of getMarketplaceInstallNameCandidates(name)) {
    removed = removeMcpForProvider(provider, candidate) || removed;
  }
  return removed;
}

function pruneMarketplaceTrackingForName(
  provider: ConfigProvider,
  componentType: "agent" | "skill" | "command" | "mcp-server",
  name: string,
  marketplaceRepo?: string,
): void {
  removeMarketplacePluginComponentReferences({
    targetProvider: provider,
    componentType,
    name,
    marketplaceRepo,
  });
}

function normalizeSubpath(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/^\.\//, "").replace(/\/$/, "");
  if (!cleaned || cleaned === ".") return null;
  return cleaned;
}

function isWithinSourcePath(
  component: DiscoveredComponent,
  sourcePath: string | null,
): boolean {
  if (!sourcePath) return true;
  return (
    component.contextDir === sourcePath ||
    component.contextDir.startsWith(`${sourcePath}/`)
  );
}

function removeTrackedMarketplacePluginArtifacts(
  provider: ConfigProvider,
  record: MarketplaceInstalledPluginRecord,
): boolean {
  let removed = false;

  for (const agentName of record.agents) {
    removed = removeAgentForProviderName(provider, agentName) || removed;
  }

  for (const skillName of [...record.skills, ...record.commands]) {
    const normalized = skillName.endsWith(".md")
      ? skillName.slice(0, -3)
      : skillName;
    removed = removeSkillForProvider(provider, normalized) || removed;
  }

  for (const mcpName of record.mcpServers) {
    removed = removeMcpForProviderName(provider, mcpName) || removed;
  }

  return removed;
}

async function removeDiscoveredMarketplacePluginArtifacts(
  provider: ConfigProvider,
  options: {
    name: string;
    marketplaceRepo?: string;
    url?: string;
    sourcePath?: string;
    defaultBranch?: string;
  },
): Promise<boolean> {
  const repoTarget =
    (typeof options.url === "string" && options.url.trim()) ||
    (typeof options.marketplaceRepo === "string" &&
    options.marketplaceRepo.trim()
      ? `https://github.com/${options.marketplaceRepo.trim()}`
      : "");
  if (!repoTarget) return false;

  const parsed = parseGitHubUrl(repoTarget);
  if (!parsed) return false;

  const branch =
    typeof options.defaultBranch === "string" && options.defaultBranch.trim()
      ? options.defaultBranch.trim()
      : parsed.branch;
  const sourcePath = normalizeSubpath(
    typeof options.sourcePath === "string" && options.sourcePath.trim()
      ? options.sourcePath
      : parsed.subpath,
  );
  const discovery = await discoverRepo(parsed.owner, parsed.repo, branch);
  if (!discovery || discovery.components.length === 0) return false;

  const scopedComponents = discovery.components.filter((component) =>
    isWithinSourcePath(component, sourcePath),
  );
  if (scopedComponents.length === 0) return false;

  let removed = false;
  let sawMcpServer = false;

  for (const component of scopedComponents) {
    switch (component.kind) {
      case "agent":
        removed =
          removeAgentForProviderName(provider, component.name) || removed;
        break;
      case "skill":
      case "command":
        removed = removeSkillForProvider(provider, component.name) || removed;
        break;
      case "mcp-server":
        sawMcpServer = true;
        removed = removeMcpForProviderName(provider, component.name) || removed;
        break;
      default:
        break;
    }
  }

  // Marketplace plugin MCP installs are typically keyed to the plugin name.
  if (sawMcpServer) {
    removed = removeMcpForProviderName(provider, options.name) || removed;
  }

  return removed;
}

export async function POST(request: Request) {
  try {
    const {
      type,
      name,
      targetProvider,
      marketplaceRepo,
      url,
      sourcePath,
      defaultBranch,
    } = await request.json();
    if (!type || !name) {
      return NextResponse.json(
        { error: "type and name required" },
        { status: 400 },
      );
    }
    const provider = normalizeTargetProvider(targetProvider);
    const resolvedMarketplaceRepo =
      typeof marketplaceRepo === "string" ? marketplaceRepo : undefined;

    switch (type) {
      case "skill": {
        const ok = removeSkillForProvider(provider, name);
        if (!ok)
          return NextResponse.json(
            { error: "Skill not found" },
            { status: 404 },
          );
        pruneMarketplaceTrackingForName(
          provider,
          "skill",
          name,
          resolvedMarketplaceRepo,
        );
        pruneMarketplaceTrackingForName(
          provider,
          "command",
          name,
          resolvedMarketplaceRepo,
        );
        try { fullScan(); } catch { /* non-critical */ }
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "mcp-server": {
        const ok = removeMcpForProviderName(provider, name);
        if (!ok)
          return NextResponse.json(
            { error: "MCP server not found" },
            { status: 404 },
          );
        pruneMarketplaceTrackingForName(
          provider,
          "mcp-server",
          name,
          resolvedMarketplaceRepo,
        );
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "plugin": {
        if (provider !== "claude") {
          let removedSkill = false;
          let removedAgent = false;
          let removedMcp = false;
          for (const candidate of getMarketplaceInstallNameCandidates(name)) {
            removedSkill = removeSkillForProvider(provider, candidate) || removedSkill;
            removedAgent =
              removeAgentForProviderName(provider, candidate) || removedAgent;
            removedMcp =
              removeMcpForProviderName(provider, candidate) || removedMcp;
          }
          if (!removedSkill && !removedAgent && !removedMcp) {
            return NextResponse.json(
              { error: "Plugin artifacts not found" },
              { status: 404 },
            );
          }
          pruneMarketplaceTrackingForName(
            provider,
            "agent",
            name,
            resolvedMarketplaceRepo,
          );
          pruneMarketplaceTrackingForName(
            provider,
            "skill",
            name,
            resolvedMarketplaceRepo,
          );
          pruneMarketplaceTrackingForName(
            provider,
            "command",
            name,
            resolvedMarketplaceRepo,
          );
          pruneMarketplaceTrackingForName(
            provider,
            "mcp-server",
            name,
            resolvedMarketplaceRepo,
          );
          try { fullScan(); } catch { /* non-critical */ }
          invalidateMarketplaceCache();
          return NextResponse.json({ success: true });
        }
        try {
          execSync(`claude plugin remove ${name}`, {
            timeout: 15000,
            encoding: "utf-8",
          });
          pruneMarketplaceTrackingForName(
            provider,
            "agent",
            name,
            resolvedMarketplaceRepo,
          );
          pruneMarketplaceTrackingForName(
            provider,
            "skill",
            name,
            resolvedMarketplaceRepo,
          );
          pruneMarketplaceTrackingForName(
            provider,
            "command",
            name,
            resolvedMarketplaceRepo,
          );
          pruneMarketplaceTrackingForName(
            provider,
            "mcp-server",
            name,
            resolvedMarketplaceRepo,
          );
          try { fullScan(); } catch { /* non-critical */ }
          invalidateMarketplaceCache();
          return NextResponse.json({ success: true });
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Plugin removal failed";
          return NextResponse.json({ error: message }, { status: 500 });
        }
      }
      case "agent": {
        const ok = removeAgentForProviderName(provider, name);
        if (!ok)
          return NextResponse.json(
            { error: "Agent not found" },
            { status: 404 },
          );
        pruneMarketplaceTrackingForName(
          provider,
          "agent",
          name,
          resolvedMarketplaceRepo,
        );
        invalidateMarketplaceCache();
        return NextResponse.json({ success: true });
      }
      case "marketplace-plugin": {
        const tracked = findMarketplacePluginEntry({
          name,
          targetProvider: provider,
          marketplaceRepo: resolvedMarketplaceRepo,
        });

        let removedAny = false;
        if (tracked) {
          removedAny = removeTrackedMarketplacePluginArtifacts(
            provider,
            tracked.record,
          );
        }

        // Fallback for legacy installs or missing registry entries.
        if (!tracked || !removedAny) {
          const removedByDiscovery = await removeDiscoveredMarketplacePluginArtifacts(
            provider,
            {
              name,
              marketplaceRepo: resolvedMarketplaceRepo,
              url: typeof url === "string" ? url : undefined,
              sourcePath: typeof sourcePath === "string" ? sourcePath : undefined,
              defaultBranch:
                typeof defaultBranch === "string" ? defaultBranch : undefined,
            },
          );
          removedAny = removedAny || removedByDiscovery;
        }

        // Remove stale registry/tracking entry if present.
        const removedTracking = removeMarketplacePluginEntry({
          name,
          targetProvider: provider,
          marketplaceRepo: resolvedMarketplaceRepo,
        });
        if (!removedAny && !removedTracking) {
          return NextResponse.json(
            { error: "Marketplace package artifacts not found" },
            { status: 404 },
          );
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
