"use client";

import { Suspense, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  RefreshCw,
  Grid3X3,
  ListTree,
  Plus,
  Link,
  Package,
  ArrowRight,
  Download,
  Loader2,
  EllipsisVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SourceBar } from "@/components/marketplace/SourceBar";
import { PackageGrid } from "@/components/marketplace/PackageGrid";
import { PackageList } from "@/components/marketplace/PackageList";

import { SourcesDialog } from "@/components/marketplace/SourcesDialog";
import { PluginDetailDialog } from "@/components/marketplace/PluginDetailDialog";
import {
  HookPreviewDialog,
  type HookPreviewConfig,
} from "@/components/marketplace/HookPreviewDialog";
import {
  useMarketplaceSources,
  useMarketplaceSearch,
  useInstallPackage,
  useUninstallPackage,
  useTogglePackage,
  useAddSource,
} from "@/hooks/useMarketplace";

import type { PluginInstallResult } from "@/hooks/useMarketplace";
import { InstallResultDialog } from "@/components/marketplace/InstallResultDialog";
import type { InstallResult } from "@/components/marketplace/InstallResultDialog";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { parseSourceInput } from "@/lib/marketplace/url-parser";
import {
  getMarketplaceProviderLabel,
  getMarketplaceProviderSupportLabel,
  getSupportedProvidersForMarketplaceType,
  isMarketplaceTypeSupportedForProvider,
} from "@/lib/marketplace/provider-support";
import type { ComponentDescriptor, MarketplaceItem } from "@/types/marketplace";
import type { ConfigProvider } from "@/types/provider";
import type { HookRule } from "@/lib/hooks/matcher";
import { cn } from "@/lib/utils";
import { useProviderScopeStore } from "@/stores/providerScopeStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPE_FILTERS = [
  { id: "marketplace-plugin", label: "Packages" },
  { id: "plugin", label: "Plugins" },
  { id: "mcp-server", label: "MCP Servers" },
  { id: "hook", label: "Hooks (Claude)" },
  { id: "skill", label: "Skills" },
  { id: "agent", label: "Agents" },
];
const DEFAULT_TYPE_FILTER = "marketplace-plugin";
const TYPE_FILTER_IDS = new Set(TYPE_FILTERS.map((opt) => opt.id));

const TYPE_LABEL_MAP: Record<string, string> = {
  "marketplace-plugin": "Packages",
  plugin: "Plugins",
  "mcp-server": "MCP Servers",
  hook: "Hooks (Claude)",
  skill: "Skills",
  agent: "Agents",
};

const TYPE_ORDER = [
  "marketplace-plugin",
  "plugin",
  "mcp-server",
  "hook",
  "skill",
  "agent",
];

type GroupedItems = { label: string; items: MarketplaceItem[] }[];

type ViewMode = "grid" | "list";

const POPULAR_SOURCES = [
  {
    name: "GitHub: anthropics",
    source_type: "github_org" as const,
    config: { org: "anthropics" },
    label: "anthropics",
  },
  {
    name: "GitHub: anthropic-community",
    source_type: "github_org" as const,
    config: { org: "anthropic-community" },
    label: "anthropic-community",
  },
  {
    name: "GitHub: modelcontextprotocol",
    source_type: "github_org" as const,
    config: { org: "modelcontextprotocol" },
    label: "modelcontextprotocol",
  },
];

function EmptyState({
  onPasteHint,
  onAddSource,
  addingSource,
}: {
  onPasteHint: () => void;
  onAddSource: (source: (typeof POPULAR_SOURCES)[number]) => void;
  addingSource: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Package size={28} className="text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium mb-1">Welcome to the Marketplace</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-6">
        Discover and install plugins, MCP servers, hooks, skills, and agents.
        Add a source to get started, or paste a GitHub URL into the search bar.
      </p>

      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <button
          onClick={onPasteHint}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors w-full text-left"
        >
          <Link size={14} className="text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            Paste a GitHub URL to add a source...
          </span>
        </button>

        <div className="w-full">
          <p className="text-xs text-muted-foreground mb-2">Popular sources</p>
          <div className="flex flex-col gap-1.5">
            {POPULAR_SOURCES.map((source) => (
              <button
                key={source.label}
                onClick={() => onAddSource(source)}
                disabled={addingSource}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors text-left"
              >
                <span className="text-xs font-medium">{source.label}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  Add <ArrowRight size={10} />
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketplacePageContent() {
  const searchParams = useSearchParams();
  const rawTypeParam = searchParams.get("type");
  const initialTypeFilter =
    rawTypeParam && TYPE_FILTER_IDS.has(rawTypeParam)
      ? rawTypeParam
      : DEFAULT_TYPE_FILTER;
  const [selectedSource, setSelectedSource] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [typeFilter, setTypeFilter] = useState(initialTypeFilter);
  const [installingName, setInstallingName] = useState<string | null>(null);
  const [installingAllName, setInstallingAllName] = useState<string | null>(null);
  const [uninstallingName, setUninstallingName] = useState<string | null>(null);
  const [togglingName, setTogglingName] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkInstalling, setBulkInstalling] = useState(false);
  const [detailItem, setDetailItem] = useState<MarketplaceItem | null>(null);
  const [hookPreviewItem, setHookPreviewItem] =
    useState<MarketplaceItem | null>(null);
  const providerScope = useProviderScopeStore((s) => s.providerScope);
  const queryClient = useQueryClient();
  const [installResult, setInstallResult] = useState<InstallResult | null>(
    null,
  );
  const [showSourceManager, setShowSourceManager] = useState(false);
  const { data: settingsData } = useSettings();
  const updateSettings = useUpdateSettings();

  // View mode toggle (grid/list) — persisted in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("marketplace-view") as ViewMode) || "grid";
    }
    return "grid";
  });

  useEffect(() => {
    localStorage.setItem("marketplace-view", viewMode);
  }, [viewMode]);

  // GitHub URL detection for quick-install
  const detectedSource = useMemo(() => {
    const parsed = parseSourceInput(searchInput);
    if (!parsed) return null;
    // Only show the prompt for GitHub URLs/slugs, not plain search terms
    if (
      parsed.source_type === "github_org" ||
      parsed.source_type === "github_repo"
    ) {
      // Only trigger for inputs that look like URLs or org/repo slugs (not plain single words that happen to match org pattern)
      const looksLikeUrl =
        searchInput.includes("github.com") || searchInput.includes("/");
      if (looksLikeUrl) return parsed;
    }
    return null;
  }, [searchInput]);

  const addSource = useAddSource();

  const handleQuickAddSource = useCallback(() => {
    if (!detectedSource) return;
    addSource.mutate(
      {
        name: detectedSource.suggestedName,
        source_type: detectedSource.source_type,
        config: detectedSource.config,
      },
      {
        onSuccess: () => {
          setSearchInput("");
          setSearchQuery("");
        },
      },
    );
  }, [detectedSource, addSource]);

  const handleAddPopularSource = useCallback(
    (source: (typeof POPULAR_SOURCES)[number]) => {
      addSource.mutate({
        name: source.name,
        source_type: source.source_type,
        config: source.config,
      });
    },
    [addSource],
  );

  const { data: sources = [] } = useMarketplaceSources();
  useEffect(() => {
    if (sources.length === 0) {
      if (selectedSource !== "") setSelectedSource("");
      return;
    }
    if (
      selectedSource &&
      !sources.some((source) => source.id === selectedSource)
    ) {
      setSelectedSource("");
    }
  }, [sources, selectedSource]);

  const {
    data: results = [],
    isLoading,
    isFetched,
  } = useMarketplaceSearch(
    selectedSource,
    searchQuery,
    typeFilter,
    providerScope,
  );
  const installPkg = useInstallPackage({
    onPluginInstalled: (name: string, result: PluginInstallResult) => {
      setInstallResult({
        name,
        agents: result.agents,
        skills: result.skills,
        commands: result.commands,
        targetProvider: result.targetProvider,
      });
    },
  });
  const uninstallPkg = useUninstallPackage();
  const togglePkg = useTogglePackage();

  const getItemKey = useCallback((item: MarketplaceItem) => {
    if (item.marketplaceRepo) return `${item.marketplaceRepo}:${item.name}`;
    return item.url || item.name;
  }, []);

  const canInstallInScope = useCallback(
    (item: MarketplaceItem) =>
      isMarketplaceTypeSupportedForProvider(item.type, providerScope),
    [providerScope],
  );

  const installDisabledReason = useCallback(
    (item: MarketplaceItem) => {
      if (canInstallInScope(item)) return undefined;
      return `${getMarketplaceProviderSupportLabel(item.type)}. Switch provider scope to install.`;
    },
    [canInstallInScope],
  );

  const isSelectable = useCallback(
    (item: MarketplaceItem) =>
      canInstallInScope(item) &&
      !item.installed &&
      item.type !== "hook" &&
      item.type !== "statusline",
    [canInstallInScope],
  );

  const isDetailable = useCallback((item: MarketplaceItem) => {
    if (item.type === "hook" && item.hookConfig) return true;
    return (
      !item.url.startsWith("builtin://") &&
      (!!item.repo || item.url.includes("github.com"))
    );
  }, []);

  const handleSelect = useCallback(
    (item: MarketplaceItem, selected: boolean) => {
      const key = getItemKey(item);
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (selected) next.add(key);
        else next.delete(key);
        return next;
      });
    },
    [getItemKey],
  );

  const handleSearch = () => setSearchQuery(searchInput);

  const buildInstallPayload = useCallback(
    (
      item: MarketplaceItem,
      targetProvider: ConfigProvider,
      components?: ComponentDescriptor[],
    ) => {
      const config: Record<string, unknown> = {};
      if (item.marketplaceRepo) config.marketplaceRepo = item.marketplaceRepo;
      if (item.installConfig) {
        if (item.type === "mcp-server") {
          config.command = item.installConfig.command;
          config.args = item.installConfig.args;
        } else {
          config.installConfig = item.installConfig;
        }
      }
      if (item.skillContent) config.skillContent = item.skillContent;
      if (item.sourcePath) config.sourcePath = item.sourcePath;
      if (item.defaultBranch) config.defaultBranch = item.defaultBranch;
      if (components && components.length > 0 && item.type !== "mcp-server") {
        config.components = components;
      }
      const installType =
        item.type === "mcp-server" && !item.installConfig ? "plugin" : item.type;
      return {
        type: installType,
        url: item.url,
        name: item.name,
        targetProvider,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      };
    },
    [],
  );

  const installPackageForProvider = useCallback(
    async (
      item: MarketplaceItem,
      targetProvider: ConfigProvider,
      components?: ComponentDescriptor[],
    ) => {
      await installPkg.mutateAsync(
        buildInstallPayload(item, targetProvider, components),
      );
    },
    [buildInstallPayload, installPkg],
  );

  const installPackage = useCallback(
    async (item: MarketplaceItem, components?: ComponentDescriptor[]) => {
      const disabledReason = installDisabledReason(item);
      if (disabledReason) {
        toast.error(disabledReason);
        return;
      }
      setInstallingName(getItemKey(item));
      try {
        await installPackageForProvider(item, providerScope, components);
      } finally {
        setInstallingName(null);
      }
    },
    [getItemKey, installDisabledReason, installPackageForProvider, providerScope],
  );

  const installPackageForProviders = useCallback(
    async (
      item: MarketplaceItem,
      targetProviders: readonly ConfigProvider[],
      components?: ComponentDescriptor[],
    ) => {
      const supportedProviders = getSupportedProvidersForMarketplaceType(item.type);
      const providers = Array.from(
        new Set(
          targetProviders.filter((provider) =>
            supportedProviders.includes(provider),
          ),
        ),
      );
      if (providers.length === 0) {
        toast.error("Select at least one supported provider.");
        return;
      }
      if (providers.length === 1 && providers[0] === providerScope) {
        await installPackage(item, components);
        return;
      }
      const key = getItemKey(item);
      setInstallingAllName(key);
      const succeeded: ConfigProvider[] = [];
      const failed: ConfigProvider[] = [];
      try {
        for (const provider of providers) {
          try {
            await installPackageForProvider(item, provider, components);
            succeeded.push(provider);
          } catch {
            failed.push(provider);
          }
        }
      } finally {
        setInstallingAllName(null);
      }

      if (succeeded.length > 0 && failed.length === 0) {
        toast.success(
          `Queued install for ${item.name} in ${succeeded
            .map(getMarketplaceProviderLabel)
            .join(", ")}.`,
        );
        return;
      }
      if (succeeded.length === 0 && failed.length > 0) {
        toast.error(
          `Failed to install ${item.name} for ${failed
            .map(getMarketplaceProviderLabel)
            .join(", ")}.`,
        );
        return;
      }
      if (succeeded.length > 0 && failed.length > 0) {
        toast.error(
          `Installed for ${succeeded
            .map(getMarketplaceProviderLabel)
            .join(", ")}. Failed for ${failed
            .map(getMarketplaceProviderLabel)
            .join(", ")}.`,
        );
      }
    },
    [
      getItemKey,
      installPackage,
      installPackageForProvider,
      providerScope,
    ],
  );

  const installPackageAllProviders = useCallback(
    async (item: MarketplaceItem, components?: ComponentDescriptor[]) => {
      await installPackageForProviders(
        item,
        getSupportedProvidersForMarketplaceType(item.type),
        components,
      );
    },
    [installPackageForProviders],
  );

  const handleInstall = (item: MarketplaceItem, components?: ComponentDescriptor[]) => {
    // Hooks require event/matcher config — route through the preview dialog
    if (item.type === "hook" && item.hookConfig) {
      setHookPreviewItem(item);
      return;
    }
    void installPackage(item, components);
  };

  const handleInstallAllProviders = (
    item: MarketplaceItem,
    components?: ComponentDescriptor[],
  ) => {
    void installPackageAllProviders(item, components);
  };

  const handleInstallProviders = (
    item: MarketplaceItem,
    providers: ConfigProvider[],
    components?: ComponentDescriptor[],
  ) => {
    void installPackageForProviders(item, providers, components);
  };

  const handleUninstall = async (item: MarketplaceItem) => {
    setUninstallingName(getItemKey(item));
    try {
      await uninstallPkg.mutateAsync({
        type: item.type,
        name: item.name,
        targetProvider: providerScope,
        marketplaceRepo: item.marketplaceRepo,
        url: item.url,
        sourcePath: item.sourcePath,
        defaultBranch: item.defaultBranch,
      });
    } finally {
      setUninstallingName(null);
    }
  };

  const handleToggleInstalled = async (item: MarketplaceItem) => {
    if (item.type !== "marketplace-plugin") return;
    setTogglingName(getItemKey(item));
    try {
      await togglePkg.mutateAsync({
        type: item.type,
        name: item.name,
        enabled: item.disabled === true,
        targetProvider: providerScope,
        marketplaceRepo: item.marketplaceRepo,
      });
    } finally {
      setTogglingName(null);
    }
  };

  const handleDetailClick = useCallback((item: MarketplaceItem) => {
    if (item.type === "hook" && item.hookConfig) {
      setHookPreviewItem(item);
      return;
    }
    if (isDetailable(item)) setDetailItem(item);
  }, [isDetailable]);

  const handleHookInstall = useCallback(
    async (config: HookPreviewConfig) => {
      if (!settingsData) return;
      // Guard: reject hooks missing required fields
      const h = config.hook;
      if (h.type === "command" && !h.command?.trim()) return;
      if ((h.type === "prompt" || h.type === "agent") && !h.prompt?.trim()) return;
      const hooks = (settingsData.hooks || {}) as Record<string, HookRule[]>;
      const eventRules: HookRule[] = [...(hooks[config.event] || [])];
      const newRule: HookRule = { hooks: [config.hook] };
      if (config.matcher) newRule.matcher = config.matcher;
      eventRules.push(newRule);
      await updateSettings.mutateAsync({
        hooks: { ...hooks, [config.event]: eventRules },
      });
      setHookPreviewItem(null);
    },
    [settingsData, updateSettings],
  );

  // Client-side type filter
  const filteredResults = useMemo(
    () => results.filter((r) => r.type === typeFilter),
    [results, typeFilter],
  );

  const selectedItems = useMemo(
    () =>
      filteredResults.filter((item) => selectedKeys.has(getItemKey(item))),
    [filteredResults, selectedKeys, getItemKey],
  );

  const installableSelected = useMemo(
    () => selectedItems.filter((item) => isSelectable(item)),
    [selectedItems, isSelectable],
  );

  const nonInstallableCount =
    selectedItems.length - installableSelected.length;

  const handleSelectAllVisible = useCallback(() => {
    const keys = new Set<string>();
    for (const item of filteredResults) {
      if (!isSelectable(item)) continue;
      keys.add(getItemKey(item));
    }
    setSelectedKeys(keys);
  }, [filteredResults, getItemKey, isSelectable]);

  const handleBulkInstall = useCallback(async () => {
    if (installableSelected.length === 0) return;
    setBulkInstalling(true);
    try {
      for (const item of installableSelected) {
        await installPackage(item);
      }
    } finally {
      setBulkInstalling(false);
      setSelectedKeys(new Set());
    }
  }, [installPackage, installableSelected]);

  // Grouped items for grid display
  const groupedItems = useMemo((): GroupedItems => {
    const buckets = new Map<string, MarketplaceItem[]>();
    for (const item of filteredResults) {
      const key = item.type || "unclassified";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }
    const knownTypes = new Set(TYPE_ORDER);
    const groups: GroupedItems = TYPE_ORDER.filter((t) => buckets.has(t)).map(
      (t) => ({
        label: TYPE_LABEL_MAP[t] || t,
        items: buckets.get(t)!,
      }),
    );
    // Catch-all for any types not in TYPE_ORDER (e.g. "unclassified")
    const remaining: MarketplaceItem[] = [];
    for (const [key, items] of buckets) {
      if (!knownTypes.has(key)) remaining.push(...items);
    }
    if (remaining.length > 0) {
      groups.push({ label: "Other", items: remaining });
    }
    return groups;
  }, [filteredResults]);

  // Count installed items for header
  const installedCount = useMemo(
    () => filteredResults.filter((r) => r.installed).length,
    [filteredResults],
  );

  const totalItems = groupedItems.reduce((sum, g) => sum + g.items.length, 0);
  const summaryStats = useMemo(() => {
    const parts = [
      `${sources.length} source${sources.length === 1 ? "" : "s"}`,
      `${totalItems} result${totalItems === 1 ? "" : "s"}`,
    ];
    if (installedCount > 0) {
      parts.push(`${installedCount} installed`);
    }
    return parts.join(" • ");
  }, [installedCount, sources.length, totalItems]);
  const showEmptyState =
    !isLoading &&
    isFetched &&
    totalItems === 0 &&
    !searchQuery &&
    sources.length === 0;

  const ViewComponent = viewMode === "list" ? PackageList : PackageGrid;
  const canInstallAllInScope = useCallback(
    (item: MarketplaceItem) =>
      !item.installed &&
      canInstallInScope(item) &&
      getSupportedProvidersForMarketplaceType(item.type).length > 1,
    [canInstallInScope],
  );
  const installAllTitle = useCallback((item: MarketplaceItem) => {
    const providers = getSupportedProvidersForMarketplaceType(item.type);
    if (providers.length <= 1) return undefined;
    return `Install in ${providers
      .map(getMarketplaceProviderLabel)
      .join(" + ")}`;
  }, []);
  const detailSupportedProviders = detailItem
    ? getSupportedProvidersForMarketplaceType(detailItem.type)
    : [];

  return (
    <PageContainer>
      <PageScaffold
        title="Marketplace"
        subtitle="Discover and install agents, skills, hooks, MCP servers, and bundled packages from GitHub-backed sources."
        filters={
          <div className="space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    ref={searchInputRef}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search packages, plugins, skills, or paste a GitHub URL…"
                    className="h-9 pl-8 text-sm"
                  />
                </div>
                <Button size="sm" className="h-9 text-xs sm:shrink-0" onClick={handleSearch}>
                  Search
                </Button>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-0.5">
                <span className="shrink-0 text-[11px] text-muted-foreground">Source</span>
                <div className="shrink-0">
                  <SourceBar
                    sources={sources}
                    selectedId={selectedSource}
                    onSelect={setSelectedSource}
                  />
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">Type</span>
                <div className="shrink-0">
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger size="sm" className="h-7 min-w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_FILTERS.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    {summaryStats}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" aria-label="Marketplace options">
                        <EllipsisVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuCheckboxItem
                        checked={viewMode === "grid"}
                        onCheckedChange={() => setViewMode("grid")}
                      >
                        <Grid3X3 size={13} className="mr-2" />
                        Grid view
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={viewMode === "list"}
                        onCheckedChange={() => setViewMode("list")}
                      >
                        <ListTree size={13} className="mr-2" />
                        List view
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          queryClient.invalidateQueries({
                            queryKey: ["marketplace-search"],
                          });
                        }}
                        disabled={isLoading}
                      >
                        <RefreshCw
                          size={13}
                          className={cn("mr-2", isLoading && "animate-spin")}
                        />
                        Refresh results
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowSourceManager(true)}>
                        <Plus size={13} className="mr-2" />
                        Manage sources
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground sm:hidden">
                {summaryStats}
              </p>
            </div>

            {detectedSource && (
              <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/70 px-3 py-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <Link size={13} className="shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs text-muted-foreground">
                    Add{" "}
                    <span className="font-medium text-foreground">
                      {Object.values(detectedSource.config)[0]}
                    </span>{" "}
                    as a source?
                  </span>
                </div>
                <Button
                  size="sm"
                  className="h-7 text-xs sm:ml-auto"
                  onClick={handleQuickAddSource}
                  disabled={addSource.isPending}
                >
                  <Plus size={10} className="mr-1" />
                  Add Source
                </Button>
              </div>
            )}
          </div>
        }
      >
        <SourcesDialog
          open={showSourceManager}
          onOpenChange={setShowSourceManager}
        />

        {!showEmptyState && (
          <div className="space-y-3">
            {(searchQuery || selectedItems.length > 0 || nonInstallableCount > 0) && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {searchQuery && (
                  <span>
                    Showing results for &quot;{searchQuery}&quot;
                    {selectedSource ? " in the selected source." : "."}
                  </span>
                )}
                {selectedItems.length > 0 && (
                  <Badge variant="warning">
                    {selectedItems.length} selected
                  </Badge>
                )}
                {nonInstallableCount > 0 && (
                  <Badge variant="outline">
                    {nonInstallableCount} not installable
                  </Badge>
                )}
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="sticky top-2 z-10 rounded-xl border border-primary/20 bg-card/95 p-3 shadow-sm backdrop-blur">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="warning">
                      {selectedItems.length} selected
                    </Badge>
                    <span className="text-muted-foreground">
                      Bulk install only applies to installable items.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleBulkInstall}
                      disabled={bulkInstalling || installableSelected.length === 0}
                    >
                      {bulkInstalling ? (
                        <Loader2 size={12} className="animate-spin mr-1" />
                      ) : (
                        <Download size={12} className="mr-1" />
                      )}
                      Install Selected
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={handleSelectAllVisible}
                    >
                      Select all visible
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => setSelectedKeys(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {showEmptyState ? (
          <div className="rounded-2xl border border-border/70 bg-card/95 p-2">
            <EmptyState
              onPasteHint={() => searchInputRef.current?.focus()}
              onAddSource={handleAddPopularSource}
              addingSource={addSource.isPending}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-card/95 p-4 sm:p-5">
            <ViewComponent
              groups={groupedItems}
              loading={isLoading}
              searched={isFetched}
              installingName={installingName}
              installingAllName={installingAllName}
              uninstallingName={uninstallingName}
              togglingName={togglingName}
              selectedKeys={selectedKeys}
              getKey={getItemKey}
              isSelectable={isSelectable}
              canInstall={canInstallInScope}
              canInstallAll={canInstallAllInScope}
              installAllTitle={installAllTitle}
              installDisabledReason={installDisabledReason}
              isDetailable={isDetailable}
              onSelect={handleSelect}
              onInstall={handleInstall}
              onInstallAll={handleInstallAllProviders}
              onUninstall={handleUninstall}
              onToggleInstalled={handleToggleInstalled}
              onDetails={handleDetailClick}
            />
          </div>
        )}

      <PluginDetailDialog
        item={detailItem}
        open={detailItem !== null}
        onOpenChange={(open) => {
          if (!open) setDetailItem(null);
        }}
        installing={installingName === (detailItem ? getItemKey(detailItem) : null)}
        installingAll={installingAllName === (detailItem ? getItemKey(detailItem) : null)}
        uninstalling={uninstallingName === (detailItem ? getItemKey(detailItem) : null)}
        toggling={togglingName === (detailItem ? getItemKey(detailItem) : null)}
        onInstall={(components) =>
          detailItem && handleInstall(detailItem, components)}
        onInstallProviders={
          detailItem && detailSupportedProviders.length > 1
            ? (providers, components) =>
                handleInstallProviders(detailItem, providers, components)
            : undefined
        }
        supportedProviders={[...detailSupportedProviders]}
        defaultProvider={providerScope}
        onUninstall={() => detailItem && handleUninstall(detailItem)}
        onToggleInstalled={() => detailItem && handleToggleInstalled(detailItem)}
      />

      {hookPreviewItem?.hookConfig && (
        <HookPreviewDialog
          open={!!hookPreviewItem}
          onOpenChange={(open) => {
            if (!open) setHookPreviewItem(null);
          }}
          name={hookPreviewItem.name}
          description={hookPreviewItem.description}
          category={hookPreviewItem.category}
          config={hookPreviewItem.hookConfig}
          installed={hookPreviewItem.installed}
          onInstall={handleHookInstall}
        />
      )}

      <InstallResultDialog
        result={installResult}
        open={installResult !== null}
        onClose={() => setInstallResult(null)}
      />
      </PageScaffold>
    </PageContainer>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <div className="h-10 bg-muted rounded animate-pulse" />
          <div className="h-64 bg-muted rounded animate-pulse" />
        </div>
      }
    >
      <MarketplacePageContent />
    </Suspense>
  );
}
