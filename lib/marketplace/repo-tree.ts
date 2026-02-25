// --- Types ---

export interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

export type ComponentKind =
  | "skill"
  | "command"
  | "agent"
  | "mcp-server"
  | "plugin";

export interface DiscoveredComponent {
  kind: ComponentKind;
  name: string;
  primaryPath: string;
  relatedPaths: string[];
  contextDir: string;
}

export interface RepoDiscoveryResult {
  components: DiscoveredComponent[];
  tree: TreeEntry[];
  hasManifest: boolean;
}

export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  branch: string;
  subpath: string;
}

// --- GitHub headers (same pattern as search route) ---

const GITHUB_HEADERS: Record<string, string> = {
  Accept: "application/vnd.github.v3+json",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
    : {}),
};

// --- URL parser ---

/**
 * Parse a GitHub URL into its component parts.
 * Handles:
 *   github.com/owner/repo
 *   github.com/owner/repo/tree/branch/sub/path
 *   github.com/owner/repo/blob/branch/file
 *   raw.githubusercontent.com/owner/repo/branch/path
 */
export function parseGitHubUrl(url: string): ParsedGitHubUrl | null {
  let cleaned = url.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // raw.githubusercontent.com/owner/repo/branch/path
  const rawMatch = cleaned.match(
    /^raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)(?:\/(.*))?$/,
  );
  if (rawMatch) {
    return {
      owner: rawMatch[1],
      repo: rawMatch[2],
      branch: rawMatch[3],
      subpath: rawMatch[4] || "",
    };
  }

  // github.com/owner/repo[/tree|blob/branch[/subpath]]
  cleaned = cleaned.replace(/^github\.com\//, "");
  const treeBlobMatch = cleaned.match(
    /^([^/]+)\/([^/]+)\/(?:tree|blob)\/([^/]+)(?:\/(.*))?$/,
  );
  if (treeBlobMatch) {
    return {
      owner: treeBlobMatch[1],
      repo: treeBlobMatch[2],
      branch: treeBlobMatch[3],
      subpath: (treeBlobMatch[4] || "").replace(/\/$/, ""),
    };
  }

  // Plain: owner/repo
  const plainMatch = cleaned.match(/^([^/]+)\/([^/]+)$/);
  if (plainMatch) {
    return {
      owner: plainMatch[1],
      repo: plainMatch[2].replace(/\.git$/, ""),
      branch: "main",
      subpath: "",
    };
  }

  return null;
}

// --- Tree fetcher ---

/**
 * Fetch the full recursive tree for a repo in a single API call.
 * Falls back from `main` to `master` on 404.
 */
export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch = "main",
): Promise<{ tree: TreeEntry[]; branch: string } | null> {
  const normalizeTree = (payload: unknown): TreeEntry[] => {
    if (
      !payload ||
      typeof payload !== "object" ||
      !("tree" in payload) ||
      !Array.isArray((payload as { tree?: unknown }).tree)
    ) {
      return [];
    }

    const normalized: TreeEntry[] = [];
    for (const entry of (payload as { tree: Array<Record<string, unknown>> })
      .tree) {
      const path = typeof entry.path === "string" ? entry.path : "";
      if (!path) continue;
      const type = entry.type === "tree" ? "tree" : "blob";
      const size =
        typeof entry.size === "number" && Number.isFinite(entry.size)
          ? entry.size
          : undefined;
      const normalizedEntry: TreeEntry = { path, type };
      if (size !== undefined) {
        normalizedEntry.size = size;
      }
      normalized.push(normalizedEntry);
    }
    return normalized;
  };

  const base = `https://api.github.com/repos/${owner}/${repo}/git/trees`;

  const res = await fetch(`${base}/${branch}?recursive=1`, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (res.ok) {
    const data = await res.json();
    return { tree: normalizeTree(data), branch };
  }

  // 404 on main → retry with master
  if (res.status === 404 && branch === "main") {
    const res2 = await fetch(`${base}/master?recursive=1`, {
      headers: GITHUB_HEADERS,
      signal: AbortSignal.timeout(15_000),
    });
    if (res2.ok) {
      const data = await res2.json();
      return { tree: normalizeTree(data), branch: "master" };
    }
  }

  return null;
}

// --- BFS discovery ---

/**
 * Single-pass scan over the tree to discover installable components.
 * Pattern rules (priority order):
 *   SKILL.md                        → skill (parent dir name)
 *   agents/*.md                     → agent (filename)
 *   skills/*.md                     → skill (filename)
 *   commands/*.md                   → command (filename)
 *   .claude-plugin/plugin.json      → plugin (parent dir name)
 *   package.json                    → mcp-server tentative (parent dir name)
 */
export function discoverComponents(tree: TreeEntry[]): DiscoveredComponent[] {
  const seen = new Set<string>();
  const components: DiscoveredComponent[] = [];

  function add(c: DiscoveredComponent) {
    if (seen.has(c.primaryPath)) return;
    seen.add(c.primaryPath);
    components.push(c);
  }

  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const p = entry.path;
    const parts = p.split("/");
    const filename = parts[parts.length - 1];

    // SKILL.md → skill (but not root README.md)
    if (filename === "SKILL.md") {
      const parentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
      const name = parts.length > 1 ? parts[parts.length - 2] : "skill";
      add({
        kind: "skill",
        name,
        primaryPath: p,
        relatedPaths: [p],
        contextDir: parentDir,
      });
      continue;
    }

    // agents/*.md
    if (
      parts.length >= 2 &&
      parts[parts.length - 2] === "agents" &&
      filename.endsWith(".md")
    ) {
      const contextDir = parts.length > 2 ? parts.slice(0, -2).join("/") : ".";
      add({
        kind: "agent",
        name: filename.replace(/\.md$/, ""),
        primaryPath: p,
        relatedPaths: [p],
        contextDir,
      });
      continue;
    }

    // skills/*.md
    if (
      parts.length >= 2 &&
      parts[parts.length - 2] === "skills" &&
      filename.endsWith(".md")
    ) {
      const contextDir = parts.length > 2 ? parts.slice(0, -2).join("/") : ".";
      add({
        kind: "skill",
        name: filename.replace(/\.md$/, ""),
        primaryPath: p,
        relatedPaths: [p],
        contextDir,
      });
      continue;
    }

    // commands/*.md (legacy — install as skill, but classify as command)
    if (
      parts.length >= 2 &&
      parts[parts.length - 2] === "commands" &&
      filename.endsWith(".md")
    ) {
      const contextDir = parts.length > 2 ? parts.slice(0, -2).join("/") : ".";
      add({
        kind: "command",
        name: filename.replace(/\.md$/, ""),
        primaryPath: p,
        relatedPaths: [p],
        contextDir,
      });
      continue;
    }

    // .claude-plugin/plugin.json
    if (
      parts.length >= 2 &&
      parts[parts.length - 2] === ".claude-plugin" &&
      filename === "plugin.json"
    ) {
      const contextDir = parts.length > 2 ? parts.slice(0, -2).join("/") : ".";
      const name = parts.length > 2 ? parts[parts.length - 3] : "plugin";
      add({
        kind: "plugin",
        name,
        primaryPath: p,
        relatedPaths: [p],
        contextDir,
      });
      continue;
    }

    // package.json → tentative mcp-server
    if (filename === "package.json") {
      const parentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
      const name = parts.length > 1 ? parts[parts.length - 2] : "server";
      add({
        kind: "mcp-server",
        name,
        primaryPath: p,
        relatedPaths: [p],
        contextDir: parentDir,
      });
      continue;
    }
  }

  return components;
}

// --- Orchestrator ---

export async function discoverRepo(
  owner: string,
  repo: string,
  branch = "main",
): Promise<RepoDiscoveryResult | null> {
  const result = await fetchRepoTree(owner, repo, branch);
  if (!result) return null;

  const components = discoverComponents(result.tree);
  const hasManifest = result.tree.some(
    (e) => e.type === "blob" && e.path.endsWith(".claude-plugin/plugin.json"),
  );

  return { components, tree: result.tree, hasManifest };
}
