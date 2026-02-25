import { NextRequest, NextResponse } from "next/server";
import type { ConfigProvider } from "@/types/provider";
import {
  parseConfigProvider,
  readProviderMcpState,
  writeProviderMcpState,
  type ProviderMcpServerConfig,
} from "@/lib/providers/mcp-settings";

function resolveProvider(request: NextRequest): ConfigProvider | null {
  const raw = request.nextUrl.searchParams.get("provider") ?? "claude";
  return parseConfigProvider(raw);
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

  const name = request.nextUrl.searchParams.get("name");
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
  if (!removed) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  writeProviderMcpState(provider, state);
  return NextResponse.json({ success: true });
}
