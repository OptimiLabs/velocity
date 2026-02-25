/**
 * @deprecated Superseded by components/mcp/MCPServerCard.tsx and components/mcp/MCPToolList.tsx.
 * The /mcp page now uses the new component set. This file is kept for any remaining imports.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Server,
  Trash2,
  ChevronRight,
  ChevronDown,
  Wrench,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { AddMCPForm } from "./AddMCPForm";
import { MCPServerEditor } from "./MCPServerEditor";

interface ToolInfo {
  name: string;
  type: "mcp" | "builtin" | "plugin" | "skill";
  server?: string;
  description?: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

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

type MCPToolCacheMap = Record<string, MCPServerCache>;

interface MCPUsageMap {
  [toolName: string]: { totalCalls: number; lastUsed: string | null };
}

interface MCPServersSectionProps {
  servers: ToolInfo[];
  showAdd: boolean;
  onRefresh: () => void;
  onCloseAdd: () => void;
}

export function MCPServersSection({
  servers,
  showAdd,
  onRefresh,
  onCloseAdd,
}: MCPServersSectionProps) {
  const [toolCache, setToolCache] = useState<MCPToolCacheMap>({});
  const [usageMap, setUsageMap] = useState<MCPUsageMap>({});
  const [_refreshing, setRefreshing] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(
    new Set(),
  );
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [deletingMcp, setDeletingMcp] = useState<string | null>(null);

  const fetchToolCache = useCallback((refresh = false) => {
    if (refresh) setRefreshing(true);
    fetch(`/api/tools/mcp/discover${refresh ? "?refresh=true" : ""}`)
      .then((r) => r.json())
      .then((data: MCPToolCacheMap) => {
        if (data && typeof data === "object") setToolCache(data);
      })
      .catch((err) => console.debug('[MCP]', err.message))
      .finally(() => setRefreshing(false));
  }, []);

  const fetchUsage = useCallback(() => {
    fetch("/api/tools/mcp/usage")
      .then((r) => r.json())
      .then((data: MCPUsageMap) => {
        if (data && typeof data === "object") setUsageMap(data);
      })
      .catch((err) => console.debug('[MCP]', err.message));
  }, []);

  useEffect(() => {
    fetchToolCache();
    fetchUsage();
  }, [fetchToolCache, fetchUsage]);

  const handleDeleteMCP = async (name: string) => {
    setDeletingMcp(name);
    try {
      const res = await fetch(`/api/tools/mcp?name=${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to remove MCP server");
      }
      window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to remove MCP server",
      );
    }
    setDeletingMcp(null);
  };

  const toggleExpand = (name: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {showAdd && (
        <AddMCPForm
          onSuccess={() => {
            onCloseAdd();
            onRefresh();
            fetchToolCache(true);
          }}
          onCancel={onCloseAdd}
        />
      )}

      {servers.length === 0 ? (
        <div className="text-xs text-text-tertiary py-6 text-center">
          No MCP servers configured.
        </div>
      ) : (
        <div className="space-y-2">
          {servers.map((server) => {
            const cached = toolCache[server.name];
            const isExpanded = expandedServers.has(server.name);
            const isEditing = editingServer === server.name;
            const toolCount = cached?.tools?.length ?? 0;
            const hasError = !!cached?.error;

            return (
              <Card key={server.name} className="bg-card">
                <CardContent className="p-0">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(server.name)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(server.name);
                      }
                    }}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors rounded-t-lg cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown
                        size={14}
                        className="text-muted-foreground shrink-0"
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        className="text-muted-foreground shrink-0"
                      />
                    )}
                    <Server size={14} className="text-chart-1 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-mono font-medium">
                        {server.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasError && (
                        <Badge variant="destructive" className="text-micro">
                          error
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-micro">
                        {server.url ? "http" : "stdio"}
                      </Badge>
                      <Badge variant="secondary" className="text-micro">
                        {toolCount} tool{toolCount !== 1 ? "s" : ""}
                      </Badge>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingServer(isEditing ? null : server.name);
                          if (!isExpanded) toggleExpand(server.name);
                        }}
                        className="p-1 hover:bg-chart-1/10 rounded transition-colors"
                        title="Edit server config"
                      >
                        <Pencil size={11} className="text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteMCP(server.name);
                        }}
                        disabled={deletingMcp === server.name}
                        className="p-1 hover:bg-destructive/20 rounded transition-colors"
                      >
                        <Trash2 size={11} className="text-muted-foreground" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-3 pb-3">
                      {/* Inline editor */}
                      {isEditing && (
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
                            setEditingServer(null);
                            onRefresh();
                            fetchToolCache(true);
                          }}
                          onCancel={() => setEditingServer(null)}
                        />
                      )}

                      {/* Server config info */}
                      {!isEditing && (
                        <div className="py-2 text-meta text-muted-foreground/60 font-mono">
                          {server.url || server.description}
                        </div>
                      )}

                      {hasError && (
                        <div className="flex items-start gap-2 py-2 px-2 mb-2 rounded bg-destructive/10 text-destructive text-xs">
                          <AlertCircle size={12} className="shrink-0 mt-0.5" />
                          <span>{cached.error}</span>
                        </div>
                      )}

                      {!cached ? (
                        <div className="text-xs text-text-tertiary py-2">
                          Tools not yet discovered.{" "}
                          <button
                            onClick={() => fetchToolCache(true)}
                            className="text-primary hover:underline"
                          >
                            Fetch tools
                          </button>
                        </div>
                      ) : cached.tools.length > 0 ? (
                        <div className="space-y-1">
                          {cached.tools.map((tool) => {
                            const usage = usageMap[tool.name];
                            return (
                              <div
                                key={tool.name}
                                className="flex items-start gap-2 py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                              >
                                <Wrench
                                  size={11}
                                  className="text-chart-2 shrink-0 mt-0.5"
                                />
                                <div className="min-w-0 flex-1">
                                  <span className="text-xs font-mono font-medium">
                                    {tool.name}
                                  </span>
                                  {tool.description && (
                                    <p className="text-meta text-muted-foreground/60 line-clamp-2">
                                      {tool.description}
                                    </p>
                                  )}
                                </div>
                                {usage && usage.totalCalls > 0 && (
                                  <Badge
                                    variant="outline"
                                    className="text-micro shrink-0 tabular-nums"
                                  >
                                    {usage.totalCalls} call
                                    {usage.totalCalls !== 1 ? "s" : ""}
                                  </Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : !hasError ? (
                        <div className="text-xs text-text-tertiary py-2">
                          No tools reported by this server.
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Keep old export for backwards compatibility, but it won't be used by the new page
export { MCPServersSection as MCPServersTab };
