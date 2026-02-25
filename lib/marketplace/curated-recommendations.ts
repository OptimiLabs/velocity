import type { MarketplaceItem } from "@/types/marketplace";

type CuratedItemSeed = Pick<
  MarketplaceItem,
  | "name"
  | "description"
  | "type"
  | "author"
  | "url"
  | "marketplaceRepo"
  | "repo"
>;

const CURATED_SOURCE_ID = "curated-open-source";

/**
 * Curated, open-source GitHub recommendations that are installable
 * through the existing marketplace install flow.
 */
const CURATED_OPEN_SOURCE_ITEMS: CuratedItemSeed[] = [
  {
    name: "context7",
    description:
      "MIT-licensed Context7 MCP server for version-aware docs and code examples.",
    type: "marketplace-plugin",
    author: "upstash",
    url: "https://github.com/upstash/context7",
    marketplaceRepo: "upstash/context7",
    repo: { owner: "upstash", name: "context7" },
  },
  {
    name: "github-mcp-server",
    description:
      "MIT-licensed official GitHub MCP server for repo operations, issues, and PR workflows.",
    type: "marketplace-plugin",
    author: "github",
    url: "https://github.com/github/github-mcp-server",
    marketplaceRepo: "github/github-mcp-server",
    repo: { owner: "github", name: "github-mcp-server" },
  },
  {
    name: "servers",
    description:
      "MIT-licensed Model Context Protocol reference server collection maintained by MCP.",
    type: "marketplace-plugin",
    author: "modelcontextprotocol",
    url: "https://github.com/modelcontextprotocol/servers",
    marketplaceRepo: "modelcontextprotocol/servers",
    repo: { owner: "modelcontextprotocol", name: "servers" },
  },
  {
    name: "agents",
    description:
      "MIT-licensed Claude agent/skill library with practical production workflows.",
    type: "marketplace-plugin",
    author: "wshobson",
    url: "https://github.com/wshobson/agents",
    marketplaceRepo: "wshobson/agents",
    repo: { owner: "wshobson", name: "agents" },
  },
  {
    name: "claude-flow",
    description:
      "MIT-licensed multi-agent Claude workflow framework with MCP-powered orchestration.",
    type: "marketplace-plugin",
    author: "ruvnet",
    url: "https://github.com/ruvnet/claude-flow",
    marketplaceRepo: "ruvnet/claude-flow",
    repo: { owner: "ruvnet", name: "claude-flow" },
  },
  {
    name: "claude-skills",
    description:
      "MIT-licensed community skill pack for Claude Code with reusable templates.",
    type: "marketplace-plugin",
    author: "alirezarezvani",
    url: "https://github.com/alirezarezvani/claude-skills",
    marketplaceRepo: "alirezarezvani/claude-skills",
    repo: { owner: "alirezarezvani", name: "claude-skills" },
  },
];

function matchesQuery(item: CuratedItemSeed, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = `${item.name} ${item.description} ${item.author} ${item.url}`.toLowerCase();
  return haystack.includes(q);
}

export function getCuratedMarketplaceRecommendations(
  query: string,
  typeFilter: string,
): MarketplaceItem[] {
  return CURATED_OPEN_SOURCE_ITEMS.filter((item) => {
    if (typeFilter && item.type !== typeFilter) return false;
    return matchesQuery(item, query);
  }).map((item) => ({
    ...item,
    installed: false,
    sourceId: CURATED_SOURCE_ID,
    recommended: true,
  }));
}
