import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const parseConfigProviderMock = vi.fn((value: unknown) =>
  value === "claude" || value === "codex" || value === "gemini" ? value : null,
);
const readProviderMcpStateMock = vi.fn();
const writeProviderMcpStateMock = vi.fn();
const findClaudePluginMcpOwnerMock = vi.fn();

vi.mock("@/lib/providers/mcp-settings", () => ({
  parseConfigProvider: parseConfigProviderMock,
  readProviderMcpState: readProviderMcpStateMock,
  writeProviderMcpState: writeProviderMcpStateMock,
}));

vi.mock("@/lib/providers/claude-plugin-mcp", () => ({
  findClaudePluginMcpOwner: findClaudePluginMcpOwnerMock,
}));

describe("PUT /api/tools/mcp/toggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readProviderMcpStateMock.mockReturnValue({
      enabled: {},
      disabled: {},
      supportsToggle: true,
    });
    findClaudePluginMcpOwnerMock.mockReturnValue(null);
  });

  it("returns plugin-managed conflict when toggling plugin MCP server", async () => {
    findClaudePluginMcpOwnerMock.mockReturnValue({
      plugin: "serena",
      pluginId: "serena@claude-plugins-official",
      pluginEnabled: true,
    });

    const { PUT } = await import("@/app/api/tools/mcp/toggle/route");
    const req = new NextRequest("http://localhost/api/tools/mcp/toggle?provider=claude", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "serena", enabled: false }),
    });
    const res = await PUT(req);
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data).toMatchObject({
      code: "PLUGIN_MANAGED_MCP",
      plugin: "serena",
      pluginId: "serena@claude-plugins-official",
      pluginEnabled: true,
    });
    expect(writeProviderMcpStateMock).not.toHaveBeenCalled();
  });
});
