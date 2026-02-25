"use client";

import { useState, useMemo, useEffect } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { MCPServerCard } from "@/components/mcp/MCPServerCard";
import { MCPDetailPanel } from "@/components/mcp/MCPDetailPanel";
import { AddMCPDialog } from "@/components/library/AddMCPDialog";
import { useTools, useInvalidateTools } from "@/hooks/useTools";
import {
  useMCPDiscover,
  useMCPUsage,
  useRefreshMCPDiscover,
} from "@/hooks/useMCP";
import { useProviderScopeStore } from "@/stores/providerScopeStore";

type TransportFilter = "all" | "http" | "stdio";

export default function MCPPage() {
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const { data: tools = [], isLoading: toolsLoading } = useTools(providerScope);
  const { data: toolCache = {} } = useMCPDiscover(providerScope);
  const { data: usageMap = {} } = useMCPUsage(providerScope);
  const refreshDiscover = useRefreshMCPDiscover(providerScope);
  const invalidateTools = useInvalidateTools(providerScope);

  const [search, setSearch] = useState("");
  const [transport, setTransport] = useState<TransportFilter>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [deletingMcp, setDeletingMcp] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const mcpServers = tools.filter((t) => t.type === "mcp");

  // Apply search + transport filter
  const filtered = useMemo(() => {
    let result = mcpServers;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(q));
    }
    if (transport !== "all") {
      result = result.filter((s) => (transport === "http" ? !!s.url : !s.url));
    }
    return result;
  }, [mcpServers, search, transport]);

  // ESC to close detail panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedServer) {
        setSelectedServer(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedServer]);

  const handleRefresh = () => {
    refreshDiscover.mutate();
  };

  const handleDelete = async (name: string) => {
    setDeletingMcp(name);
    try {
      const res = await fetch(
        `/api/tools/mcp?provider=${providerScope}&name=${encodeURIComponent(name)}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) throw new Error("Failed to remove MCP server");
      window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
      invalidateTools();
      if (selectedServer === name) setSelectedServer(null);
    } catch {
      toast.error("Failed to remove MCP server");
    }
    setDeletingMcp(null);
  };

  const handleAddSuccess = () => {
    invalidateTools();
    refreshDiscover.mutate();
  };

  const handleToggle = async (name: string, currentlyEnabled: boolean) => {
    try {
      const res = await fetch(`/api/tools/mcp/toggle?provider=${providerScope}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, enabled: !currentlyEnabled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to toggle MCP server");
      }
      window.dispatchEvent(new CustomEvent("mcp:restart-sessions"));
      invalidateTools();
      refreshDiscover.mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to toggle MCP server");
    }
  };

  // Resolve the selected server object
  const selectedServerObj = selectedServer
    ? mcpServers.find((s) => s.name === selectedServer)
    : null;

  if (toolsLoading) {
    return (
      <PageContainer fullHeight>
        <PageScaffold
          title="MCP Servers"
          subtitle="Manage Model Context Protocol servers, connectivity, and usage in a master-detail workspace."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-5 text-sm text-muted-foreground text-center">
            Loading MCP servers...
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  return (
    <PageContainer fullHeight>
      <PageScaffold
        title="MCP Servers"
        subtitle="Manage Model Context Protocol servers, transport types, and runtime availability for your local environment."
        className="flex min-h-0 flex-1 flex-col"
        bodyClassName="flex-1 min-h-0"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
          <div className="border-b border-border/40 bg-muted/20 px-4 py-3 shrink-0">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <SearchField
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search servers..."
                  inputSize="sm"
                  containerClassName="w-full sm:w-72 md:w-80"
                  icon={Search}
                />

                <Select
                  value={transport}
                  onValueChange={(v) => setTransport(v as TransportFilter)}
                >
                  <SelectTrigger size="sm" className="w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="stdio">stdio</SelectItem>
                  </SelectContent>
                </Select>

                <span className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
                  {filtered.length} shown
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={handleRefresh}
                  disabled={refreshDiscover.isPending}
                >
                  <RefreshCw
                    size={12}
                    className={cn(refreshDiscover.isPending && "animate-spin")}
                  />
                  {refreshDiscover.isPending ? "Discovering..." : "Refresh"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={12} />
                  Add Server
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden p-3 sm:p-4">
            <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
              <div className="flex-1 min-h-0 overflow-y-auto lg:pr-1">
                {mcpServers.length === 0 ? (
                  <div className="text-sm text-muted-foreground/80 py-14 text-center">
                    No MCP servers configured. Click &ldquo;Add Server&rdquo; to get
                    started.
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground/80 py-10 text-center">
                    No servers match your search.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((server) => (
                      <MCPServerCard
                        key={server.name}
                        server={server}
                        cached={toolCache[server.name]}
                        selected={selectedServer === server.name}
                        onSelect={() => setSelectedServer(server.name)}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                )}
              </div>

              {selectedServerObj && (
                <MCPDetailPanel
                  key={selectedServerObj.name}
                  server={selectedServerObj}
                  cached={toolCache[selectedServerObj.name]}
                  usageMap={usageMap}
                  onRefresh={handleAddSuccess}
                  onDelete={handleDelete}
                  deleting={deletingMcp === selectedServerObj.name}
                  onClose={() => setSelectedServer(null)}
                  onToggle={handleToggle}
                  provider={providerScope}
                />
              )}
            </div>
          </div>
        </div>
      </PageScaffold>

      {/* Add Server Dialog */}
      <AddMCPDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSuccess={handleAddSuccess}
        provider={providerScope}
      />
    </PageContainer>
  );
}
