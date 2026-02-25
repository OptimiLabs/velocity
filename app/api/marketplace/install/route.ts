import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { SKILLS_DIR, CLAUDE_DIR, AGENTS_DIR } from "@/lib/claude-paths";
import { CODEX_VELOCITY_AGENTS_DIR } from "@/lib/codex/paths";
import { GEMINI_AGENTS_DIR } from "@/lib/gemini/paths";
import { invalidateMarketplaceCache } from "@/app/api/marketplace/search/route";
import { readSettings, writeSettings } from "@/lib/claude-settings";
import { toRawBase, fetchWithTimeout } from "@/lib/marketplace/fetch-utils";
import { parseGitHubUrl, discoverRepo, DiscoveredComponent } from "@/lib/marketplace/repo-tree";
import { parseReadmeForItems } from "@/lib/marketplace/readme-parser";
import { generateStatuslineScript } from "@/lib/statusline/generator";
import { isWindows } from "@/lib/platform";
import { getDb } from "@/lib/db";
import { fullScan } from "@/lib/instructions/indexer";
import { saveCodexInstruction } from "@/lib/codex/skills";
import { saveGeminiSkill } from "@/lib/gemini/skills";
import { normalizeMarketplaceInstallName } from "@/lib/marketplace/install-names";
import {
  removeMarketplacePluginEntry,
  upsertMarketplacePluginEntry,
} from "@/lib/marketplace/installed-plugins";
import matter from "gray-matter";
import {
  getMarketplaceProviderSupportLabel,
  getMarketplaceTypeLabel,
  isMarketplaceTypeSupportedForProvider,
} from "@/lib/marketplace/provider-support";
import {
  readProviderMcpState,
  writeProviderMcpState,
  type ProviderMcpServerConfig,
} from "@/lib/providers/mcp-settings";
import { syncProviderAgentRegistry } from "@/lib/providers/agent-files";
import type { MarketplaceItem } from "@/types/marketplace";
import type { ConfigProvider } from "@/types/provider";

// --- In-memory job store ---

export interface PluginInstallResult {
  installed: string;
  method: string;
  agents: string[];
  skills: string[];
  commands: string[];
  mcpServers?: string[];
  targetProvider?: ConfigProvider;
}

export interface InstallJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  name: string;
  type: string;
  error?: string;
  result?: {
    installed: string;
    method?: string;
    agents?: string[];
    skills?: string[];
    commands?: string[];
    mcpServers?: string[];
    targetProvider?: ConfigProvider;
  };
  retries: number;
  startedAt: number;
}

const jobs = new Map<string, InstallJob>();
const MAX_RETRIES = 2;

function normalizeTargetProvider(value: unknown): ConfigProvider {
  return value === "codex" || value === "gemini" ? value : "claude";
}

function providerSupportsMcp(provider: ConfigProvider): boolean {
  return provider === "claude" || provider === "codex" || provider === "gemini";
}

function sanitizeMcpConfig(
  config: Record<string, unknown> | ProviderMcpServerConfig,
): ProviderMcpServerConfig {
  const next: ProviderMcpServerConfig = {};
  if (typeof config.command === "string" && config.command.trim()) {
    next.command = config.command.trim();
  }
  if (typeof config.url === "string" && config.url.trim()) {
    next.url = config.url.trim();
  }
  if (Array.isArray(config.args)) {
    next.args = config.args.filter((arg): arg is string => typeof arg === "string");
  }
  if (config.env && typeof config.env === "object" && !Array.isArray(config.env)) {
    next.env = config.env as Record<string, string>;
  }
  if (
    config.headers &&
    typeof config.headers === "object" &&
    !Array.isArray(config.headers)
  ) {
    next.headers = config.headers as Record<string, string>;
  }
  return next;
}

function upsertProviderMcpServer(
  provider: ConfigProvider,
  name: string,
  config: Record<string, unknown> | ProviderMcpServerConfig,
) {
  const key = name.trim();
  if (!key) return;
  const normalized = sanitizeMcpConfig(config);
  if (!normalized.command && !normalized.url) return;
  const state = readProviderMcpState(provider);
  state.enabled[key] = normalized;
  if (state.disabled[key]) {
    delete state.disabled[key];
  }
  writeProviderMcpState(provider, state);
}

function getAgentDirForProvider(provider: ConfigProvider): string {
  if (provider === "codex") return CODEX_VELOCITY_AGENTS_DIR;
  if (provider === "gemini") return GEMINI_AGENTS_DIR;
  return AGENTS_DIR;
}

function writeAgentForProvider(
  provider: ConfigProvider,
  fileName: string,
  content: string,
) {
  const dir = getAgentDirForProvider(provider);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, fileName), content, "utf-8");
}

function toPortableSkillContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  try {
    const parsed = matter(normalized);
    const body = parsed.content.trim();
    if (body) return `${body}\n`;
  } catch {
    // Keep raw content when frontmatter parsing fails.
  }
  const trimmed = normalized.trim();
  return trimmed ? `${trimmed}\n` : "";
}

function writeSkillForProvider(
  provider: ConfigProvider,
  requestedName: string,
  content: string,
): string {
  const safeName = normalizeMarketplaceInstallName(requestedName);
  if (provider === "codex") {
    saveCodexInstruction(safeName, toPortableSkillContent(content));
    return safeName;
  }
  if (provider === "gemini") {
    saveGeminiSkill(safeName, toPortableSkillContent(content));
    return safeName;
  }
  const skillDir = join(SKILLS_DIR, safeName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8");
  return safeName;
}

function normalizeSubpath(subpath?: string | null): string {
  if (!subpath) return "";
  const cleaned = subpath.replace(/^\.\//, "").replace(/\/$/, "");
  return cleaned === "." ? "" : cleaned;
}

// Cleanup jobs older than 5 minutes
function pruneJobs() {
  const cutoff = Date.now() - 5 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.startedAt < cutoff) jobs.delete(id);
  }
}

/** Auto-register a GitHub URL as a marketplace source (github_repo type) */
function autoRegisterSource(repoUrl: string, displayName: string) {
  try {
    // Extract owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match) return;
    const repo = match[1].replace(/\.git$/, "");
    const sourceName = displayName || repo.split("/").pop() || repo;

    const db = getDb();
    // Check if already registered
    const existing = db
      .prepare(
        "SELECT id FROM marketplace_sources WHERE source_type = 'github_repo' AND config LIKE ?",
      )
      .get(`%"repo":"${repo}"%`);
    if (existing) return;

    const id = randomUUID();
    db.prepare(
      "INSERT INTO marketplace_sources (id, name, source_type, config) VALUES (?, ?, ?, ?)",
    ).run(id, sourceName, "github_repo", JSON.stringify({ repo }));
  } catch {
    // Non-critical — don't fail the install
  }
}

/**
 * Install discovered components from a repo tree.
 * Fetches raw content for each component and writes to the appropriate directory.
 */
async function installFromTree(
  owner: string,
  repo: string,
  branch: string,
  subpath: string,
  components: DiscoveredComponent[],
  pluginName: string,
  targetProvider: ConfigProvider,
  selectedPaths?: Set<string>,
): Promise<PluginInstallResult> {
  // Scope to subpath if provided (monorepo support)
  const scoped = subpath
    ? components.filter(
        (c) => c.contextDir === subpath || c.contextDir.startsWith(subpath + "/"),
      )
    : components;
  const filtered = selectedPaths
    ? scoped.filter((c) => selectedPaths.has(c.primaryPath))
    : scoped;

  const rawBase = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
  const agentNames: string[] = [];
  const skillNames: string[] = [];
  const commandNames: string[] = [];
  const mcpServerNames: string[] = [];

  for (const comp of filtered) {
    try {
      switch (comp.kind) {
        case "agent": {
          const res = await fetchWithTimeout(`${rawBase}/${comp.primaryPath}`);
          if (!res.ok) continue;
          const content = await res.text();
          const filename = comp.name.endsWith(".md") ? comp.name : `${comp.name}.md`;
          writeAgentForProvider(targetProvider, filename, content);
          agentNames.push(filename);
          break;
        }
        case "skill": {
          const res = await fetchWithTimeout(`${rawBase}/${comp.primaryPath}`);
          if (!res.ok) continue;
          const content = await res.text();
          const installedName = writeSkillForProvider(
            targetProvider,
            comp.name,
            content,
          );
          skillNames.push(installedName);
          break;
        }
        case "command": {
          const res = await fetchWithTimeout(`${rawBase}/${comp.primaryPath}`);
          if (!res.ok) continue;
          const content = await res.text();
          const installedName = writeSkillForProvider(
            targetProvider,
            comp.name,
            content,
          );
          commandNames.push(installedName);
          break;
        }
        case "mcp-server": {
          if (!providerSupportsMcp(targetProvider)) {
            break;
          }
          const res = await fetchWithTimeout(`${rawBase}/${comp.primaryPath}`);
          if (!res.ok) continue;
          const pkg = await res.json();
          const pkgName = pkg.name as string;
          if (!pkgName) continue;
          // Only register if it looks like an MCP server (has bin or keywords)
          const keywords = (pkg.keywords || []) as string[];
          const hasBin = !!pkg.bin;
          const isMcp =
            hasBin ||
            keywords.some((k: string) => k.includes("mcp") || k.includes("claude"));
          if (!isMcp) continue;
          const serverName =
            pluginName ||
            pkgName.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9-_]/g, "-");
          upsertProviderMcpServer(targetProvider, serverName, {
            command: "npx",
            args: ["-y", pkgName],
          });
          mcpServerNames.push(serverName);
          break;
        }
        case "plugin":
          // Plugin manifest found — the agents/skills/commands within its
          // contextDir will be handled by their own entries
          break;
      }
    } catch {
      // Non-fatal — continue with remaining components
    }
  }

  if (agentNames.length > 0) {
    syncProviderAgentRegistry(targetProvider);
  }

  const totalInstalled =
    agentNames.length + skillNames.length + commandNames.length + mcpServerNames.length;
  if (totalInstalled === 0) {
    throw new Error("No installable components found in repository tree");
  }

  const parts: string[] = [];
  if (agentNames.length > 0) parts.push(`${agentNames.length} agent${agentNames.length > 1 ? "s" : ""}`);
  if (commandNames.length > 0) parts.push(`${commandNames.length} command${commandNames.length > 1 ? "s" : ""}`);
  if (skillNames.length > 0) parts.push(`${skillNames.length} skill${skillNames.length > 1 ? "s" : ""}`);
  if (mcpServerNames.length > 0) {
    parts.push(
      `${mcpServerNames.length} MCP server${mcpServerNames.length > 1 ? "s" : ""}`,
    );
  }

  return {
    installed: `${pluginName} (${parts.join(", ")})`,
    method: "tree-discovery",
    agents: agentNames,
    commands: commandNames,
    skills: skillNames,
    mcpServers: mcpServerNames,
    targetProvider,
  };
}

/** Track what was installed for later uninstall */
function trackPluginInstall(
  name: string,
  marketplaceRepo: string,
  targetProvider: ConfigProvider,
  result: PluginInstallResult,
) {
  upsertMarketplacePluginEntry({
    name,
    targetProvider,
    marketplaceRepo,
    agents: result.agents,
    skills: result.skills,
    commands: result.commands,
    mcpServers: result.mcpServers,
    disabled: false,
  });
}

/** Remove tracking entry on uninstall */
export function trackPluginUninstall(
  name: string,
  targetProvider: ConfigProvider = "claude",
  marketplaceRepo?: string,
) {
  removeMarketplacePluginEntry({ name, targetProvider, marketplaceRepo });
}

// --- Install logic (runs in background) ---

async function runInstall(
  job: InstallJob,
  type: string,
  url: string,
  name: string,
  targetProvider: ConfigProvider,
  config?: Record<string, unknown>,
) {
  job.status = "running";

  try {
    switch (type) {
      case "skill": {
        // Builtin recommended skills carry inline content — write directly
        if (config?.skillContent) {
          const installedName = writeSkillForProvider(
            targetProvider,
            name || "skill",
            config.skillContent as string,
          );
          job.status = "completed";
          job.result = {
            installed: installedName,
            method: "skill",
            targetProvider,
          };
          break;
        }
        const skillBase = toRawBase(url);
        let content: string;
        const res = await fetchWithTimeout(`${skillBase}/SKILL.md`);
        if (!res.ok) {
          const readmeUrl = `${skillBase}/README.md`;
          const res2 = await fetchWithTimeout(readmeUrl);
          if (!res2.ok)
            throw new Error("Could not fetch skill content from repository");
          content = await res2.text();
        } else {
          content = await res.text();
        }
        const installedName = writeSkillForProvider(
          targetProvider,
          name || url.split("/").pop() || "skill",
          content,
        );
        job.status = "completed";
        job.result = {
          installed: installedName,
          method: "skill",
          targetProvider,
        };
        break;
      }

      case "mcp-server": {
        if (!providerSupportsMcp(targetProvider)) {
          throw new Error(
            `MCP server install is not supported for ${targetProvider}.`,
          );
        }
        if (!name || !config)
          throw new Error("Name and config required for MCP server");
        upsertProviderMcpServer(targetProvider, name, config);
        job.status = "completed";
        job.result = {
          installed: name,
          method: "mcp-config",
          mcpServers: [name],
          targetProvider,
        };
        break;
      }

      case "hook": {
        if (!config?.event || !config?.hook)
          throw new Error("Event and hook config required");
        const settings = readSettings();
        const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
        const event = config.event as string;
        if (!hooks[event]) hooks[event] = [];
        const rule: Record<string, unknown> = { hooks: [config.hook] };
        if (config.matcher) rule.matcher = config.matcher;
        hooks[event].push(rule);
        settings.hooks = hooks;
        writeSettings(settings);
        job.status = "completed";
        job.result = { installed: event, method: "hook", targetProvider };
        break;
      }

      case "marketplace-plugin":
      case "agent":
      case "unclassified":
      case "plugin": {
        const canInstallMcp = providerSupportsMcp(targetProvider);
        const preinstalledMcpServers: string[] = [];
        const selectedComponents = Array.isArray(config?.components)
          ? (config.components as {
              primaryPath?: string;
              name?: string;
              installConfig?: { command: string; args: string[] };
            }[])
          : [];
        const mcpSelections = selectedComponents.filter(
          (c) => c.installConfig?.command,
        );

        if (mcpSelections.length > 0) {
          if (!canInstallMcp) {
            if (selectedComponents.length === mcpSelections.length) {
              throw new Error(
                `Selected components are MCP servers. MCP install is not supported for ${targetProvider}.`,
              );
            }
          } else {
            const serverNames: string[] = [];
            for (const comp of mcpSelections) {
              const serverName =
                (comp.name || "mcp-server").replace(/[^a-zA-Z0-9-_]/g, "-");
              upsertProviderMcpServer(targetProvider, serverName, {
                command: comp.installConfig!.command,
                args: comp.installConfig!.args,
              });
              serverNames.push(serverName);
              preinstalledMcpServers.push(serverName);
            }
            if (selectedComponents.length === mcpSelections.length) {
              job.status = "completed";
              job.result = {
                installed: `${name} (${serverNames.length} MCP server${serverNames.length > 1 ? "s" : ""})`,
                method: "mcp-config",
                agents: [],
                skills: [],
                commands: [],
                mcpServers: serverNames,
                targetProvider,
              };
              break;
            }
          }
        }

        const selectedPaths =
          selectedComponents.length > 0
            ? new Set(
                selectedComponents
                  .filter((c) => !c.installConfig?.command)
                  .map((c) => c.primaryPath)
                  .filter(Boolean) as string[],
              )
            : undefined;

        // If installConfig was provided (from README discovery), use it directly
        if (config?.installConfig) {
          if (!canInstallMcp) {
            throw new Error(
              `This package installs as an MCP server, which is not supported for ${targetProvider}.`,
            );
          }
          const ic = config.installConfig as {
            command: string;
            args: string[];
          };
          const serverName =
            name.replace(/[^a-zA-Z0-9-_]/g, "-") || "mcp-server";
          upsertProviderMcpServer(targetProvider, serverName, {
            command: ic.command,
            args: ic.args,
          });
          job.status = "completed";
          job.result = {
            installed: serverName,
            method: "mcp-config",
            mcpServers: [serverName],
            targetProvider,
          };
          break;
        }

        // --- Fast-path 2: parse README for MCP install commands ---
        if (canInstallMcp) {
          const parsed = parseGitHubUrl(url);
          if (parsed) {
            try {
              const branch =
                (config?.defaultBranch as string | undefined) || parsed.branch;
              const readmeUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/README.md`;
              const readmeRes = await fetchWithTimeout(readmeUrl);
              if (readmeRes.ok) {
                const readme = await readmeRes.text();
                const readmeItems = parseReadmeForItems(readme);
                const mcpItem = readmeItems.find((i) => i.installConfig);
                if (mcpItem?.installConfig) {
                  const serverName =
                    name.replace(/[^a-zA-Z0-9-_]/g, "-") || mcpItem.name || "mcp-server";
                  upsertProviderMcpServer(targetProvider, serverName, {
                    command: mcpItem.installConfig.command,
                    args: mcpItem.installConfig.args,
                  });
                  job.status = "completed";
                  job.result = {
                    installed: serverName,
                    method: "readme-install",
                    mcpServers: [serverName],
                    targetProvider,
                  };
                  break;
                }
              }
            } catch {
              // README fetch/parse failed — fall through to BFS discovery
            }
          }
        }

        // --- Primary: BFS tree discovery ---
        const parsed = parseGitHubUrl(url);
        if (parsed) {
          try {
            const branch =
              (config?.defaultBranch as string | undefined) || parsed.branch;
            const discovery = await discoverRepo(parsed.owner, parsed.repo, branch);
            if (discovery && discovery.components.length > 0) {
              const scopedSubpath = normalizeSubpath(
                (config?.sourcePath as string | undefined) || parsed.subpath,
              );
              const installed = await installFromTree(
                parsed.owner,
                parsed.repo,
                branch,
                scopedSubpath,
                discovery.components,
                name,
                targetProvider,
                selectedPaths,
              );
              if (preinstalledMcpServers.length > 0) {
                installed.mcpServers = Array.from(
                  new Set([
                    ...(installed.mcpServers || []),
                    ...preinstalledMcpServers,
                  ]),
                );
              }
              if (config?.marketplaceRepo) {
                trackPluginInstall(
                  name,
                  config.marketplaceRepo as string,
                  targetProvider,
                  installed,
                );
              }
              job.status = "completed";
              job.result = installed;
              break;
            }
          } catch {
            // Tree discovery failed — fall through to legacy chain
          }
        }

        // --- Fallback: legacy fetch chain (non-GitHub URLs, rate limits, etc.) ---
        const rawBase = toRawBase(url);

        // Try 1: package.json → install as MCP server via npx
        if (canInstallMcp) {
          const pkgRes = await fetchWithTimeout(`${rawBase}/package.json`);
          if (pkgRes.ok) {
            const pkg = await pkgRes.json();
            const pkgName = pkg.name as string;
            if (pkgName) {
              const serverName =
                name ||
                pkgName.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z0-9-_]/g, "-");
              upsertProviderMcpServer(targetProvider, serverName, {
                command: "npx",
                args: ["-y", pkgName],
              });
              job.status = "completed";
              job.result = {
                installed: serverName,
                method: "mcp-npx",
                mcpServers: [serverName],
                targetProvider,
              };
              break;
            }
          }
        }

        // Try 2: SKILL.md or README.md → install as skill
        for (const filename of ["SKILL.md", "README.md"]) {
          const res = await fetchWithTimeout(`${rawBase}/${filename}`);
          if (res.ok) {
            const content = await res.text();
            if (content.length < 20) continue;
            const installedName = writeSkillForProvider(
              targetProvider,
              name || url.split("/").pop() || "skill",
              content,
            );
            job.status = "completed";
            job.result = {
              installed: installedName,
              method: "skill",
              targetProvider,
            };
            break;
          }
        }
        if (job.status === "completed") break;

        // Try 3: auto-register as a marketplace source
        autoRegisterSource(url, name);
        job.status = "completed";
        job.result = {
          installed: name || url.split("/").pop() || "source",
          method: "source-added",
          targetProvider,
        };
        break;
      }

      case "statusline": {
        const port = parseInt(process.env.PORT || "3000", 10);
        const scriptContent = generateStatuslineScript(port);
        const scriptPath = join(CLAUDE_DIR, "statusline-usage.sh");
        writeFileSync(scriptPath, scriptContent, "utf-8");
        if (!isWindows) chmodSync(scriptPath, 0o755);
        const settings = readSettings();
        settings.statusLine = { type: "command", command: scriptPath };
        writeSettings(settings);
        job.status = "completed";
        job.result = { installed: "statusline-usage", method: "statusline", targetProvider };
        break;
      }

      default:
        throw new Error(`Unknown install type: ${type}`);
    }
    // Re-index instruction files so newly installed skills appear immediately
    if (job.status === "completed") {
      try {
        fullScan();
      } catch {
        // Non-critical — skills will appear on next periodic scan
      }
      invalidateMarketplaceCache();
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Install failed";
    // Retry on transient failures (network timeouts, fetch errors)
    if (job.retries < MAX_RETRIES && isRetryable(err)) {
      job.retries++;
      job.status = "pending";
      // Exponential backoff: 2s, 4s
      setTimeout(
        () => runInstall(job, type, url, name, targetProvider, config),
        2000 * job.retries,
      );
      return;
    }
    job.status = "failed";
    job.error = message;
    invalidateMarketplaceCache();
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("timeout") ||
      msg.includes("abort") ||
      msg.includes("network") ||
      msg.includes("econnreset")
    );
  }
  return false;
}

// --- POST: Start install job ---

export async function POST(request: Request) {
  try {
    const { type, url, name, config, targetProvider } = await request.json();

    if (!type || !url) {
      return NextResponse.json(
        { error: "type and url are required" },
        { status: 400 },
      );
    }

    const normalizedTargetProvider = normalizeTargetProvider(targetProvider);
    const normalizedType = type as MarketplaceItem["type"];
    if (
      !isMarketplaceTypeSupportedForProvider(
        normalizedType,
        normalizedTargetProvider,
      )
    ) {
      return NextResponse.json(
        {
          error: `${getMarketplaceTypeLabel(normalizedType)} supports ${getMarketplaceProviderSupportLabel(normalizedType)}.`,
        },
        { status: 400 },
      );
    }

    pruneJobs();

    const jobId = `install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job: InstallJob = {
      id: jobId,
      status: "pending",
      name: name || url.split("/").pop() || "unknown",
      type,
      retries: 0,
      startedAt: Date.now(),
    };
    jobs.set(jobId, job);

    // Fire and forget — don't await
    runInstall(job, type, url, name, normalizedTargetProvider, config);

    return NextResponse.json({
      jobId,
      status: "pending",
      name: job.name,
      targetProvider: normalizedTargetProvider,
    });
  } catch {
    return NextResponse.json({ error: "Install failed" }, { status: 500 });
  }
}

// --- GET: Poll job status ---

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");

  if (!jobId) {
    // Return all active jobs
    const active = [...jobs.values()].filter(
      (j) => j.status === "pending" || j.status === "running",
    );
    return NextResponse.json(active);
  }

  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json(job);
}
