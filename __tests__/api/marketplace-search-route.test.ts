import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceItem } from "@/types/marketplace";

const summarizeRepoComponentsMock = vi.fn();

vi.mock("@/lib/marketplace/discovery", () => ({
  summarizeRepoComponents: summarizeRepoComponentsMock,
}));

function makeItem(overrides: Partial<MarketplaceItem>): MarketplaceItem {
  return {
    name: "package",
    description: "desc",
    type: "marketplace-plugin",
    author: "author",
    url: "https://github.com/acme/package",
    installed: false,
    sourceId: "source-a",
    ...overrides,
  };
}

describe("marketplace search dedupe/enrichment helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    summarizeRepoComponentsMock.mockReset();
  });

  it("dedupes marketplace-plugin rows by repository + sourcePath", async () => {
    const { dedupeMarketplaceItems } = await import(
      "@/app/api/marketplace/search/route"
    );

    const deduped = dedupeMarketplaceItems([
      makeItem({
        name: "claude-flow",
        repo: { owner: "ruvnet", name: "claude-flow" },
        defaultBranch: "main",
        components: { agents: 0, skills: 2, commands: 0 },
        componentSelectionSupported: false,
      }),
      makeItem({
        name: "claude-flow-plugin",
        repo: { owner: "ruvnet", name: "claude-flow" },
        defaultBranch: "main",
        sourceId: "source-b",
        recommended: true,
        components: { agents: 10, skills: 12, commands: 5 },
        componentSelectionSupported: true,
      }),
    ]);

    expect(deduped).toHaveLength(1);
    expect(deduped[0]).toMatchObject({
      repo: { owner: "ruvnet", name: "claude-flow" },
      recommended: true,
      componentSelectionSupported: true,
      components: { agents: 10, skills: 12, commands: 5 },
    });
  });

  it("enriches recommended package counts when missing", async () => {
    summarizeRepoComponentsMock.mockResolvedValue({
      repo: { owner: "ruvnet", name: "claude-flow", defaultBranch: "main" },
      components: [
        { kind: "agent" },
        { kind: "agent" },
        { kind: "skill" },
        { kind: "command" },
      ],
    });

    const { enrichRecommendedComponentCounts } = await import(
      "@/app/api/marketplace/search/route"
    );

    const [enriched] = await enrichRecommendedComponentCounts([
      makeItem({
        name: "claude-flow",
        recommended: true,
        repo: { owner: "ruvnet", name: "claude-flow" },
      }),
    ]);

    expect(summarizeRepoComponentsMock).toHaveBeenCalledWith(
      "ruvnet",
      "claude-flow",
      undefined,
    );
    expect(enriched).toMatchObject({
      componentSelectionSupported: true,
      defaultBranch: "main",
      components: { agents: 2, skills: 1, commands: 1 },
    });
  });
});
