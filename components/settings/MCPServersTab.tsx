"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  Server,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClaudeSettings, MCPServerConfig } from "@/lib/claude-settings";

interface MCPServersTabProps {
  settings: ClaudeSettings;
  onUpdate: (partial: Partial<ClaudeSettings>) => Promise<void>;
}

export function MCPServersTab({ settings, onUpdate }: MCPServersTabProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [mode, setMode] = useState<"url" | "command">("command");
  const [healthStatus, setHealthStatus] = useState<
    Record<string, "ok" | "error" | "checking">
  >({});
  const enabledServers = settings.mcpServers || {};
  const disabledServers = settings.disabledMcpServers || {};

  // Build a merged list: all servers with their enabled state
  const allServers: {
    name: string;
    config: MCPServerConfig;
    enabled: boolean;
  }[] = [
    ...Object.entries(enabledServers).map(([n, config]) => ({
      name: n,
      config,
      enabled: true,
    })),
    ...Object.entries(disabledServers).map(([n, config]) => ({
      name: n,
      config,
      enabled: false,
    })),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const addServer = async () => {
    if (!name.trim()) return;
    const config: MCPServerConfig =
      mode === "url"
        ? { url }
        : { command, args: args ? args.split(" ") : undefined };
    await onUpdate({
      mcpServers: { ...enabledServers, [name.trim()]: config },
    });
    setAdding(false);
    setName("");
    setUrl("");
    setCommand("");
    setArgs("");
  };

  const removeServer = async (serverName: string) => {
    // Remove from whichever map it's in
    const nextEnabled = { ...enabledServers };
    const nextDisabled = { ...disabledServers };
    delete nextEnabled[serverName];
    delete nextDisabled[serverName];
    await onUpdate({
      mcpServers: nextEnabled,
      disabledMcpServers: nextDisabled,
    });
  };

  const toggleServer = async (
    serverName: string,
    currentlyEnabled: boolean,
  ) => {
    const nextEnabled = { ...enabledServers };
    const nextDisabled = { ...disabledServers };

    if (currentlyEnabled) {
      // Move from enabled → disabled
      const config = nextEnabled[serverName];
      if (!config) return;
      nextDisabled[serverName] = config;
      delete nextEnabled[serverName];
    } else {
      // Move from disabled → enabled
      const config = nextDisabled[serverName];
      if (!config) return;
      nextEnabled[serverName] = config;
      delete nextDisabled[serverName];
    }

    await onUpdate({
      mcpServers: nextEnabled,
      disabledMcpServers: nextDisabled,
    });
  };

  const checkHealth = async (serverName: string) => {
    setHealthStatus((prev) => ({ ...prev, [serverName]: "checking" }));
    try {
      const server = enabledServers[serverName] || disabledServers[serverName];
      if (server?.url) {
        const res = await fetch(server.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        setHealthStatus((prev) => ({
          ...prev,
          [serverName]: res?.ok ? "ok" : "error",
        }));
      } else {
        setHealthStatus((prev) => ({ ...prev, [serverName]: "ok" }));
      }
    } catch {
      setHealthStatus((prev) => ({ ...prev, [serverName]: "error" }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">MCP Servers</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Model Context Protocol servers extend Claude with custom tools.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => window.open("/library?tab=marketplace", "_self")}
          >
            Find MCP Servers
          </Button>
          <Button
            size="sm"
            className="text-xs gap-1"
            onClick={() => setAdding(true)}
          >
            <Plus size={12} /> New Server
          </Button>
        </div>
      </div>

      {allServers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Server size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No MCP servers configured</p>
          <p className="text-xs mt-1">
            Add a server to extend Claude with custom tools and capabilities.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {allServers.map(({ name: serverName, config, enabled }) => (
            <div
              key={serverName}
              className={`border border-border rounded-lg p-3 space-y-2 transition-opacity ${
                enabled ? "" : "opacity-50"
              }`}
            >
              <div className="flex items-center gap-2">
                <Server size={14} className="text-muted-foreground" />
                <span className="text-sm font-medium font-mono">
                  {serverName}
                </span>
                <div className="flex-1" />

                {/* Toggle switch */}
                <button
                  onClick={() => toggleServer(serverName, enabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                    enabled ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                  role="switch"
                  aria-checked={enabled}
                  title={enabled ? "Disable server" : "Enable server"}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-primary-foreground shadow-sm transform transition-transform mt-0.5 ${
                      enabled ? "translate-x-[18px]" : "translate-x-0.5"
                    }`}
                  />
                </button>

                {/* Health indicator */}
                {healthStatus[serverName] === "checking" && (
                  <RefreshCw
                    size={12}
                    className="animate-spin text-muted-foreground"
                  />
                )}
                {healthStatus[serverName] === "ok" && (
                  <CheckCircle2 size={12} className="text-green-500 dark:text-green-400" />
                )}
                {healthStatus[serverName] === "error" && (
                  <XCircle size={12} className="text-red-500 dark:text-red-400" />
                )}

                <button
                  onClick={() => checkHealth(serverName)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Ping
                </button>
                <button
                  onClick={() => removeServer(serverName)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="text-xs font-mono text-muted-foreground">
                {config.url && <div>URL: {config.url}</div>}
                {config.command && (
                  <div>
                    Command: {config.command} {config.args?.join(" ")}
                  </div>
                )}
              </div>
              {config.env && Object.keys(config.env).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Object.keys(config.env).map((k) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className="text-meta font-mono"
                    >
                      {k}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Server Dialog */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-popover border border-border rounded-xl shadow-xl w-full max-w-md mx-4 p-4 space-y-4">
            <h3 className="text-sm font-medium">Add MCP Server</h3>

            <div className="space-y-1">
              <label className="text-xs font-medium">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-mcp-server"
                className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Connection Type</label>
              <div className="flex gap-2">
                {(["command", "url"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      mode === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "command" ? "Command (stdio)" : "URL (SSE)"}
                  </button>
                ))}
              </div>
            </div>

            {mode === "url" ? (
              <div className="space-y-1">
                <label className="text-xs font-medium">Server URL</label>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="http://localhost:8080/mcp"
                  className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
                />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Command</label>
                  <input
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    placeholder="npx -y @example/mcp-server"
                    className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">
                    Arguments{" "}
                    <span className="text-muted-foreground font-normal">
                      (space-separated)
                    </span>
                  </label>
                  <input
                    value={args}
                    onChange={(e) => setArgs(e.target.value)}
                    placeholder="--port 8080"
                    className="w-full h-8 text-xs font-mono rounded border border-border bg-background px-2"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
              <Button size="sm" className="h-8" onClick={addServer} disabled={!name.trim()}>
                Add Server
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
