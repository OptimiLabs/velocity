import { NextRequest, NextResponse } from "next/server";
import {
  parseConfigProvider,
  readProviderMcpState,
  writeProviderMcpState,
} from "@/lib/providers/mcp-settings";
import { findClaudePluginMcpOwner } from "@/lib/providers/claude-plugin-mcp";

export async function PUT(request: NextRequest) {
  try {
    const provider = parseConfigProvider(
      request.nextUrl.searchParams.get("provider") ?? "claude",
    );
    if (!provider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const { name, enabled } = (await request.json()) as {
      name: string;
      enabled: boolean;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled must be a boolean" },
        { status: 400 },
      );
    }

    const state = readProviderMcpState(provider);
    const key = name.trim();
    if (enabled) {
      const config = state.disabled[key];
      if (!config) {
        const pluginOwner =
          provider === "claude" ? findClaudePluginMcpOwner(key) : null;
        if (pluginOwner) {
          return NextResponse.json(
            {
              error: `Server "${key}" is managed by plugin "${pluginOwner.plugin}". Toggle the plugin instead.`,
              code: "PLUGIN_MANAGED_MCP",
              plugin: pluginOwner.plugin,
              pluginId: pluginOwner.pluginId,
              pluginEnabled: pluginOwner.pluginEnabled,
            },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      state.enabled[key] = config;
      delete state.disabled[key];
    } else {
      const config = state.enabled[key];
      if (!config) {
        const pluginOwner =
          provider === "claude" ? findClaudePluginMcpOwner(key) : null;
        if (pluginOwner) {
          return NextResponse.json(
            {
              error: `Server "${key}" is managed by plugin "${pluginOwner.plugin}". Toggle the plugin instead.`,
              code: "PLUGIN_MANAGED_MCP",
              plugin: pluginOwner.plugin,
              pluginId: pluginOwner.pluginId,
              pluginEnabled: pluginOwner.pluginEnabled,
            },
            { status: 409 },
          );
        }
        return NextResponse.json({ error: "Server not found" }, { status: 404 });
      }
      state.disabled[key] = config;
      delete state.enabled[key];
    }
    writeProviderMcpState(provider, state);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
