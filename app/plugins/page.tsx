"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { PluginsTab } from "@/components/tools/PluginsTab";
import { AddPluginDialog } from "@/components/plugins/AddPluginDialog";
import { useTools, useInvalidateTools } from "@/hooks/useTools";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import { isProviderSupportedForConfigRoute } from "@/lib/providers/config-scope";
import { getSessionProvider } from "@/lib/providers/session-registry";

function PluginsPageContent() {
  const searchParams = useSearchParams();
  const searchFromUrl =
    searchParams.get("search") || searchParams.get("plugin") || "";
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const pluginsSupported = isProviderSupportedForConfigRoute("/plugins", providerScope);
  const providerLabel =
    getSessionProvider(providerScope)?.label ?? providerScope;
  const { data: tools = [], isLoading } = useTools(providerScope);
  const invalidateTools = useInvalidateTools(providerScope);

  const [search, setSearch] = useState(searchFromUrl);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setSearch(searchFromUrl);
  }, [searchFromUrl]);

  const plugins = tools.filter((t) => t.type === "plugin");
  const pluginSkills = tools.filter((t) => t.type === "skill");

  if (!pluginsSupported) {
    return (
      <PageContainer>
        <PageScaffold
          title="Plugins"
          subtitle="Plugin management is currently available for Claude scope."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-5 text-sm text-muted-foreground">
            Current scope:{" "}
            <span className="font-medium text-foreground">{providerLabel}</span>.
            Switch scope to <span className="font-medium text-foreground">Claude</span> to manage plugins and bundled skills.
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageScaffold
          title="Plugins"
          subtitle="Manage installed plugins, their bundled skills, and add new plugin sources."
        >
          <div className="rounded-2xl border border-border/70 bg-card/95 shadow-sm p-5 text-sm text-muted-foreground text-center">
            Loading plugins...
          </div>
        </PageScaffold>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageScaffold
        title="Plugins"
        subtitle="Manage plugins, inspect their bundled skills, and add or refresh plugin integrations."
      >
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
          <div className="border-b border-border/40 bg-muted/20 px-4 py-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <SearchField
                  placeholder="Filter plugins..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputSize="sm"
                  containerClassName="w-full sm:w-72 md:w-80"
                />
                <span className="rounded-md border border-border/50 bg-background px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
                  {plugins.length} plugins
                </span>
              </div>
              <div className="flex items-center">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setShowAdd(true)}
                >
                  <Plus size={12} />
                  Add Plugin
                </Button>
              </div>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <PluginsTab
              plugins={plugins}
              pluginSkills={pluginSkills}
              search={search}
              onRefresh={invalidateTools}
            />
          </div>
        </div>
      </PageScaffold>
      <AddPluginDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </PageContainer>
  );
}

export default function PluginsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      }
    >
      <PluginsPageContent />
    </Suspense>
  );
}
