import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const parseConfigProviderMock = vi.fn((value: unknown) =>
  value === "claude" || value === "codex" || value === "gemini" ? value : null,
);
const readProviderMcpStateMock = vi.fn();
const writeProviderMcpStateMock = vi.fn();
const getProviderMcpCacheFileMock = vi.fn(() => "/tmp/mcp-tools-cache.json");
const findClaudePluginMcpOwnerMock = vi.fn();
const readFileSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const mkdirSyncMock = vi.fn();

vi.mock("@/lib/providers/mcp-settings", () => ({
  parseConfigProvider: parseConfigProviderMock,
  readProviderMcpState: readProviderMcpStateMock,
  writeProviderMcpState: writeProviderMcpStateMock,
  getProviderMcpCacheFile: getProviderMcpCacheFileMock,
}));

vi.mock("@/lib/providers/claude-plugin-mcp", () => ({
  findClaudePluginMcpOwner: findClaudePluginMcpOwnerMock,
}));

vi.mock("fs", () => ({
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
  mkdirSync: mkdirSyncMock,
}));

describe("DELETE /api/tools/mcp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readProviderMcpStateMock.mockReturnValue({
      enabled: {},
      disabled: {},
      supportsToggle: true,
    });
    findClaudePluginMcpOwnerMock.mockReturnValue(null);
    readFileSyncMock.mockImplementation(() => {
      throw new Error("missing cache");
    });
  });

  it("removes config-managed server", async () => {
    readProviderMcpStateMock.mockReturnValue({
      enabled: { serena: { command: "npx", args: ["serena"] } },
      disabled: {},
      supportsToggle: true,
    });

    const { DELETE } = await import("@/app/api/tools/mcp/route");
    const req = new NextRequest(
      "http://localhost/api/tools/mcp?provider=claude&name=serena",
    );
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      removed: "config",
      stillProvidedByPlugin: false,
    });
    expect(writeProviderMcpStateMock).toHaveBeenCalledWith("claude", {
      enabled: {},
      disabled: {},
      supportsToggle: true,
    });
  });

  it("returns plugin-managed conflict when server is provided by plugin", async () => {
    findClaudePluginMcpOwnerMock.mockReturnValue({
      plugin: "serena",
      pluginId: "serena@claude-plugins-official",
      pluginEnabled: false,
    });

    const { DELETE } = await import("@/app/api/tools/mcp/route");
    const req = new NextRequest(
      "http://localhost/api/tools/mcp?provider=claude&name=serena",
    );
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data).toMatchObject({
      code: "PLUGIN_MANAGED_MCP",
      plugin: "serena",
      pluginId: "serena@claude-plugins-official",
      pluginEnabled: false,
    });
    expect(writeProviderMcpStateMock).not.toHaveBeenCalled();
  });

  it("removes stale cache entry when server is missing from config", async () => {
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        serena: { tools: [], fetchedAt: 1 },
        other: { tools: [], fetchedAt: 2 },
      }),
    );

    const { DELETE } = await import("@/app/api/tools/mcp/route");
    const req = new NextRequest(
      "http://localhost/api/tools/mcp?provider=claude&name=serena",
    );
    const res = await DELETE(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toMatchObject({
      success: true,
      removed: "cache",
    });
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/tmp/mcp-tools-cache.json",
      JSON.stringify({ other: { tools: [], fetchedAt: 2 } }, null, 2),
      "utf-8",
    );
  });
});
