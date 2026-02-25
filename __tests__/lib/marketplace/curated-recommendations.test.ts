import { describe, expect, it } from "vitest";
import { getCuratedMarketplaceRecommendations } from "@/lib/marketplace/curated-recommendations";

describe("marketplace curated recommendations", () => {
  it("returns curated open-source recommendations by default", () => {
    const items = getCuratedMarketplaceRecommendations("", "");
    expect(items.length).toBeGreaterThanOrEqual(5);
    expect(items.every((item) => item.recommended)).toBe(true);
    expect(items.every((item) => item.url.startsWith("https://github.com/"))).toBe(
      true,
    );
  });

  it("supports query filtering", () => {
    const items = getCuratedMarketplaceRecommendations("context7", "");
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.some(
        (item) =>
          item.name.toLowerCase().includes("context7") ||
          item.url.toLowerCase().includes("context7"),
      ),
    ).toBe(true);
  });

  it("supports type filtering", () => {
    const pluginItems = getCuratedMarketplaceRecommendations(
      "",
      "marketplace-plugin",
    );
    expect(pluginItems.length).toBeGreaterThan(0);
    expect(
      pluginItems.every((item) => item.type === "marketplace-plugin"),
    ).toBe(true);

    const hooks = getCuratedMarketplaceRecommendations("", "hook");
    expect(hooks).toEqual([]);
  });
});
