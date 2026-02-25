import { beforeEach, describe, expect, it, vi } from "vitest";

const getMarketplaceInstallNameCandidatesMock = vi.fn(
  (name: string) => [name],
);
const findMarketplacePluginEntryMock = vi.fn();
const setMarketplacePluginEntryDisabledMock = vi.fn();
const removeMarketplacePluginEntryMock = vi.fn();
const setAgentEntryDisabledForProviderMock = vi.fn();
const setSkillEntryDisabledForProviderMock = vi.fn();
const setMcpForProviderDisabledMock = vi.fn();
const invalidateMarketplaceCacheMock = vi.fn();
const fullScanMock = vi.fn();

vi.mock("@/lib/marketplace/install-names", () => ({
  getMarketplaceInstallNameCandidates: getMarketplaceInstallNameCandidatesMock,
}));

vi.mock("@/lib/marketplace/installed-plugins", () => ({
  findMarketplacePluginEntry: findMarketplacePluginEntryMock,
  setMarketplacePluginEntryDisabled: setMarketplacePluginEntryDisabledMock,
  removeMarketplacePluginEntry: removeMarketplacePluginEntryMock,
}));

vi.mock("@/lib/marketplace/plugin-artifacts", () => ({
  normalizeTargetProvider: (value: unknown) =>
    value === "codex" || value === "gemini" ? value : "claude",
  setAgentEntryDisabledForProvider: setAgentEntryDisabledForProviderMock,
  setSkillEntryDisabledForProvider: setSkillEntryDisabledForProviderMock,
  setMcpForProviderDisabled: setMcpForProviderDisabledMock,
}));

vi.mock("@/app/api/marketplace/search/route", () => ({
  invalidateMarketplaceCache: invalidateMarketplaceCacheMock,
}));

vi.mock("@/lib/instructions/indexer", () => ({
  fullScan: fullScanMock,
}));

describe("POST /api/marketplace/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates enabled as a boolean", async () => {
    const { POST } = await import("@/app/api/marketplace/toggle/route");
    const req = new Request("http://localhost/api/marketplace/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "demo",
        enabled: "nope",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "enabled must be a boolean" });
  });

  it("returns 404 when package is not tracked", async () => {
    findMarketplacePluginEntryMock.mockReturnValue(null);
    const { POST } = await import("@/app/api/marketplace/toggle/route");
    const req = new Request("http://localhost/api/marketplace/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "demo",
        enabled: false,
        targetProvider: "claude",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Tracked package artifacts not found",
    });
  });

  it("drops stale tracking when no tracked artifacts are found", async () => {
    findMarketplacePluginEntryMock.mockReturnValue({
      key: "claude:demo@repo",
      record: {
        agents: ["missing-agent.md"],
        skills: ["missing-skill"],
        commands: ["missing-command"],
        mcpServers: ["missing-mcp"],
        disabled: false,
      },
    });
    setAgentEntryDisabledForProviderMock.mockReturnValue(false);
    setSkillEntryDisabledForProviderMock.mockReturnValue(false);
    setMcpForProviderDisabledMock.mockReturnValue(false);

    const { POST } = await import("@/app/api/marketplace/toggle/route");
    const req = new Request("http://localhost/api/marketplace/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "demo",
        enabled: false,
        targetProvider: "claude",
        marketplaceRepo: "owner/repo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Tracked package artifacts not found",
    });
    expect(removeMarketplacePluginEntryMock).toHaveBeenCalledWith({
      name: "demo",
      targetProvider: "claude",
      marketplaceRepo: "owner/repo",
    });
    expect(setMarketplacePluginEntryDisabledMock).not.toHaveBeenCalled();
  });

  it("toggles tracked artifacts and marks the package disabled", async () => {
    findMarketplacePluginEntryMock.mockReturnValue({
      key: "codex:demo@repo",
      record: {
        agents: ["task-agent.md"],
        skills: ["reviewer"],
        commands: ["triage"],
        mcpServers: ["browser-mcp"],
        disabled: false,
      },
    });
    setAgentEntryDisabledForProviderMock.mockReturnValue(true);
    setSkillEntryDisabledForProviderMock.mockReturnValue(false);
    setMcpForProviderDisabledMock.mockReturnValue(false);

    const { POST } = await import("@/app/api/marketplace/toggle/route");
    const req = new Request("http://localhost/api/marketplace/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "demo",
        enabled: false,
        targetProvider: "codex",
        marketplaceRepo: "owner/repo",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      enabled: false,
      changed: true,
    });

    expect(setAgentEntryDisabledForProviderMock).toHaveBeenCalledWith(
      "codex",
      "task-agent",
      true,
    );
    expect(setSkillEntryDisabledForProviderMock).toHaveBeenCalledWith(
      "codex",
      "reviewer",
      true,
    );
    expect(setSkillEntryDisabledForProviderMock).toHaveBeenCalledWith(
      "codex",
      "triage",
      true,
    );
    expect(setMcpForProviderDisabledMock).toHaveBeenCalledWith(
      "codex",
      "browser-mcp",
      true,
    );
    expect(setMarketplacePluginEntryDisabledMock).toHaveBeenCalledWith({
      name: "demo",
      targetProvider: "codex",
      marketplaceRepo: "owner/repo",
      disabled: true,
    });
    expect(fullScanMock).toHaveBeenCalled();
    expect(invalidateMarketplaceCacheMock).toHaveBeenCalled();
  });

  it("supports toggling the same package off then on", async () => {
    findMarketplacePluginEntryMock.mockReturnValue({
      key: "claude:demo@repo",
      record: {
        agents: ["runner.md"],
        skills: ["review"],
        commands: [],
        mcpServers: [],
        disabled: false,
      },
    });
    setAgentEntryDisabledForProviderMock.mockReturnValue(true);
    setSkillEntryDisabledForProviderMock.mockReturnValue(true);

    const { POST } = await import("@/app/api/marketplace/toggle/route");

    const disableReq = new Request("http://localhost/api/marketplace/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "demo",
        enabled: false,
        targetProvider: "claude",
      }),
    });
    const disableRes = await POST(disableReq);
    expect(disableRes.status).toBe(200);
    expect(await disableRes.json()).toEqual({
      success: true,
      enabled: false,
      changed: true,
    });

    const enableReq = new Request("http://localhost/api/marketplace/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "marketplace-plugin",
        name: "demo",
        enabled: true,
        targetProvider: "claude",
      }),
    });
    const enableRes = await POST(enableReq);
    expect(enableRes.status).toBe(200);
    expect(await enableRes.json()).toEqual({
      success: true,
      enabled: true,
      changed: true,
    });

    expect(setAgentEntryDisabledForProviderMock).toHaveBeenNthCalledWith(
      1,
      "claude",
      "runner",
      true,
    );
    expect(setAgentEntryDisabledForProviderMock).toHaveBeenNthCalledWith(
      2,
      "claude",
      "runner",
      false,
    );
    expect(setSkillEntryDisabledForProviderMock).toHaveBeenNthCalledWith(
      1,
      "claude",
      "review",
      true,
    );
    expect(setSkillEntryDisabledForProviderMock).toHaveBeenNthCalledWith(
      2,
      "claude",
      "review",
      false,
    );
    expect(setMarketplacePluginEntryDisabledMock).toHaveBeenNthCalledWith(1, {
      name: "demo",
      targetProvider: "claude",
      marketplaceRepo: undefined,
      disabled: true,
    });
    expect(setMarketplacePluginEntryDisabledMock).toHaveBeenNthCalledWith(2, {
      name: "demo",
      targetProvider: "claude",
      marketplaceRepo: undefined,
      disabled: false,
    });
  });
});
