import type { MarketplaceItem } from "@/types/marketplace";
import type { ConfigProvider } from "@/types/provider";

const ALL_PROVIDERS: readonly ConfigProvider[] = ["claude", "codex", "gemini"];
const CLAUDE_ONLY_PROVIDERS: readonly ConfigProvider[] = ["claude"];

export function getSupportedProvidersForMarketplaceType(
  type: MarketplaceItem["type"],
): readonly ConfigProvider[] {
  switch (type) {
    case "hook":
    case "statusline":
      return CLAUDE_ONLY_PROVIDERS;
    case "mcp-server":
    case "plugin":
    case "marketplace-plugin":
    case "skill":
    case "agent":
    case "unclassified":
    default:
      return ALL_PROVIDERS;
  }
}

export function isMarketplaceTypeSupportedForProvider(
  type: MarketplaceItem["type"],
  provider: ConfigProvider,
): boolean {
  return getSupportedProvidersForMarketplaceType(type).includes(provider);
}

export function getMarketplaceTypeLabel(type: MarketplaceItem["type"]): string {
  switch (type) {
    case "marketplace-plugin":
      return "Package";
    case "plugin":
      return "Plugin";
    case "mcp-server":
      return "MCP Server";
    case "hook":
      return "Hook";
    case "skill":
      return "Skill";
    case "agent":
      return "Agent";
    case "statusline":
      return "Statusline";
    default:
      return type;
  }
}

export function getMarketplaceProviderLabel(provider: ConfigProvider): string {
  if (provider === "codex") return "Codex";
  if (provider === "gemini") return "Gemini";
  return "Claude";
}

export function getMarketplaceProviderSupportLabel(
  type: MarketplaceItem["type"],
): string {
  const supported = getSupportedProvidersForMarketplaceType(type);
  if (supported.length === 1) {
    return `${getMarketplaceProviderLabel(supported[0])} only`;
  }
  return "All providers";
}
