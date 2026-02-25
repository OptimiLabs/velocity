import { apiLog } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/marketplace/fetch-utils";
import { parseReadmeForItems } from "@/lib/marketplace/readme-parser";
import {
  discoverComponents,
  fetchRepoTree,
  type DiscoveredComponent,
  type TreeEntry,
} from "@/lib/marketplace/repo-tree";
import {
  estimateTokensFromBytes,
  estimateTokensFromText,
  estimateTokensFromUnknown,
} from "@/lib/marketplace/token-estimate";
import type {
  ComponentDescriptor,
  ComponentKind,
  SecuritySignals,
} from "@/types/marketplace";

const RAW_FETCH_TIMEOUT = 8_000;
const DESCRIPTION_FETCH_TIMEOUT = 2_500;
const DESCRIPTION_FETCH_LIMIT = 12;
const README_MAX_CHARS = 30_000;

function normalizeSourcePath(sourcePath?: string | null): string | null {
  if (!sourcePath) return null;
  const cleaned = sourcePath.replace(/^\.\//, "").replace(/\/$/, "");
  if (!cleaned || cleaned === ".") return null;
  return cleaned;
}

function buildRawUrl(
  owner: string,
  repo: string,
  branch: string,
  path: string,
) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
}

function buildGithubUrl(
  owner: string,
  repo: string,
  branch: string,
  path: string,
) {
  return `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
}

function extractFrontmatterDescription(markdown: string): string | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    if (key !== "description") continue;
    const raw = line.slice(idx + 1).trim();
    return raw.replace(/^['"]|['"]$/g, "");
  }
  return null;
}

function extractDescription(markdown: string): string {
  const frontmatterDesc = extractFrontmatterDescription(markdown);
  if (frontmatterDesc) return frontmatterDesc;
  const lines = markdown.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---"))
      continue;
    return trimmed.length > 200 ? trimmed.slice(0, 197) + "..." : trimmed;
  }
  return "";
}

function withinSourcePath(
  component: DiscoveredComponent,
  sourcePath?: string | null,
): boolean {
  const normalized = normalizeSourcePath(sourcePath);
  if (!normalized) return true;
  return (
    component.contextDir === normalized ||
    component.contextDir.startsWith(normalized + "/")
  );
}

function isLikelyMcpPath(path: string): boolean {
  const lower = path.toLowerCase();
  if (!lower.endsWith("package.json")) return false;
  return (
    lower.includes("/mcp") ||
    lower.includes("mcp-") ||
    lower.includes("/server") ||
    lower.includes("mcpserver")
  );
}

function isLikelyMcpPackage(pkg: Record<string, unknown>): boolean {
  const name = String(pkg.name || "").toLowerCase();
  const keywords = Array.isArray(pkg.keywords) ? pkg.keywords : [];
  const hasBin = !!pkg.bin;
  const deps = {
    ...(pkg.dependencies as Record<string, string> | undefined),
    ...(pkg.devDependencies as Record<string, string> | undefined),
  };
  const depKeys = Object.keys(deps || {});
  const keywordHit = keywords.some((k) =>
    String(k).toLowerCase().includes("mcp"),
  );
  const nameHit =
    name.includes("mcp") || name.includes("model-context-protocol");
  const depHit = depKeys.some((k) =>
    k.includes("modelcontextprotocol") || k.includes("mcp"),
  );
  return hasBin && (keywordHit || nameHit || depHit);
}

async function fetchText(
  url: string,
  timeoutMs = RAW_FETCH_TIMEOUT,
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchJson(
  url: string,
  timeoutMs = RAW_FETCH_TIMEOUT,
): Promise<Record<string, unknown> | null> {
  const text = await fetchText(url, timeoutMs);
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchRepoTreeWithBranch(
  owner: string,
  repo: string,
  preferredBranch?: string,
): Promise<{ tree: TreeEntry[]; branch: string } | null> {
  const result = await fetchRepoTree(owner, repo, preferredBranch || "main");
  if (!result) return null;
  return { tree: result.tree, branch: result.branch };
}

export async function fetchReadme(
  owner: string,
  repo: string,
  branch: string,
  sourcePath?: string | null,
): Promise<string | null> {
  const normalized = normalizeSourcePath(sourcePath);
  const candidates = normalized
    ? [
        buildRawUrl(owner, repo, branch, `${normalized}/README.md`),
        buildRawUrl(owner, repo, branch, "README.md"),
      ]
    : [buildRawUrl(owner, repo, branch, "README.md")];
  for (const url of candidates) {
    const text = await fetchText(url);
    if (text && text.trim()) {
      return text.length > README_MAX_CHARS
        ? text.slice(0, README_MAX_CHARS) + "\n\n[...truncated]"
        : text;
    }
  }
  return null;
}

export interface RepoComponentSummary {
  repo: { owner: string; name: string; defaultBranch: string };
  components: DiscoveredComponent[];
  mcpPackage?: {
    name: string;
    description?: string;
    installConfig?: { command: string; args: string[] };
    primaryPath: string;
  };
  readmeMcpItems?: ReturnType<typeof parseReadmeForItems>;
}

export async function summarizeRepoComponents(
  owner: string,
  repo: string,
  preferredBranch?: string,
): Promise<RepoComponentSummary | null> {
  const treeResult = await fetchRepoTreeWithBranch(owner, repo, preferredBranch);
  if (!treeResult) return null;
  const { tree, branch } = treeResult;
  const components = discoverComponents(tree);
  const core = components.filter((c) => c.kind !== "mcp-server");

  let mcpPackage:
    | {
        name: string;
        description?: string;
        installConfig?: { command: string; args: string[] };
        primaryPath: string;
      }
    | undefined;

  if (core.length === 0) {
    const candidate =
      components.find((c) => c.kind === "mcp-server" && isLikelyMcpPath(c.primaryPath)) ||
      components.find((c) => c.kind === "mcp-server");
    if (candidate) {
      const pkgUrl = buildRawUrl(owner, repo, branch, candidate.primaryPath);
      const pkg = await fetchJson(pkgUrl);
      if (pkg && isLikelyMcpPackage(pkg)) {
        const pkgName = String(pkg.name || candidate.name || "mcp-server");
        const installName = pkgName;
        mcpPackage = {
          name: pkgName.replace(/^@[^/]+\//, ""),
          description: String(pkg.description || ""),
          installConfig: { command: "npx", args: ["-y", installName] },
          primaryPath: candidate.primaryPath,
        };
      }
    }
  }

  let readmeMcpItems: ReturnType<typeof parseReadmeForItems> | undefined;
  if (core.length === 0 && !mcpPackage) {
    const readme = await fetchReadme(owner, repo, branch);
    if (readme) {
      const parsed = parseReadmeForItems(readme);
      if (parsed.length > 0) readmeMcpItems = parsed;
    }
  }

  return {
    repo: { owner, name: repo, defaultBranch: branch },
    components,
    mcpPackage,
    readmeMcpItems,
  };
}

function toComponentDescriptor(
  component: DiscoveredComponent,
  owner: string,
  repo: string,
  branch: string,
): ComponentDescriptor {
  return {
    id: `${component.kind}:${component.primaryPath}`,
    kind: component.kind as ComponentKind,
    name: component.name,
    primaryPath: component.primaryPath,
    contextDir: component.contextDir,
    downloadUrl: buildRawUrl(owner, repo, branch, component.primaryPath),
    githubUrl: buildGithubUrl(owner, repo, branch, component.primaryPath),
  };
}

function computeOverallRisk(findings: SecuritySignals["findings"]): SecuritySignals["overallRisk"] {
  const rank = { low: 1, medium: 2, high: 3 };
  let max = 1;
  for (const f of findings) {
    const r = rank[f.severity] || 1;
    if (r > max) max = r;
  }
  return max === 3 ? "high" : max === 2 ? "medium" : "low";
}

export function computeStaticSecuritySignals(
  tree: TreeEntry[],
  readme: string | null,
  packageJsons: Record<string, unknown>[],
): SecuritySignals {
  const findings: SecuritySignals["findings"] = [];
  const paths = new Set(tree.map((t) => t.path.toLowerCase()));

  const addFinding = (
    severity: "low" | "medium" | "high",
    category: SecuritySignals["findings"][number]["category"],
    title: string,
    detail: string,
    evidence?: string,
  ) => {
    findings.push({ severity, category, title, detail, evidence });
  };

  if (paths.has("install.sh") || paths.has("setup.sh") || paths.has("bootstrap.sh")) {
    addFinding(
      "medium",
      "code-execution",
      "Installer script present",
      "Repo includes an install/setup script that may run system commands.",
      "install.sh / setup.sh / bootstrap.sh",
    );
  }

  if (paths.has("makefile")) {
    addFinding(
      "low",
      "code-execution",
      "Makefile present",
      "Makefiles can run arbitrary shell commands during setup.",
      "Makefile",
    );
  }

  if (readme) {
    const lower = readme.toLowerCase();
    if (lower.includes("curl") && lower.includes("|") && lower.includes("bash")) {
      addFinding(
        "high",
        "code-execution",
        "Curl pipe to shell",
        "README suggests piping curl output to a shell.",
        "curl | bash",
      );
    } else if (lower.includes("wget") && lower.includes("|") && lower.includes("sh")) {
      addFinding(
        "high",
        "code-execution",
        "Wget pipe to shell",
        "README suggests piping wget output to a shell.",
        "wget | sh",
      );
    }
    if (lower.includes("sudo ")) {
      addFinding(
        "medium",
        "permission-escalation",
        "Sudo instructions",
        "README includes sudo usage during install or setup.",
        "sudo",
      );
    }
  }

  for (const pkg of packageJsons) {
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    for (const hook of ["preinstall", "install", "postinstall"]) {
      const cmd = scripts[hook];
      if (!cmd) continue;
      const lower = cmd.toLowerCase();
      const hasRemote =
        lower.includes("curl ") ||
        lower.includes("wget ") ||
        lower.includes("powershell ");
      const hasSudo = lower.includes("sudo ");
      addFinding(
        hasRemote || hasSudo ? "high" : "medium",
        hasSudo ? "permission-escalation" : "code-execution",
        `Runs ${hook} script`,
        "Package includes install-time scripts that execute shell commands.",
        cmd,
      );
    }
  }

  const overallRisk = computeOverallRisk(findings);
  const summary =
    findings.length === 0
      ? "No obvious risks detected in static checks (no AI analysis)."
      : `Static checks flagged ${findings.length} potential issue${findings.length === 1 ? "" : "s"} (no AI analysis).`;

  return { overallRisk, findings, summary };
}

export async function resolveRepoComponents(options: {
  owner: string;
  repo: string;
  branch: string;
  tree: TreeEntry[];
  sourcePath?: string | null;
  includeDescriptions?: boolean;
  includeReadme?: boolean;
  includeReadmeFallback?: boolean;
  includePackageJsons?: boolean;
}): Promise<{
  components: ComponentDescriptor[];
  readme?: string;
  packageJsons: Record<string, unknown>[];
}> {
  const {
    owner,
    repo,
    branch,
    tree,
    sourcePath,
    includeDescriptions = false,
    includeReadme = false,
    includeReadmeFallback = false,
    includePackageJsons = false,
  } = options;

  const candidates = discoverComponents(tree).filter((c) =>
    withinSourcePath(c, sourcePath),
  );

  const components: ComponentDescriptor[] = [];
  const mcpCandidates: DiscoveredComponent[] = [];
  const packageJsons: Record<string, unknown>[] = [];
  const sizeByPath = new Map<string, number>();

  for (const entry of tree) {
    if (entry.type !== "blob" || typeof entry.size !== "number") continue;
    sizeByPath.set(entry.path, entry.size);
  }

  for (const c of candidates) {
    if (c.kind === "mcp-server") {
      mcpCandidates.push(c);
    } else {
      const descriptor = toComponentDescriptor(c, owner, repo, branch);
      const size = sizeByPath.get(c.primaryPath);
      if (size && !descriptor.estimatedTokens) {
        descriptor.estimatedTokens = estimateTokensFromBytes(size);
      }
      components.push(descriptor);
    }
  }

  if (includeDescriptions && components.length > 0) {
    const markdownComponents = components
      .filter((comp) => comp.downloadUrl.endsWith(".md"))
      .slice(0, DESCRIPTION_FETCH_LIMIT);
    await Promise.all(
      markdownComponents.map(async (comp) => {
        const text = await fetchText(comp.downloadUrl, DESCRIPTION_FETCH_TIMEOUT);
        if (!text) return;
        comp.description = extractDescription(text);
        comp.estimatedTokens = estimateTokensFromText(text);
      }),
    );
  }

  const includeAllMcpCandidates = components.length === 0;
  const mcpResults = await Promise.all(
    mcpCandidates.map(async (candidate) => {
      if (!includeAllMcpCandidates && !isLikelyMcpPath(candidate.primaryPath)) {
        return null;
      }
      const pkgUrl = buildRawUrl(owner, repo, branch, candidate.primaryPath);
      const pkg = await fetchJson(pkgUrl);
      if (!pkg) return null;
      return { candidate, pkg, pkgUrl };
    }),
  );

  for (const result of mcpResults) {
    if (!result) continue;
    const { candidate, pkg, pkgUrl } = result;
    if (includePackageJsons) packageJsons.push(pkg);
    if (!isLikelyMcpPackage(pkg)) continue;
    const pkgName = String(pkg.name || candidate.name || "mcp-server");
    components.push({
      id: `mcp-server:${candidate.primaryPath}`,
      kind: "mcp-server",
      name: pkgName.replace(/^@[^/]+\//, ""),
      description: String(pkg.description || ""),
      primaryPath: candidate.primaryPath,
      contextDir: candidate.contextDir,
      downloadUrl: pkgUrl,
      githubUrl: buildGithubUrl(owner, repo, branch, candidate.primaryPath),
      installConfig: { command: "npx", args: ["-y", pkgName] },
      estimatedTokens: estimateTokensFromUnknown(pkg),
    });
  }

  let readme: string | null = null;
  if ((includeReadme || includeReadmeFallback) && components.length === 0) {
    readme = await fetchReadme(owner, repo, branch, sourcePath);
  }

  if (includeReadmeFallback && readme && components.length === 0) {
    const normalizedSourcePath = normalizeSourcePath(sourcePath);
    const readmePath = normalizedSourcePath
      ? `${normalizedSourcePath}/README.md`
      : "README.md";
    const readmeContext = normalizedSourcePath || ".";
    const readmeRawUrl = buildRawUrl(owner, repo, branch, readmePath);
    const readmeGitHubUrl = buildGithubUrl(owner, repo, branch, readmePath);
    const parsed = parseReadmeForItems(readme);
    for (const item of parsed) {
      components.push({
        id: `readme:${item.name}`,
        kind: "mcp-server",
        name: item.name,
        description: item.description,
        primaryPath: readmePath,
        contextDir: readmeContext,
        downloadUrl: readmeRawUrl,
        githubUrl: readmeGitHubUrl,
        installConfig: item.installConfig,
        estimatedTokens: estimateTokensFromUnknown({
          name: item.name,
          description: item.description,
          installConfig: item.installConfig,
        }),
      });
    }
  }

  if (includeReadme && readme === null) {
    readme = await fetchReadme(owner, repo, branch, sourcePath);
  }

  if (includePackageJsons && !packageJsons.length) {
    const rootPackage =
      tree.find((t) => t.type === "blob" && t.path === "package.json") || null;
    if (rootPackage) {
      const pkgUrl = buildRawUrl(owner, repo, branch, rootPackage.path);
      const pkg = await fetchJson(pkgUrl);
      if (pkg) packageJsons.push(pkg);
    }
  }

  if ((includeReadme || includeReadmeFallback) && components.length === 0 && !readme) {
    apiLog.debug("readme not found", { owner, repo, sourcePath });
  }

  return {
    components,
    readme: readme || undefined,
    packageJsons,
  };
}
