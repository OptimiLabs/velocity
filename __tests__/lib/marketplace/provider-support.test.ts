import { describe, expect, it } from "vitest";
import {
  getMarketplaceProviderLabel,
  getMarketplaceProviderSupportLabel,
  getSupportedProvidersForMarketplaceType,
} from "@/lib/marketplace/provider-support";

describe("marketplace provider support", () => {
  it("keeps MCP servers available across providers", () => {
    expect(getSupportedProvidersForMarketplaceType("mcp-server")).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
    expect(getMarketplaceProviderSupportLabel("mcp-server")).toBe(
      "All providers",
    );
  });

  it("keeps skills available across providers", () => {
    expect(getSupportedProvidersForMarketplaceType("skill")).toEqual([
      "claude",
      "codex",
      "gemini",
    ]);
  });

  it("returns readable provider labels", () => {
    expect(getMarketplaceProviderLabel("claude")).toBe("Claude");
    expect(getMarketplaceProviderLabel("codex")).toBe("Codex");
    expect(getMarketplaceProviderLabel("gemini")).toBe("Gemini");
  });
});
