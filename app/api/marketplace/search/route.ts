import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { SKILLS_DIR, CLAUDE_DIR, AGENTS_DIR } from "@/lib/claude-paths";
import { CODEX_VELOCITY_AGENTS_DIR } from "@/lib/codex/paths";
import { getCodexInstructionDirs } from "@/lib/codex/skills";
import { GEMINI_AGENTS_DIR, GEMINI_SKILLS_DIR } from "@/lib/gemini/paths";
import { readSettings } from "@/lib/claude-settings";
import { readProviderMcpState } from "@/lib/providers/mcp-settings";
import type { MarketplaceItem } from "@/types/marketplace";
import type { ConfigProvider } from "@/types/provider";
import { getBuiltinHookItems } from "@/lib/marketplace/builtin-hooks";
import { getMarketplaceInstallNameCandidates } from "@/lib/marketplace/install-names";
import type { RawHooks } from "@/lib/hooks/matcher";
import { apiLog } from "@/lib/logger";
import { countPluginComponents, type ManifestPlugin } from "@/lib/marketplace/component-counts";
import { parseReadmeForItems } from "@/lib/marketplace/readme-parser";
import { summarizeRepoComponents } from "@/lib/marketplace/discovery";

const STATUSLINE_SCRIPT_PATH = join(CLAUDE_DIR, "statusline-usage.sh");
const INSTALLED_PLUGINS_PATH = join(
  CLAUDE_DIR,
  "plugins",
  "installed_plugins.json",
);

function normalizeProvider(value: unknown): ConfigProvider {
  return value === "codex" || value === "gemini" ? value : "claude";
}

function getSkillInstalled(
  provider: ConfigProvider,
  name: string,
): boolean {
  const candidates = getMarketplaceInstallNameCandidates(name);
  if (provider === "codex") {
    const dirs = getCodexInstructionDirs();
    return candidates.some((candidate) =>
      dirs.some(
        (dir) =>
          existsSync(join(dir, `${candidate}.md`)) ||
          existsSync(join(dir, `${candidate}.md.disabled`)),
      ),
    );
  }
  if (provider === "gemini") {
    return candidates.some(
      (candidate) =>
        existsSync(join(GEMINI_SKILLS_DIR, `${candidate}.md`)) ||
        existsSync(join(GEMINI_SKILLS_DIR, `${candidate}.md.disabled`)),
    );
  }

  return candidates.some(
    (candidate) =>
      existsSync(join(SKILLS_DIR, candidate, "SKILL.md")) ||
      existsSync(join(SKILLS_DIR, `${candidate}.md`)),
  );
}

function getAgentInstalled(
  provider: ConfigProvider,
  name: string,
): boolean {
  const dir =
    provider === "codex"
      ? CODEX_VELOCITY_AGENTS_DIR
      : provider === "gemini"
        ? GEMINI_AGENTS_DIR
        : AGENTS_DIR;
  const candidates = getMarketplaceInstallNameCandidates(name);
  return candidates.some((candidate) => existsSync(join(dir, `${candidate}.md`)));
}

// Used both for type inference and for building GitHub topic search queries.
// "marketplace-plugin" is only assigned via expandMarketplaceRepo, not by inferType.
const TOPIC_MAP: Record<string, string[]> = {
  skill: ["claude-code-skill", "claude-code-command"],
  "mcp-server": ["mcp-server", "claude-mcp-server", "model-context-protocol"],
  hook: ["claude-code-hook"],
  plugin: ["claude-code-plugin"],
  "marketplace-plugin": ["claude-code-plugin"],
  agent: ["claude-code-agent", "claude-agent"],
};

function inferType(
  topics: string[],
  name?: string,
  description?: string,
): MarketplaceItem["type"] {
  // Topic-based matching (most reliable)
  for (const [type, keywords] of Object.entries(TOPIC_MAP)) {
    if (type === "marketplace-plugin") continue; // assigned by expandMarketplaceRepo only
    if (keywords.some((k) => topics.includes(k)))
      return type as MarketplaceItem["type"];
  }
  if (topics.some((t) => t.includes("mcp"))) return "mcp-server";

  // Heuristic fallback from name/description when topics are absent
  const text = `${name ?? ""} ${description ?? ""}`.toLowerCase();
  if (/\bmcp\b/.test(text) || /model.context.protocol/i.test(text))
    return "mcp-server";
  if (
    /\bclaude.code.skill\b/.test(text) ||
    /\bslash.command\b/.test(text) ||
    /\bskill\b/.test(text)
  )
    return "skill";
  if (
    /\bclaude.code.hook\b/.test(text) ||
    /\bhook\b/.test(text) ||
    /\bpre.tool\b/.test(text) ||
    /\bpost.tool\b/.test(text)
  )
    return "hook";
  if (/\bagent\b/.test(text)) return "agent";

  return "unclassified";
}

function getInstalledPlugins(): Record<string, unknown[]> {
  try {
    if (!existsSync(INSTALLED_PLUGINS_PATH)) return {};
    const data = JSON.parse(readFileSync(INSTALLED_PLUGINS_PATH, "utf-8"));
    return (data.plugins || {}) as Record<string, unknown[]>;
  } catch {
    return {};
  }
}

function hasProviderMcpServer(provider: ConfigProvider, candidates: string[]): boolean {
  const state = readProviderMcpState(provider);
  const servers =
    provider === "claude"
      ? { ...state.enabled, ...state.disabled }
      : state.enabled;
  return candidates.some((candidate) => candidate in servers);
}

function checkInstalled(
  name: string,
  type: string,
  provider: ConfigProvider = "claude",
  marketplaceRepo?: string,
): boolean {
  try {
    const candidates = getMarketplaceInstallNameCandidates(name);
    const primaryName = candidates[0] ?? name;
    const normalizedName = candidates[candidates.length - 1] ?? name;

    switch (type) {
      case "skill":
        return getSkillInstalled(provider, name);
      case "mcp-server": {
        return hasProviderMcpServer(provider, candidates);
      }
      case "hook": {
        // Check if any hook command references this specific name
        const settings = readSettings();
        const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
        for (const entries of Object.values(hooks)) {
          for (const rule of entries) {
            const ruleObj = rule as Record<string, unknown>;
            // Check inner hooks array (proper HookRule structure)
            const innerHooks = (ruleObj.hooks as Record<string, unknown>[]) || [];
            for (const h of innerHooks) {
              const cmd = (h.command as string) || "";
              if (candidates.some((candidate) => cmd.includes(candidate))) return true;
            }
            // Also check flat command (legacy/broken entries)
            const flatCmd = (ruleObj.command as string) || "";
            if (candidates.some((candidate) => flatCmd.includes(candidate))) return true;
          }
        }
        return false;
      }
      case "statusline":
        return (
          existsSync(STATUSLINE_SCRIPT_PATH) && !!readSettings().statusLine
        );
      case "marketplace-plugin": {
        const plugins = getInstalledPlugins();
        if (marketplaceRepo) {
          const marketplaceId = marketplaceRepo.split("/").pop() || "";
          for (const candidate of candidates) {
            const key = `${provider}:${candidate}@${marketplaceId}`;
            if (key in plugins) return true;
            const legacyKey = `${candidate}@${marketplaceId}`;
            if (legacyKey in plugins) return true;
          }
        }
        if (
          Object.keys(plugins).some(
            (k) =>
              candidates.some(
                (candidate) =>
                  k.startsWith(`${provider}:${candidate}@`) ||
                  k.startsWith(candidate + "@"),
              ),
          )
        ) {
          return true;
        }
        // Fallback: check if any agent files with this plugin prefix exist on disk
        try {
          const agentDir =
            provider === "codex"
              ? CODEX_VELOCITY_AGENTS_DIR
              : provider === "gemini"
                ? GEMINI_AGENTS_DIR
                : AGENTS_DIR;
          if (existsSync(agentDir)) {
            const agentFiles = readdirSync(agentDir);
            if (
              agentFiles.some((f) =>
                candidates.some((candidate) => f.startsWith(candidate)),
              )
            ) {
              return true;
            }
          }
        } catch { /* non-critical */ }
        return false;
      }
      case "agent":
        return getAgentInstalled(provider, name);
      case "unclassified":
      case "plugin":
      default: {
        // "plugin" type install tries multiple methods (skill → MCP → plugin format → source)
        // so we check all of them
        if (getSkillInstalled(provider, name)) return true;
        if (getAgentInstalled(provider, name)) return true;
        if (hasProviderMcpServer(provider, candidates)) return true;
        const plugins = getInstalledPlugins();
        if (
          Object.keys(plugins).some(
            (k) =>
              k.startsWith(`${provider}:${primaryName}@`) ||
              k.startsWith(primaryName + "@") ||
              k.startsWith(`${provider}:${normalizedName}@`) ||
              k.startsWith(normalizedName + "@"),
          )
        ) {
          return true;
        }
        return false;
      }
    }
  } catch (err) {
    apiLog.debug("checkInstalled failed", err);
    return false;
  }
}

const GITHUB_FETCH_TIMEOUT = 8_000;

/** Fetch repo tree and count agents/skills/commands per plugin */
async function getPluginComponentCounts(
  owner: string,
  repo: string,
  plugins?: ManifestPlugin[],
  branch = "main",
): Promise<Record<string, { agents: number; skills: number; commands: number }>> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: GITHUB_HEADERS, signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT) },
    );
    if (!res.ok) return {};
    const data = await res.json();
    return countPluginComponents(data.tree || [], plugins);
  } catch (err) {
    apiLog.debug("getPluginComponentCounts failed", err);
    return {};
  }
}

/** Check if a GitHub repo is a plugin marketplace and expand into individual plugins */
async function expandMarketplaceRepo(
  owner: string,
  repo: string,
  repoUrl: string,
  stars: number | undefined,
  updatedAt: string | undefined,
  defaultBranch: string,
  provider: ConfigProvider,
): Promise<MarketplaceItem[] | null> {
  const marketplaceRepo = `${owner}/${repo}`;
  const branch = defaultBranch || "main";

  // Try 1: formal marketplace.json manifest
  try {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.claude-plugin/marketplace.json`;
    const res = await fetch(rawUrl, {
      signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      const plugins = data.plugins as (ManifestPlugin & {
        description?: string;
        category?: string;
        author?: { name?: string };
      })[];
      if (Array.isArray(plugins) && plugins.length > 0) {
        // Fetch component counts, passing manifest plugins for multi-strategy detection
        const componentCounts = await getPluginComponentCounts(owner, repo, plugins, branch);

        return plugins
          .map((p) => {
            // Derive URL from source path, or fall back to plugins/ prefix, or repo root
            const treePath = p.source
              ? p.source.replace(/^\.\//, "")
              : `plugins/${p.name}`;
            return {
              name: p.name,
              description: p.description || "",
              type: "marketplace-plugin" as const,
              author: p.author?.name || owner,
              url: `${repoUrl}/tree/${branch}/${treePath}`,
              stars,
              updatedAt,
              installed: checkInstalled(
                p.name,
                "marketplace-plugin",
                provider,
                marketplaceRepo,
              ),
              sourceId: "",
              marketplaceRepo,
              category: p.category,
              components: componentCounts[p.name] || undefined,
              sourcePath: p.source || undefined,
              repo: { owner, name: repo },
              defaultBranch: branch,
              componentSelectionSupported: true,
            };
          })
          .filter((p) => {
            // Exclude plugins listed in manifest but with no actual content on disk
            if (!p.components) return false;
            const { agents, skills, commands } = p.components;
            return agents + skills + commands > 0;
          });
      }
    }
  } catch {
    // Fall through to README parsing
  }

  // Try 2: parse README for installable items
  try {
    const readmeUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
    const res = await fetch(readmeUrl, {
      signal: AbortSignal.timeout(GITHUB_FETCH_TIMEOUT),
    });
    if (!res.ok) return null;

    const readme = await res.text();
    const parsed = parseReadmeForItems(readme);
    if (parsed.length === 0) return null;

    return parsed.map((p) => ({
      name: p.name,
      description: p.description,
      type: p.type,
      author: owner,
      url: repoUrl,
      stars,
      updatedAt,
      installed: checkInstalled(p.name, p.type, provider),
      sourceId: "",
      marketplaceRepo,
      category: "readme-discovered",
      installConfig: p.installConfig,
      repo: { owner, name: repo },
      defaultBranch: branch,
    }));
  } catch {
    return null;
  }
}

const GITHUB_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    : {}),
};

async function searchGithub(
  query: string,
  typeFilter: string,
  provider: ConfigProvider,
): Promise<MarketplaceItem[]> {
  const topicQuery =
    typeFilter && TOPIC_MAP[typeFilter]
      ? TOPIC_MAP[typeFilter].map((t) => `topic:${t}`).join("+")
      : "topic:claude-code-plugin+OR+topic:mcp-server+OR+topic:claude-code-skill+OR+topic:claude-code-hook";

  const searchQuery = encodeURIComponent(`${query} ${topicQuery}`);
  const res = await fetch(
    `https://api.github.com/search/repositories?q=${searchQuery}&sort=stars&order=desc&per_page=20`,
    { headers: GITHUB_HEADERS, next: { revalidate: 300 } },
  );
  if (!res.ok) return [];

  const data = await res.json();
  return (data.items || []).map((repo: Record<string, unknown>) => {
    const topics = (repo.topics as string[]) || [];
    const name = repo.name as string;
    const desc = (repo.description as string) || "";
    const type = inferType(topics, name, desc);
    if (typeFilter && type !== typeFilter) return null;
    const fullName = repo.full_name as string | undefined;
    const [owner, repoName] = fullName ? fullName.split("/") : ["", ""];
    const defaultBranch = repo.default_branch as string | undefined;
    return {
      name,
      description: desc,
      type,
      author: ((repo.owner as Record<string, unknown>)?.login as string) || "",
      url: repo.html_url as string,
      stars: repo.stargazers_count as number,
      updatedAt: repo.updated_at as string,
      installed: checkInstalled(name, type, provider),
      sourceId: "",
      repo: owner && repoName ? { owner, name: repoName } : undefined,
      defaultBranch,
    };
  }).filter(Boolean) as MarketplaceItem[];
}

async function searchGithubOrg(
  org: string,
  query: string,
  typeFilter: string,
  provider: ConfigProvider,
): Promise<MarketplaceItem[]> {
  const res = await fetch(
    `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?sort=updated&per_page=50`,
    { headers: GITHUB_HEADERS, next: { revalidate: 300 } },
  );
  if (!res.ok) {
    // Try as a user instead of org
    const userRes = await fetch(
      `https://api.github.com/users/${encodeURIComponent(org)}/repos?sort=updated&per_page=50`,
      { headers: GITHUB_HEADERS, next: { revalidate: 300 } },
    );
    if (!userRes.ok) return [];
    const data = await userRes.json();
    return filterRepos(data, query, typeFilter, provider);
  }
  const data = await res.json();
  return filterRepos(data, query, typeFilter, provider);
}

function filterRepos(
  repos: Record<string, unknown>[],
  query: string,
  typeFilter: string,
  provider: ConfigProvider,
): MarketplaceItem[] {
  const q = query.toLowerCase();
  return repos
    .filter((repo) => {
      if (q) {
        const name = ((repo.name as string) || "").toLowerCase();
        const desc = ((repo.description as string) || "").toLowerCase();
        if (!name.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    })
    .map((repo) => {
      const topics = (repo.topics as string[]) || [];
      const name = repo.name as string;
      const desc = (repo.description as string) || "";
      const type = inferType(topics, name, desc);
      if (typeFilter && type !== typeFilter) return null;
      const fullName = repo.full_name as string | undefined;
      const [owner, repoName] = fullName ? fullName.split("/") : ["", ""];
      const defaultBranch = repo.default_branch as string | undefined;
      return {
        name,
        description: desc,
        type,
        author:
          ((repo.owner as Record<string, unknown>)?.login as string) || "",
        url: repo.html_url as string,
        stars: repo.stargazers_count as number,
        updatedAt: repo.updated_at as string,
        installed: checkInstalled(name, type, provider),
        sourceId: "",
        repo: owner && repoName ? { owner, name: repoName } : undefined,
        defaultBranch,
      };
    })
    .filter(Boolean) as MarketplaceItem[];
}

async function searchGithubRepo(
  owner: string,
  repo: string,
  provider: ConfigProvider,
): Promise<MarketplaceItem[]> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    { headers: GITHUB_HEADERS, next: { revalidate: 300 } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  const repoUrl = data.html_url as string;
  const stars = data.stargazers_count as number;
  const updatedAt = data.updated_at as string;
  const defaultBranch = (data.default_branch as string) || "main";

  // Check if this repo is a plugin marketplace — if so, expand into individual plugins
  const expanded = await expandMarketplaceRepo(
    owner,
    repo,
    repoUrl,
    stars,
    updatedAt,
    defaultBranch,
    provider,
  );
  if (expanded) return expanded;

  const name = data.name as string;
  const desc = (data.description as string) || "";
  const author = ((data.owner as Record<string, unknown>)?.login as string) || "";

  // Use repo tree discovery for accurate component classification
  const summary = await summarizeRepoComponents(owner, repo, defaultBranch);
  if (summary) {
    const coreComponents = summary.components.filter(
      (c) => c.kind === "skill" || c.kind === "agent" || c.kind === "command",
    );
    const hasMultiple = coreComponents.length > 1;
    const hasReadmeMcp =
      summary.readmeMcpItems && summary.readmeMcpItems.length > 0;

    if (!hasMultiple && coreComponents.length === 1) {
      const comp = coreComponents[0];
      const type = comp.kind === "agent" ? "agent" : "skill";
      const branch = summary.repo.defaultBranch;
      const compUrl = `${repoUrl}/blob/${branch}/${comp.primaryPath}`;
      return [
        {
          name: comp.name,
          description: desc,
          type,
          author,
          url: compUrl,
          stars,
          updatedAt,
          installed: checkInstalled(comp.name, type, provider),
          sourceId: "",
          repo: { owner, name: repo },
          defaultBranch: summary.repo.defaultBranch,
        },
      ];
    }

    if (summary.mcpPackage) {
      const branch = summary.repo.defaultBranch;
      const pkgUrl = `${repoUrl}/blob/${branch}/${summary.mcpPackage.primaryPath}`;
      return [
        {
          name: summary.mcpPackage.name,
          description: summary.mcpPackage.description || desc,
          type: "mcp-server",
          author,
          url: pkgUrl,
          stars,
          updatedAt,
          installed: checkInstalled(
            summary.mcpPackage.name,
            "mcp-server",
            provider,
          ),
          sourceId: "",
          repo: { owner, name: repo },
          defaultBranch: summary.repo.defaultBranch,
          installConfig: summary.mcpPackage.installConfig,
        },
      ];
    }

    if (summary.readmeMcpItems && summary.readmeMcpItems.length === 1) {
      const item = summary.readmeMcpItems[0];
      const branch = summary.repo.defaultBranch;
      const readmeUrl = `${repoUrl}/blob/${branch}/README.md`;
      return [
        {
          name: item.name,
          description: item.description || desc,
          type: "mcp-server",
          author,
          url: readmeUrl,
          stars,
          updatedAt,
          installed: checkInstalled(item.name, "mcp-server", provider),
          sourceId: "",
          repo: { owner, name: repo },
          defaultBranch: summary.repo.defaultBranch,
          installConfig: item.installConfig,
        },
      ];
    }

    if (coreComponents.length === 0 && !summary.mcpPackage && !hasReadmeMcp) {
      const topics = (data.topics as string[]) || [];
      const inferred = inferType(topics, name, desc);
      return [
        {
          name,
          description: desc,
          type: inferred,
          author,
          url: repoUrl,
          stars,
          updatedAt,
          installed: checkInstalled(name, inferred, provider),
          sourceId: "",
          repo: { owner, name: repo },
          defaultBranch: summary.repo.defaultBranch,
        },
      ];
    }

    const counts = {
      agents: coreComponents.filter((c) => c.kind === "agent").length,
      skills: coreComponents.filter((c) => c.kind === "skill").length,
      commands: coreComponents.filter((c) => c.kind === "command").length,
    };

    return [
      {
        name,
        description: desc,
        type: "plugin",
        author,
        url: repoUrl,
        stars,
        updatedAt,
        installed: checkInstalled(name, "plugin", provider),
        sourceId: "",
        repo: { owner, name: repo },
        defaultBranch: summary.repo.defaultBranch,
        components: counts.agents + counts.skills + counts.commands > 0 ? counts : undefined,
        componentSelectionSupported: true,
        category: hasReadmeMcp ? "readme-discovered" : undefined,
      },
    ];
  }

  const topics = (data.topics as string[]) || [];
  const type = inferType(topics, name, desc);
  return [
    {
      name,
      description: desc,
      type,
      author,
      url: repoUrl,
      stars,
      updatedAt,
      installed: checkInstalled(name, type, provider),
      sourceId: "",
      repo: { owner, name: repo },
      defaultBranch,
    },
  ];
}

async function searchRegistry(
  url: string,
  query: string,
  typeFilter: string,
  provider: ConfigProvider,
): Promise<MarketplaceItem[]> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const items: MarketplaceItem[] = await res.json();
    const q = query.toLowerCase();
    return items
      .filter((item) => {
        if (
          q &&
          !item.name.toLowerCase().includes(q) &&
          !item.description.toLowerCase().includes(q)
        )
          return false;
        if (typeFilter && item.type !== typeFilter) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        installed: checkInstalled(item.name, item.type, provider),
      }));
  } catch (err) {
    apiLog.debug("searchRegistry failed", err);
    return [];
  }
}

function getCacheKey(
  sourceId: string,
  query: string,
  typeFilter: string,
  provider: ConfigProvider,
) {
  return `${sourceId}||${query}||${typeFilter}||${provider}`;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function readCache(
  db: ReturnType<typeof getDb>,
  key: string,
): MarketplaceItem[] | null {
  const row = db
    .prepare("SELECT items, fetched_at FROM marketplace_cache WHERE cache_key = ?")
    .get(key) as { items: string; fetched_at: number } | undefined;
  if (!row) return null;
  // Expire stale cache
  if (Date.now() - row.fetched_at > CACHE_TTL_MS) return null;
  try {
    return JSON.parse(row.items) as MarketplaceItem[];
  } catch {
    return null;
  }
}

function writeCache(
  db: ReturnType<typeof getDb>,
  key: string,
  items: MarketplaceItem[],
) {
  db.prepare(
    "INSERT OR REPLACE INTO marketplace_cache (cache_key, items, fetched_at) VALUES (?, ?, ?)",
  ).run(key, JSON.stringify(items), Date.now());
}

/** Drop all cached marketplace results — called on install/uninstall errors */
export function invalidateMarketplaceCache() {
  try {
    getDb().exec("DELETE FROM marketplace_cache");
  } catch {
    /* table may not exist yet */
  }
}

async function fetchFromSources(
  db: ReturnType<typeof getDb>,
  sourceId: string,
  query: string,
  typeFilter: string,
  provider: ConfigProvider,
): Promise<MarketplaceItem[]> {
  let sources: Record<string, unknown>[];

  if (sourceId) {
    const row = db
      .prepare("SELECT * FROM marketplace_sources WHERE id = ?")
      .get(sourceId) as Record<string, unknown> | undefined;
    sources = row ? [row] : [];
  } else {
    sources = db
      .prepare("SELECT * FROM marketplace_sources WHERE enabled = 1")
      .all() as Record<string, unknown>[];
  }

  const sourceResults = await Promise.all(
    sources.map(async (src) => {
      const config = JSON.parse((src.config as string) || "{}");
      const srcId = src.id as string;
      let results: MarketplaceItem[] = [];

      switch (src.source_type) {
        case "github_search":
          results = await searchGithub(
            query || config.query || "claude-code",
            typeFilter,
            provider,
          );
          break;
        case "github_org":
          results = await searchGithubOrg(
            config.org || config.name || "",
            query,
            typeFilter,
            provider,
          );
          break;
        case "github_repo": {
          const [owner, repo] = (config.repo || "").split("/");
          if (owner && repo) results = await searchGithubRepo(owner, repo, provider);
          break;
        }
        case "registry":
          results = await searchRegistry(config.url || "", query, typeFilter, provider);
          break;
      }

      return results.map((r) => ({ ...r, sourceId: srcId }));
    }),
  );

  const allResults = sourceResults.flat();

  // Inject builtin hook templates
  const settings = readSettings();
  const builtinHooks = getBuiltinHookItems(query, typeFilter, settings.hooks as RawHooks | undefined);
  allResults.unshift(...builtinHooks);

  // Deduplicate by url
  const seen = new Set<string>();
  return allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sourceId = searchParams.get("sourceId") || "";
  const query = searchParams.get("q") || "";
  const typeFilter = searchParams.get("type") || "";
  const provider = normalizeProvider(searchParams.get("provider"));
  const refresh = searchParams.get("refresh") === "1";

  try {
    const db = getDb();
    const cacheKey = getCacheKey(sourceId, query, typeFilter, provider);

    if (!refresh) {
      const cached = readCache(db, cacheKey);
      if (cached) {
        // Re-check installed status from filesystem (fast local check)
        const items = cached.map((item) => ({
          ...item,
          installed: checkInstalled(
            item.name,
            item.type,
            provider,
            item.marketplaceRepo,
          ),
        }));
        return NextResponse.json(items);
      }
    }

    // No cache or forced refresh — fetch from GitHub, cache, and return
    const items = await fetchFromSources(
      db,
      sourceId,
      query,
      typeFilter,
      provider,
    );
    writeCache(db, cacheKey, items);
    const withInstalled = items.map((item) => ({
      ...item,
      installed: checkInstalled(
        item.name,
        item.type,
        provider,
        item.marketplaceRepo,
      ),
    }));
    return NextResponse.json(withInstalled);
  } catch (err) {
    apiLog.error("marketplace search failed", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
