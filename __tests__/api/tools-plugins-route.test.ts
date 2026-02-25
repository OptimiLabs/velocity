import { describe, expect, it, vi } from "vitest";

const togglePluginMock = vi.fn();

vi.mock("@/lib/claude-settings", () => ({
  togglePlugin: togglePluginMock,
}));

describe("PUT /api/tools/plugins", () => {
  it("passes optional installPath through to togglePlugin", async () => {
    const { PUT } = await import("@/app/api/tools/plugins/route");
    const req = new Request("http://localhost/api/tools/plugins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pluginId: "example@registry",
        enabled: false,
        installPath: "/Users/test/.claude/plugins/example",
      }),
    });

    const res = await PUT(req as never);
    expect(res.status).toBe(200);
    expect(togglePluginMock).toHaveBeenCalledWith(
      "example@registry",
      false,
      "/Users/test/.claude/plugins/example",
    );
  });

  it("validates installPath when provided", async () => {
    const { PUT } = await import("@/app/api/tools/plugins/route");
    const req = new Request("http://localhost/api/tools/plugins", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pluginId: "example@registry",
        enabled: true,
        installPath: 42,
      }),
    });

    const res = await PUT(req as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "installPath must be a string when provided",
    });
  });
});
