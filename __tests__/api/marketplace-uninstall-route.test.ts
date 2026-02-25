import { beforeEach, describe, expect, it, vi } from "vitest";

const getMarketplaceInstallNameCandidatesMock = vi.fn(
  (name: string) => [name],
);
const findMarketplacePluginEntryMock = vi.fn();
const removeMarketplacePluginEntryMock = vi.fn();
const removeMarketplacePluginComponentReferencesMock = vi.fn();
const removeAgentForProviderMock = vi.fn();
const removeMcpForProviderMock = vi.fn();
const removeSkillEntryForProviderMock = vi.fn();
const parseGitHubUrlMock = vi.fn();
const discoverRepoMock = vi.fn();
const invalidateMarketplaceCacheMock = vi.fn();
const fullScanMock = vi.fn();

vi.mock("@/lib/marketplace/install-names", () => ({
  getMarketplaceInstallNameCandidates: getMarketplaceInstallNameCandidatesMock,
}));

vi.mock("@/lib/marketplace/installed-plugins", () => ({
  findMarketplacePluginEntry: findMarketplacePluginEntryMock,
  removeMarketplacePluginEntry: removeMarketplacePluginEntryMock,
  removeMarketplacePluginComponentReferences:
    removeMarketplacePluginComponentReferencesMock,
}));

vi.mock("@/lib/marketplace/plugin-artifacts", () => ({
  normalizeTargetProvider: (value: unknown) =>
    value === "codex" || value === "gemini" ? value : "claude",
  removeAgentForProvider: removeAgentForProviderMock,
  removeMcpForProvider: removeMcpForProviderMock,
  removeSkillEntryForProvider: removeSkillEntryForProviderMock,
}));

vi.mock("@/lib/marketplace/repo-tree", () => ({
  parseGitHubUrl: parseGitHubUrlMock,
  discoverRepo: discoverRepoMock,
}));

vi.mock("@/app/api/marketplace/search/route", () => ({
  invalidateMarketplaceCache: invalidateMarketplaceCacheMock,
}));

vi.mock("@/lib/instructions/indexer", () => ({
  fullScan: fullScanMock,
}));

vi.mock("@/lib/claude-settings", () => ({
  readSettings: vi.fn(() => ({})),
  writeSettings: vi.fn(),
}));

describe("POST /api/marketplace/uninstall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeMarketplacePluginEntryMock.mockReturnValue(true);
  });

  it("removes tracked marketplace-plugin artifacts for the target provider", async () => {
    findMarketplacePluginEntryMock.mockReturnValue({
      key: "codex:database-design@agents",
      record: {
        agents: ["database-architect.md"],
        skills: ["postgresql"],
        commands: ["sql-pro"],
        mcpServers: ["db-mcp"],
        disabled: false,
      },
    });
    removeAgentForProviderMock.mockReturnValue(true);
    removeSkillEntryForProviderMock.mockReturnValue(true);
    removeMcpForProviderMock.mockReturnValue(true);

    const { POST } = await import("@/app/api/marketplace/uninstall/route");
    const req = new Request("http://localhost/api/marketplace/uninstall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "database-design",
        targetProvider: "codex",
        marketplaceRepo: "wshobson/agents",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(removeAgentForProviderMock).toHaveBeenCalledWith(
      "codex",
      "database-architect",
    );
    expect(removeSkillEntryForProviderMock).toHaveBeenCalledWith(
      "codex",
      "postgresql",
    );
    expect(removeSkillEntryForProviderMock).toHaveBeenCalledWith(
      "codex",
      "sql-pro",
    );
    expect(removeMcpForProviderMock).toHaveBeenCalledWith("codex", "db-mcp");
    expect(parseGitHubUrlMock).not.toHaveBeenCalled();
    expect(discoverRepoMock).not.toHaveBeenCalled();
    expect(removeMarketplacePluginEntryMock).toHaveBeenCalledWith({
      name: "database-design",
      targetProvider: "codex",
      marketplaceRepo: "wshobson/agents",
    });
    expect(fullScanMock).toHaveBeenCalled();
    expect(invalidateMarketplaceCacheMock).toHaveBeenCalled();
  });

  it("falls back to repo discovery when registry tracking is missing", async () => {
    findMarketplacePluginEntryMock.mockReturnValue(null);
    parseGitHubUrlMock.mockReturnValue({
      owner: "wshobson",
      repo: "agents",
      branch: "main",
      subpath: "plugins/database-design",
    });
    discoverRepoMock.mockResolvedValue({
      components: [
        {
          kind: "agent",
          name: "database-architect",
          primaryPath: "plugins/database-design/agents/database-architect.md",
          relatedPaths: [],
          contextDir: "plugins/database-design",
        },
        {
          kind: "skill",
          name: "postgresql",
          primaryPath: "plugins/database-design/skills/postgresql/SKILL.md",
          relatedPaths: [],
          contextDir: "plugins/database-design",
        },
        {
          kind: "command",
          name: "sql-pro",
          primaryPath: "plugins/database-design/commands/sql-pro.md",
          relatedPaths: [],
          contextDir: "plugins/database-design",
        },
        {
          kind: "mcp-server",
          name: "db-mcp",
          primaryPath: "plugins/database-design/package.json",
          relatedPaths: [],
          contextDir: "plugins/database-design",
        },
        {
          kind: "agent",
          name: "out-of-scope",
          primaryPath: "plugins/other/agents/out-of-scope.md",
          relatedPaths: [],
          contextDir: "plugins/other",
        },
      ],
      tree: [],
      hasManifest: true,
    });
    removeAgentForProviderMock.mockReturnValue(true);
    removeSkillEntryForProviderMock.mockReturnValue(true);
    removeMcpForProviderMock.mockReturnValue(true);

    const { POST } = await import("@/app/api/marketplace/uninstall/route");
    const req = new Request("http://localhost/api/marketplace/uninstall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "database-design",
        targetProvider: "claude",
        marketplaceRepo: "wshobson/agents",
        url: "https://github.com/wshobson/agents/tree/main/plugins/database-design",
        sourcePath: "./plugins/database-design",
        defaultBranch: "main",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(discoverRepoMock).toHaveBeenCalledWith("wshobson", "agents", "main");
    expect(removeAgentForProviderMock).toHaveBeenCalledWith(
      "claude",
      "database-architect",
    );
    expect(removeAgentForProviderMock).not.toHaveBeenCalledWith(
      "claude",
      "out-of-scope",
    );
    expect(removeSkillEntryForProviderMock).toHaveBeenCalledWith(
      "claude",
      "postgresql",
    );
    expect(removeSkillEntryForProviderMock).toHaveBeenCalledWith(
      "claude",
      "sql-pro",
    );
    expect(removeMcpForProviderMock).toHaveBeenCalledWith("claude", "db-mcp");
    expect(removeMcpForProviderMock).toHaveBeenCalledWith(
      "claude",
      "database-design",
    );
    expect(removeMarketplacePluginEntryMock).toHaveBeenCalledWith({
      name: "database-design",
      targetProvider: "claude",
      marketplaceRepo: "wshobson/agents",
    });
    expect(fullScanMock).toHaveBeenCalled();
    expect(invalidateMarketplaceCacheMock).toHaveBeenCalled();
  });
});
