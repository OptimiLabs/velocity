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
          `/api/tools/mcp/discover?refresh=true&provider=${provider}`,
        );
        const data = await res.json();
        const entry = data[server.name];
        if (entry?.error) {
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
    <div className="mt-3 w-full max-h-[60vh] overflow-hidden rounded-xl border border-border/60 bg-background flex flex-col shrink-0 animate-in slide-in-from-right-2 duration-200 lg:mt-0 lg:max-h-none lg:w-[380px] lg:rounded-none lg:border lg:border-y-0 lg:border-r-0 lg:border-l lg:border-border/50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              healthDotClass[health],
            )}
            title={health}
          />
          <Server size={13} className="text-chart-1 shrink-0" />
          <span className="text-sm font-medium font-mono truncate">
            {server.name}
          </span>
          <Badge variant="outline" className="text-micro shrink-0">
            {transport}
          </Badge>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {onToggle && (
            <StatusPill
              enabled={isEnabled}
              onToggle={() => onToggle(server.name, isEnabled)}
              className="mr-1"
              title={isEnabled ? "Disable server" : "Enable server"}
            />
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              editing
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            title={editing ? "View mode" : "Edit config"}
          >
            {editing ? <Eye size={14} /> : <Pencil size={14} />}
          </button>
          <button
            onClick={handlePing}
            disabled={pinging}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Ping server"
          >
            <Radio
              size={14}
              className={cn(pinging && "animate-pulse text-warning")}
            />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Edit mode */}
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
            {/* Config section */}
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">
                Configuration
              </h4>
              {server.url && (
                <a
                  href={server.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs font-mono text-chart-1 hover:text-chart-1/80 bg-muted/30 rounded px-2.5 py-1.5 break-all transition-colors group"
                >
                  <span className="flex-1">{server.url}</span>
                  <ExternalLink size={10} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                </a>
              )}
              {server.command && (
                <div className="text-xs font-mono text-muted-foreground/70 bg-muted/30 rounded px-2.5 py-1.5">
                  <span>{server.command}</span>
                  {server.args && server.args.length > 0 && (
                    <span className="text-muted-foreground/50">
                      {" "}
                      {server.args.join(" ")}
                    </span>
                  )}
                </div>
              )}
              {server.plugin && (
                <Badge
                  variant="outline"
                  className="text-micro gap-0.5 text-chart-3 border-chart-3/30"
                >
                  <Puzzle size={8} />
                  {server.plugin}
                </Badge>
              )}
              {envKeys.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {envKeys.map((k) => (
                    <Badge
                      key={k}
                      variant="outline"
                      className="text-micro gap-0.5 font-mono text-muted-foreground/60"
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
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Github size={12} />
                  <span className="font-mono truncate">{githubUrl.replace(/^https?:\/\//, "")}</span>
                  <ExternalLink size={9} className="shrink-0 opacity-50" />
                </a>
              )}
            </div>

            {/* Error banner */}
            {cached?.error && (
              <div className="flex items-start gap-2 px-2.5 py-2 rounded bg-destructive/10 text-destructive text-xs">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span>{cached.error}</span>
              </div>
            )}

            {/* Tools list */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground">
                Tools ({toolCount})
              </h4>
              {!cached ? (
                <div className="text-xs text-muted-foreground/60 py-2">
                  Tools not yet discovered. Hit Refresh to fetch tools.
                </div>
              ) : (
                <MCPToolList
                  tools={cached.tools}
                  usageMap={usageMap}
                  serverName={server.name}
                />
              )}
            </div>

            {/* Delete action */}
            <div className="pt-2 border-t border-border/50">
              <button
                onClick={() => onDelete(server.name)}
                disabled={deleting}
                className="flex items-center gap-1.5 text-xs text-destructive/80 hover:text-destructive transition-colors disabled:opacity-50"
              >
                <Trash2 size={12} />
                {deleting ? "Removing..." : "Remove server"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
