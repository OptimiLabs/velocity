"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  X,
  Server,
  Pencil,
  Eye,
  Radio,
  Trash2,
  AlertCircle,
  Key,
  Puzzle,
  ExternalLink,
  Github,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/ui/status-pill";
import { MCPToolList } from "./MCPToolList";
import { MCPServerEditor } from "@/components/tools/MCPServerEditor";
import type { ToolInfo } from "@/hooks/useTools";
import type { MCPServerCache, MCPUsageMap } from "@/hooks/useMCP";
import type { ConfigProvider } from "@/types/provider";

type HealthStatus = "healthy" | "error" | "unknown" | "checking";

interface MCPDetailPanelProps {
  server: ToolInfo;
  cached?: MCPServerCache;
  usageMap: MCPUsageMap;
  onRefresh: () => void;
  onDelete: (name: string) => void;
  deleting: boolean;
  onClose: () => void;
  onToggle?: (name: string, enabled: boolean) => void;
  provider?: ConfigProvider;
}

function healthFromCache(cached?: MCPServerCache): HealthStatus {
  if (!cached) return "unknown";
  if (cached.error) return "error";
  return "healthy";
}

/** Try to derive a GitHub URL from server metadata */
function deriveGithubUrl(server: ToolInfo): string | null {
  // Check registry field for GitHub patterns
  if (server.registry) {
    if (server.registry.includes("github.com")) return server.registry;
    const ghMatch = server.registry.match(/^github:(.+)/);
    if (ghMatch) return `https://github.com/${ghMatch[1]}`;
  }
  // Check installPath for GitHub clones
  if (server.installPath) {
    const pathMatch = server.installPath.match(
      /github\.com[/\\]([^/\\]+[/\\][^/\\]+)/,
    );
    if (pathMatch) return `https://github.com/${pathMatch[1].replace("\\", "/")}`;
  }
  // Check command for npm package → derive npmjs link (close enough)
  if (server.command === "npx" && server.args?.[0]) {
    const pkg = server.args[0].replace(/^-[yp]\s+/, "");
    if (pkg.startsWith("@") || /^[a-z0-9-]+$/.test(pkg)) {
      return `https://www.npmjs.com/package/${pkg}`;
    }
  }
  return null;
}

const healthDotClass: Record<HealthStatus, string> = {
  healthy: "bg-success",
  error: "bg-destructive",
  unknown: "bg-muted-foreground/40",
  checking: "bg-warning animate-pulse",
};

const healthLabel: Record<HealthStatus, string> = {
  healthy: "Healthy",
  error: "Error",
  unknown: "Unknown",
  checking: "Checking",
};

export function MCPDetailPanel({
  server,
  cached,
  usageMap,
  onRefresh,
  onDelete,
  deleting,
  onClose,
  onToggle,
  provider = "claude",
}: MCPDetailPanelProps) {
  const isEnabled = server.enabled !== false;
  const isPluginManaged = !!server.pluginId;
  const canEdit = !isPluginManaged;
  const [editing, setEditing] = useState(false);
  const [health, setHealth] = useState<HealthStatus>(healthFromCache(cached));
  const [pinging, setPinging] = useState(false);

  const toolCount = cached?.tools?.length ?? 0;
  const transport = server.url ? "http" : "stdio";
  const envKeys = server.env ? Object.keys(server.env) : [];
  const githubUrl = deriveGithubUrl(server);

  const handlePing = async () => {
    setPinging(true);
    setHealth("checking");
    try {
      if (server.url) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(server.url, {
          method: "HEAD",
          signal: controller.signal,
          mode: "no-cors",
        });
        clearTimeout(timeout);
        setHealth("healthy");
        toast.success(`${server.name} is reachable`);
      } else {
        const res = await fetch(
          `/api/tools/mcp/discover?refresh=true&provider=${provider}&server=${encodeURIComponent(server.name)}`,
        );
        const data = await res.json();
        const entry = data[server.name];
        if (!entry) {
          setHealth("error");
          toast.error(`${server.name}: discovery returned no data`);
        } else if (entry?.error) {
          setHealth("error");
          toast.error(`${server.name}: ${entry.error}`);
        } else {
          setHealth("healthy");
          toast.success(`${server.name} is healthy`);
        }
      }
    } catch {
      setHealth("error");
      toast.error(`${server.name} is unreachable`);
    }
    setPinging(false);
  };

  return (
    <aside className="mt-3 flex w-full max-h-[64vh] shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 animate-in slide-in-from-right-2 duration-200 lg:mt-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-0 lg:border-l lg:border-border/50 lg:bg-card/50">
      <header className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={cn("h-2 w-2 rounded-full shrink-0", healthDotClass[health])}
            title={health}
          />
          <Server size={13} className="text-chart-1 shrink-0" />
          <span className="truncate text-sm font-medium font-mono">{server.name}</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
          title="Close panel"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {editing ? (
          <MCPServerEditor
            serverName={server.name}
            config={{
              url: server.url,
              command: server.command,
              args: server.args,
              env: server.env,
              headers: server.headers,
            }}
            onSave={() => {
              setEditing(false);
              onRefresh();
            }}
            onCancel={() => setEditing(false)}
            provider={provider}
          />
        ) : (
          <>
            <section className="space-y-2 rounded-lg border border-border/60 bg-card/50 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {onToggle && (
                  <StatusPill
                    enabled={isEnabled}
                    onToggle={
                      isPluginManaged ? undefined : () => onToggle(server.name, isEnabled)
                    }
                    title={
                      isPluginManaged
                        ? `Managed by plugin ${server.plugin || server.pluginId}`
                        : isEnabled
                          ? "Disable server"
                          : "Enable server"
                    }
                  />
                )}
                <Badge variant="outline" className="text-micro uppercase">
                  {transport}
                </Badge>
                <Badge variant="secondary" className="text-micro tabular-nums">
                  {toolCount} tool{toolCount !== 1 ? "s" : ""}
                </Badge>
                <Badge variant="outline" className="text-micro">
                  {healthLabel[health]}
                </Badge>
                {server.plugin && (
                  <Badge
                    variant="outline"
                    className="text-micro gap-0.5 border-chart-3/30 text-chart-3"
                    title={server.plugin}
                  >
                    <Puzzle size={8} />
                    {server.plugin}
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isPluginManaged
                  ? `Managed by plugin ${server.plugin || server.pluginId}`
                  : "User-managed MCP server"}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    if (!canEdit) return;
                    setEditing((v) => !v);
                  }}
                  disabled={!canEdit}
                  className={cn(
                    "inline-flex h-7 items-center justify-center gap-1 rounded-md border text-xs transition-colors",
                    !canEdit
                      ? "cursor-not-allowed border-border/40 text-muted-foreground/40"
                      : editing
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  title={
                    canEdit
                      ? editing
                        ? "View mode"
                        : "Edit config"
                      : "Managed by plugin"
                  }
                >
                  {editing ? <Eye size={12} /> : <Pencil size={12} />}
                  {editing ? "View" : "Edit"}
                </button>
                <button
                  onClick={handlePing}
                  disabled={pinging}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-border/60 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
                  title="Ping server"
                >
                  <Radio
                    size={12}
                    className={cn(pinging && "animate-pulse text-warning")}
                  />
                  {pinging ? "Checking..." : "Ping"}
                </button>
              </div>
            </section>

            <section className="space-y-2 rounded-lg border border-border/60 bg-card/60 p-3">
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Configuration
              </h4>
              {server.url && (
                <a
                  href={server.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-1.5 rounded-md bg-muted/35 px-2 py-1.5 text-xs font-mono text-chart-1 transition-colors hover:text-chart-1/80"
                >
                  <span className="flex-1 break-all">{server.url}</span>
                  <ExternalLink
                    size={10}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-70"
                  />
                </a>
              )}
              {server.command && (
                <div className="rounded-md bg-muted/35 px-2 py-1.5 text-xs font-mono text-muted-foreground/80 break-all">
                  {server.command}
                  {server.args && server.args.length > 0 ? ` ${server.args.join(" ")}` : ""}
                </div>
              )}
              {envKeys.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {envKeys.map((k) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className="text-micro gap-0.5 font-mono text-muted-foreground/70"
                    >
                      <Key size={8} />
                      {k}
                    </Badge>
                  ))}
                </div>
              )}
              {githubUrl && (
                <a
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Github size={12} />
                  <span className="max-w-full truncate font-mono">
                    {githubUrl.replace(/^https?:\/\//, "")}
                  </span>
                  <ExternalLink size={9} className="shrink-0 opacity-60" />
                </a>
              )}
            </section>

            {cached?.error && (
              <section className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <div className="flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{cached.error}</span>
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Discovered Tools ({toolCount})
              </h4>
              {!cached ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/15 px-3 py-2 text-xs text-muted-foreground">
                  {isEnabled
                    ? "Tool list is syncing automatically. It will appear here once discovery finishes."
                    : isPluginManaged
                      ? `Plugin ${server.plugin || server.pluginId} is disabled. Enable the plugin to discover tools.`
                      : "Server is disabled. Enable it to discover and view tools."}
                </div>
              ) : (
                <MCPToolList
                  tools={cached.tools}
                  usageMap={usageMap}
                  serverName={server.name}
                />
              )}
            </section>

            <section className="rounded-lg border border-border/60 bg-card/50 px-3 py-2">
              {isPluginManaged ? (
                <p className="text-[11px] text-muted-foreground">
                  Remove this via Plugins, not MCP server config.
                </p>
              ) : (
                <button
                  onClick={() => onDelete(server.name)}
                  disabled={deleting}
                  className="inline-flex items-center gap-1.5 text-xs text-destructive/85 transition-colors hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 size={12} />
                  {deleting ? "Removing..." : "Remove server"}
                </button>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
