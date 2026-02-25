export type SourceType =
  | "github_search"
  | "github_org"
  | "github_repo"
  | "registry";

export interface ParsedSource {
  source_type: SourceType;
  config: Record<string, string>;
  suggestedName: string;
}

/**
 * Auto-detects marketplace source type from user input.
 *
 * Supported formats:
 *   https://github.com/anthropics          → github_org
 *   https://github.com/anthropics/claude   → github_repo
 *   github.com/anthropics                  → github_org
 *   anthropics/claude-code                 → github_repo
 *   anthropics                             → github_org
 *   search:mcp-server  / topic:claude-code → github_search
 *   https://registry.example.com/items.json→ registry
 */
export function parseSourceInput(input: string): ParsedSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Explicit search/topic prefix
  const searchMatch = trimmed.match(/^(?:search|topic):(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    return {
      source_type: "github_search",
      config: { query },
      suggestedName: `Search: ${query}`,
    };
  }

  // 2. Full URL — GitHub or registry
  try {
    const urlStr = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const url = new URL(urlStr);

    if (url.hostname === "github.com" || url.hostname === "www.github.com") {
      const parts = url.pathname
        .replace(/^\/|\/$/g, "")
        .split("/")
        .filter(Boolean);
      if (parts.length >= 2) {
        const repo = `${parts[0]}/${parts[1]}`;
        return {
          source_type: "github_repo",
          config: { repo },
          suggestedName: `GitHub: ${repo}`,
        };
      }
      if (parts.length === 1) {
        return {
          source_type: "github_org",
          config: { org: parts[0] },
          suggestedName: `GitHub: ${parts[0]}`,
        };
      }
      return null;
    }

    // Non-GitHub URL with a hostname → registry
    if (url.hostname) {
      return {
        source_type: "registry",
        config: { url: url.toString() },
        suggestedName: `Registry: ${url.hostname}`,
      };
    }
  } catch {
    // Not a valid URL — continue to slug matching
  }

  // 3. owner/repo slug (contains exactly one slash, no spaces, no dots suggesting a hostname)
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)) {
    return {
      source_type: "github_repo",
      config: { repo: trimmed },
      suggestedName: `GitHub: ${trimmed}`,
    };
  }

  // 4. Bare name with a dot that looks like a domain (e.g. github.com/anthropics without https)
  // Already handled by URL parsing above via prepending https://

  // 5. Single word/org name
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return {
      source_type: "github_org",
      config: { org: trimmed },
      suggestedName: `GitHub: ${trimmed}`,
    };
  }

  return null;
}
