import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { ConfigProvider } from "@/types/provider";
import {
  getProviderMcpCacheFile,
  parseConfigProvider,
  readProviderMcpState,
  writeProviderMcpState,
  type ProviderMcpServerConfig,
} from "@/lib/providers/mcp-settings";
import { findClaudePluginMcpOwner } from "@/lib/providers/claude-plugin-mcp";

function resolveProvider(request: NextRequest): ConfigProvider | null {
  const raw = request.nextUrl.searchParams.get("provider") ?? "claude";
  return parseConfigProvider(raw);
}

function removeCacheEntry(provider: ConfigProvider, name: string): boolean {
  const cachePath = getProviderMcpCacheFile(provider);
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    if (!(name in parsed)) return false;
    delete parsed[name];
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify(parsed, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const provider = resolveProvider(request);
    if (!provider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const body = await request.json();
    const { name, type, url, command, args, env, headers } = body as {
      name: string;
      type: "url" | "command";
      url?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      headers?: Record<string, string>;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const config: ProviderMcpServerConfig = {};

    if (type === "url") {
      if (!url?.trim()) {
        return NextResponse.json(
          { error: "URL is required for URL-type servers" },
          { status: 400 },
        );
      }
      config.url = url.trim();
      if (headers && Object.keys(headers).length > 0) config.headers = headers;
    } else {
      if (!command?.trim()) {
        return NextResponse.json(
          { error: "Command is required for command-type servers" },
          { status: 400 },
        );
      }
      config.command = command.trim();
      if (args && args.length > 0) config.args = args;
      if (env && Object.keys(env).length > 0) config.env = env;
    }

    const state = readProviderMcpState(provider);
    state.enabled[name.trim()] = config;
    if (state.disabled[name.trim()]) {
      delete state.disabled[name.trim()];
    }
    writeProviderMcpState(provider, state);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const provider = resolveProvider(request);
    if (!provider) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
    }

    const { name, config } = (await request.json()) as {
      name: string;
      config: Partial<ProviderMcpServerConfig>;
    };

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const state = readProviderMcpState(provider);
    const key = name.trim();
    if (!state.enabled[key]) {
      const pluginOwner =
        provider === "claude" ? findClaudePluginMcpOwner(key) : null;
      if (pluginOwner) {
        return NextResponse.json(
          {
            error: `Server "${key}" is managed by plugin "${pluginOwner.plugin}". Edit the plugin instead.`,
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
    const merged = { ...state.enabled[key] };
    for (const [cfgKey, value] of Object.entries(config || {})) {
      if (value === undefined || value === null) {
        delete merged[cfgKey];
      } else {
        merged[cfgKey] = value;
      }
    }
    state.enabled[key] = merged;
    writeProviderMcpState(provider, state);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const provider = resolveProvider(request);
  if (!provider) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const rawName = request.nextUrl.searchParams.get("name");
  const name = rawName?.trim() || "";
  if (!name) {
    return NextResponse.json(
      { error: "Name parameter is required" },
      { status: 400 },
    );
  }

  const state = readProviderMcpState(provider);
  let removed = false;
  if (state.enabled[name]) {
    delete state.enabled[name];
    removed = true;
  }
  if (state.disabled[name]) {
    delete state.disabled[name];
    removed = true;
  }
  if (removed) {
    writeProviderMcpState(provider, state);
    const cacheEntryRemoved = removeCacheEntry(provider, name);
    const pluginOwner =
      provider === "claude" ? findClaudePluginMcpOwner(name) : null;
    return NextResponse.json({
      success: true,
      removed: "config",
      cacheEntryRemoved,
      stillProvidedByPlugin: !!pluginOwner,
      plugin: pluginOwner?.plugin,
      pluginId: pluginOwner?.pluginId,
      pluginEnabled: pluginOwner?.pluginEnabled ?? false,
    });
  }

  const pluginOwner =
    provider === "claude" ? findClaudePluginMcpOwner(name) : null;
  if (pluginOwner) {
    removeCacheEntry(provider, name);
    return NextResponse.json(
      {
        error: `Server "${name}" is managed by plugin "${pluginOwner.plugin}". Disable or uninstall that plugin to remove it.`,
        code: "PLUGIN_MANAGED_MCP",
        plugin: pluginOwner.plugin,
        pluginId: pluginOwner.pluginId,
        pluginEnabled: pluginOwner.pluginEnabled,
      },
      { status: 409 },
    );
  }

  if (removeCacheEntry(provider, name)) {
    return NextResponse.json({
      success: true,
      removed: "cache",
      message: `Removed stale cache entry for "${name}".`,
    });
  }

  return NextResponse.json({ error: "Server not found" }, { status: 404 });
}
