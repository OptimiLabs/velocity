import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readSettings } from "@/lib/claude-settings";
import { mcpLog } from "@/lib/logger";
import type { ConfigProvider } from "@/types/provider";
import {
  getProviderMcpCacheFile,
  parseConfigProvider,
  readProviderMcpState,
  type ProviderMcpServerConfig,
} from "@/lib/providers/mcp-settings";

interface MCPToolEntry {
  name: string;
  description?: string;
  inputSchema?: object;
}

interface MCPServerCache {
  tools: MCPToolEntry[];
  fetchedAt: number;
  error?: string;
}

type MCPToolCache = Record<string, MCPServerCache>;

function resolveProvider(request: NextRequest): ConfigProvider | null {
  return parseConfigProvider(
    request.nextUrl.searchParams.get("provider") ?? "claude",
  );
}

function readCache(cacheFile: string): MCPToolCache {
  try {
    return JSON.parse(readFileSync(cacheFile, "utf-8"));
  } catch {
    return {};
  }
}

function writeCache(cacheFile: string, cache: MCPToolCache) {
  mkdirSync(dirname(cacheFile), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2), "utf-8");
}

async function discoverServerTools(
  name: string,
  config: ProviderMcpServerConfig,
): Promise<MCPServerCache> {
  const timeout = 6_000;

  let client: Client | null = null;
  let transport: StdioClientTransport | SSEClientTransport | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stderrChunks: Buffer[] = [];

  try {
    client = new Client({ name: "workspace-ctrl", version: "1.0.0" });

    if (config.url) {
      transport = new SSEClientTransport(new URL(config.url));
    } else if (config.command) {
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) } as Record<
          string,
          string
        >,
        stderr: "pipe",
      });

      // Collect stderr so we can surface real errors instead of "Connection closed"
      if (transport.stderr) {
        transport.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
      }
    } else {
      return {
        tools: [],
        fetchedAt: Date.now(),
        error: "No url or command configured",
      };
    }

    mcpLog.info("connecting to MCP server", {
      server: name,
      transport: config.url ? "sse" : "stdio",
    });

    const result = await Promise.race([
      (async () => {
        await client!.connect(transport!);
        const response = await client!.listTools();
        return response;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timeout after ${timeout}ms`)),
          timeout,
        );
      }),
    ]);

    if (timer) clearTimeout(timer);

    const tools: MCPToolEntry[] = (result.tools || []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    return { tools, fetchedAt: Date.now() };
  } catch (err) {
    if (timer) clearTimeout(timer);

    let message = err instanceof Error ? err.message : String(err);

    // If we got a generic "Connection closed" but have stderr output,
    // surface the real error from the child process
    if (message.includes("Connection closed") && stderrChunks.length > 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf-8").trim();
      const lines = stderr
        .split("\n")
        .filter((l) => l.trim() && !l.includes("debug-0.log"));
      const useful = lines.pop();
      if (useful) message = useful.trim();
    }

    mcpLog.error("MCP discovery failed", err, { server: name });
    return { tools: [], fetchedAt: Date.now(), error: message };
  } finally {
    // Always close the client/transport to kill spawned child processes
    try {
      await client?.close();
    } catch (err) {
      mcpLog.warn("client.close() failed", err, { server: name });
    }
  }
}

export async function GET(request: NextRequest) {
  const provider = resolveProvider(request);
  if (!provider) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "true";
  const requestedServer = request.nextUrl.searchParams.get("server")?.trim() || "";
  const cacheFile = getProviderMcpCacheFile(provider);

  // Non-refresh reads should return immediately with whatever cache exists.
  if (!refresh) {
    return NextResponse.json(readCache(cacheFile));
  }

  // Gather all enabled MCP servers from provider config
  const providerState = readProviderMcpState(provider);
  const servers: Record<string, ProviderMcpServerConfig> = {
    ...providerState.enabled,
  };

  // Claude-only: include plugin-provided MCP servers from .mcp.json
  if (provider === "claude") {
    const settings = readSettings();
    try {
      const pluginsPath = join(
        homedir(),
        ".claude",
        "plugins",
        "installed_plugins.json",
      );
      const raw = readFileSync(pluginsPath, "utf-8");
      const data = JSON.parse(raw);
      const pluginsMap = data.plugins || {};
      const enabledPlugins = settings.enabledPlugins || {};

      for (const [pluginId, installs] of Object.entries(pluginsMap)) {
        const installList = installs as Array<{ installPath?: string }>;
        if (!Array.isArray(installList) || installList.length === 0) continue;
        if (!enabledPlugins[pluginId]) continue;

        const latest = installList[installList.length - 1];
        if (!latest.installPath) continue;

        try {
          const mcpJsonPath = join(latest.installPath, ".mcp.json");
          const mcpRaw = readFileSync(mcpJsonPath, "utf-8");
          const mcpConfig = JSON.parse(mcpRaw) as Record<
            string,
            ProviderMcpServerConfig
          >;

          for (const [serverName, cfg] of Object.entries(mcpConfig)) {
            // user settings take precedence — skip duplicates
            if (servers[serverName]) continue;
            servers[serverName] = cfg;
          }
        } catch (err) {
          mcpLog.debug("plugin MCP config not found", {
            pluginId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch (err) {
      mcpLog.debug("plugins file not found", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const discoveryTargets = requestedServer
    ? Object.entries(servers).filter(([name]) => name === requestedServer)
    : Object.entries(servers);

  if (requestedServer && discoveryTargets.length === 0) {
    const cached = readCache(cacheFile);
    return NextResponse.json({
      ...cached,
      [requestedServer]: {
        tools: [],
        fetchedAt: Date.now(),
        error: "Server not found or not enabled",
      } satisfies MCPServerCache,
    });
  }

  const entries = await Promise.all(
    discoveryTargets.map(async ([name, config]) => {
      const result = await discoverServerTools(name, config);
      return [name, result] as const;
    }),
  );

  const discovered: MCPToolCache = Object.fromEntries(entries);
  const cache: MCPToolCache = requestedServer
    ? { ...readCache(cacheFile), ...discovered }
    : discovered;
  writeCache(cacheFile, cache);

  return NextResponse.json(cache);
}
