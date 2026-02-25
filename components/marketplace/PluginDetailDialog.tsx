"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Sparkles,
  Terminal,
  Download,
  Trash2,
  Loader2,
  Blocks,
  Workflow,
  Check,
  ChevronRight,
  ChevronDown,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Search,
  ExternalLink,
  Server,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ComponentDescriptor,
  MarketplaceItem,
  PackageDetails,
} from "@/types/marketplace";
import { useAnalyzePlugin } from "@/hooks/useMarketplace";
import type {
  SecurityAnalysisResult,
  SecurityFinding,
  RiskLevel,
} from "@/types/security-analysis";

interface PluginDetailDialogProps {
  item: MarketplaceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installing: boolean;
  installingAll?: boolean;
  uninstalling: boolean;
  onInstall: (components?: ComponentDescriptor[]) => void;
  onInstallAll?: (components?: ComponentDescriptor[]) => void;
  installAllLabel?: string;
  onUninstall: () => void;
}

function SectionList({
  label,
  icon,
  items,
  colorClass,
  selectedIds,
  onToggleSelect,
}: {
  label: string;
  icon: React.ReactNode;
  items: ComponentDescriptor[];
  colorClass: string;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const contentCache = useRef<Record<string, string>>({});
  const [loadingItem, setLoadingItem] = useState<string | null>(null);

  const toggleItem = useCallback(
    async (item: ComponentDescriptor) => {
      if (expandedItem === item.id) {
        setExpandedItem(null);
        return;
      }
      setExpandedItem(item.id);

      if (contentCache.current[item.id]) return;

      setLoadingItem(item.id);
      try {
        const res = await fetch(item.downloadUrl);
        const text = res.ok ? await res.text() : "Failed to load content.";
        contentCache.current[item.id] = text;
      } catch {
        contentCache.current[item.id] = "Failed to load content.";
      } finally {
        setLoadingItem(null);
      }
    },
    [expandedItem],
  );

  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </h4>
      <div className="space-y-1">
        {items.map((item) => {
          const isExpanded = expandedItem === item.id;
          const isLoading = loadingItem === item.id;
          const cached = contentCache.current[item.id];
          const selected = selectedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`rounded-md border transition-colors ${
                isExpanded ? "border-primary/20" : "border-border"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleItem(item)}
                className="flex items-start gap-2.5 w-full text-left px-3 py-2 hover:bg-muted/20 transition-colors rounded-md"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleSelect(item.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 h-3.5 w-3.5 rounded border border-border bg-background"
                  aria-label={`Select ${item.name}`}
                />
                <span className={`mt-0.5 shrink-0 ${colorClass}`}>
                  {icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono font-medium truncate">
                    {item.name}
                  </p>
                  {item.description && !isExpanded && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 text-[10px] px-1 py-0 font-mono"
                >
                  {formatTokenEstimate(item.estimatedTokens)}
                </Badge>
                <a
                  href={item.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  title="Open on GitHub"
                >
                  <ExternalLink size={12} />
                </a>
                <span className="mt-0.5 shrink-0 text-muted-foreground">
                  {isExpanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-2">
                  {isLoading && !cached ? (
                    <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                      <Loader2 size={12} className="animate-spin" />
                      Loading...
                    </div>
                  ) : cached ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 rounded-md p-2.5 max-h-[300px] overflow-y-auto">
                      {cached}
                    </pre>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((section) => (
        <div key={section} className="space-y-2">
          <Skeleton className="h-3 w-16" />
          {[1, 2].map((row) => (
            <div
              key={row}
              className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2"
            >
              <Skeleton className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const RISK_CONFIG: Record<
  RiskLevel,
  { icon: typeof ShieldCheck; className: string; label: string }
> = {
  low: { icon: ShieldCheck, className: "text-green-500", label: "Low Risk" },
  medium: {
    icon: ShieldAlert,
    className: "text-amber-500",
    label: "Medium Risk",
  },
  high: { icon: ShieldX, className: "text-red-500", label: "High Risk" },
};

const CATEGORY_LABELS: Record<string, string> = {
  "code-execution": "Code Execution",
  "file-system": "File System",
  network: "Network",
  "env-vars": "Env Vars",
  "prompt-injection": "Prompt Injection",
  "permission-escalation": "Permission Escalation",
};

function formatTokenEstimate(tokens?: number): string {
  if (!tokens || tokens <= 0) return "\u2014";
  return `~${tokens.toLocaleString()} tok`;
}

function SecurityAnalysisSection({ item }: { item: MarketplaceItem }) {
  const analyze = useAnalyzePlugin();

  const handleAnalyze = () => {
    analyze.mutate({
      type: item.type,
      url: item.url,
      name: item.name,
      marketplaceRepo: item.marketplaceRepo,
      defaultBranch: item.defaultBranch,
      repo: item.repo,
    });
  };

  const isRemoteAnalyzable = /^https?:\/\//i.test(item.url);

  if (!isRemoteAnalyzable) {
    return (
      <div className="border border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2">
        <p className="text-[11px] text-muted-foreground text-center">
          AI analysis is only available for remote GitHub packages/plugins.
        </p>
      </div>
    );
  }

  // Initial state
  if (!analyze.data && !analyze.isPending && !analyze.isError) {
    return (
      <div className="border border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAnalyze}
          className="gap-1.5"
        >
          <Shield size={14} />
          Analyze before installing
        </Button>
        <p className="text-[11px] text-muted-foreground">
          AI-powered security review of plugin content
        </p>
      </div>
    );
  }

  // Loading
  if (analyze.isPending) {
    return (
      <div className="border border-border rounded-lg p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={14} className="animate-spin" />
        Analyzing plugin content for security risks...
      </div>
    );
  }

  // Error
  if (analyze.isError) {
    return (
      <div className="border border-destructive/30 rounded-lg p-4 space-y-2">
        <p className="text-sm text-destructive">
          {analyze.error?.message || "Analysis failed"}
        </p>
        <Button variant="outline" size="sm" onClick={handleAnalyze}>
          Retry
        </Button>
      </div>
    );
  }

  // Results
  const result = analyze.data as SecurityAnalysisResult;
  const riskCfg = RISK_CONFIG[result.overallRisk];
  const RiskIcon = riskCfg.icon;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b border-border">
        <RiskIcon size={16} className={riskCfg.className} />
        <span className={`text-sm font-medium ${riskCfg.className}`}>
          {riskCfg.label}
        </span>
      </div>

      <div className="p-3 space-y-3">
        {/* Summary */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {result.summary}
        </p>

        {/* Findings */}
        {result.findings.length > 0 && (
          <div className="space-y-2">
            {result.findings.map((finding: SecurityFinding, i: number) => {
              const severityCfg = RISK_CONFIG[finding.severity];
              const SeverityIcon = severityCfg.icon;
              return (
                <div
                  key={`${finding.category}-${i}`}
                  className="flex items-start gap-2 text-xs"
                >
                  <SeverityIcon
                    size={12}
                    className={`mt-0.5 shrink-0 ${severityCfg.className}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium">{finding.title}</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1 py-0"
                      >
                        {CATEGORY_LABELS[finding.category] || finding.category}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5">
                      {finding.detail}
                    </p>
                    {finding.evidence && (
                      <pre className="mt-1 px-2 py-1 bg-muted/40 rounded text-[10px] font-mono whitespace-pre-wrap overflow-x-auto">
                        {finding.evidence}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function groupComponents(
  components: ComponentDescriptor[],
  filter: string,
): {
  agents: ComponentDescriptor[];
  skills: ComponentDescriptor[];
  commands: ComponentDescriptor[];
  mcps: ComponentDescriptor[];
} {
  const q = filter.toLowerCase();
  const filtered = q
    ? components.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q),
      )
    : components;
  return {
    agents: filtered.filter((c) => c.kind === "agent"),
    skills: filtered.filter((c) => c.kind === "skill"),
    commands: filtered.filter((c) => c.kind === "command"),
    mcps: filtered.filter((c) => c.kind === "mcp-server"),
  };
}

function parseRepoFromItem(item: MarketplaceItem | null): {
  owner: string;
  repo: string;
} | null {
  if (!item) return null;
  if (item.repo) return { owner: item.repo.owner, repo: item.repo.name };
  const match = item.url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function getDetailsCacheKey(item: MarketplaceItem): string | null {
  const repo = parseRepoFromItem(item);
  if (!repo) return null;
  return `${repo.owner}/${repo.repo}@${item.defaultBranch || "__default"}:${item.sourcePath || ""}`;
}

export function PluginDetailDialog({
  item,
  open,
  onOpenChange,
  installing,
  installingAll = false,
  uninstalling,
  onInstall,
  onInstallAll,
  installAllLabel,
  onUninstall,
}: PluginDetailDialogProps) {
  const [details, setDetails] = useState<PackageDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [componentFilter, setComponentFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const detailsCacheRef = useRef<Map<string, PackageDetails>>(new Map());

  useEffect(() => {
    if (!open || !item) return;
    const currentItem = item;
    const cacheKey = getDetailsCacheKey(currentItem);
    if (cacheKey) {
      const cached = detailsCacheRef.current.get(cacheKey);
      if (cached) {
        setDetails(cached);
        setLoading(false);
        setComponentFilter("");
        setSelectedIds(new Set(cached.components.map((component) => component.id)));
        return;
      }
    }

    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setComponentFilter("");
    setSelectedIds(new Set());

    async function fetchDetails() {
      try {
        const repo = parseRepoFromItem(currentItem);
        if (!repo) {
          if (!cancelled) setDetails(null);
          return;
        }
        const params = new URLSearchParams({
          owner: repo.owner,
          repo: repo.repo,
        });
        if (currentItem.defaultBranch) params.set("branch", currentItem.defaultBranch);
        if (currentItem.sourcePath) params.set("sourcePath", currentItem.sourcePath);
        const res = await fetch(`/api/marketplace/plugin-details?${params}`);
        if (!res.ok) {
          if (!cancelled) setDetails(null);
          return;
        }
        const d = (await res.json()) as PackageDetails;
        if (!cancelled) {
          setDetails(d);
          if (cacheKey) {
            detailsCacheRef.current.set(cacheKey, d);
            if (detailsCacheRef.current.size > 50) {
              const oldest = detailsCacheRef.current.keys().next();
              if (!oldest.done) detailsCacheRef.current.delete(oldest.value);
            }
          }
        }
      } catch {
        if (!cancelled) setDetails(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchDetails();
    return () => {
      cancelled = true;
    };
  }, [open, item]);

  useEffect(() => {
    if (!details?.components?.length) return;
    const nextIds = new Set(details.components.map((c) => c.id));
    setSelectedIds((prev) => {
      if (prev.size !== nextIds.size) return nextIds;
      for (const id of prev) {
        if (!nextIds.has(id)) return nextIds;
      }
      return prev;
    });
  }, [details?.components]);

  const grouped = useMemo(() => {
    if (!details) return null;
    return groupComponents(details.components, componentFilter);
  }, [details, componentFilter]);

  if (!item) return null;

  const displayName = item.marketplaceRepo
    ? `${item.marketplaceRepo.split("/")[0]}:${item.name}`
    : item.name;

  const typeIcon =
    item.category === "workflows" ? (
      <Workflow size={16} />
    ) : (item.components?.agents ?? 0) > 1 ? (
      <Blocks size={16} />
    ) : (
      <Bot size={16} />
    );

  const totalComponents = details?.components.length || 0;
  const selectedComponents = details
    ? details.components.filter((c) => selectedIds.has(c.id))
    : [];
  const selectionCount = selectedComponents.length;

  const componentSummaryParts: string[] = [];
  if (details?.components.filter((c) => c.kind === "agent").length)
    componentSummaryParts.push(
      `${details.components.filter((c) => c.kind === "agent").length} agent${details.components.filter((c) => c.kind === "agent").length !== 1 ? "s" : ""}`,
    );
  if (details?.components.filter((c) => c.kind === "skill").length)
    componentSummaryParts.push(
      `${details.components.filter((c) => c.kind === "skill").length} skill${details.components.filter((c) => c.kind === "skill").length !== 1 ? "s" : ""}`,
    );
  if (details?.components.filter((c) => c.kind === "command").length)
    componentSummaryParts.push(
      `${details.components.filter((c) => c.kind === "command").length} command${details.components.filter((c) => c.kind === "command").length !== 1 ? "s" : ""}`,
    );
  if (details?.components.filter((c) => c.kind === "mcp-server").length)
    componentSummaryParts.push(
      `${details.components.filter((c) => c.kind === "mcp-server").length} MCP server${details.components.filter((c) => c.kind === "mcp-server").length !== 1 ? "s" : ""}`,
    );
  const componentSummary = componentSummaryParts.join(", ");
  const estimatedTokensTotal = details
    ? details.estimatedTokensTotal ??
      details.components.reduce(
        (sum, component) => sum + (component.estimatedTokens || 0),
        0,
      )
    : 0;
  const selectedEstimatedTokens = selectedComponents.reduce(
    (sum, component) => sum + (component.estimatedTokens || 0),
    0,
  );

  const installDisabled =
    totalComponents > 0 && selectionCount === 0;
  const installLabel =
    selectionCount > 0 && selectionCount < totalComponents
      ? `Install Selected (${selectionCount})`
      : "Install";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="text-chart-4">{typeIcon}</span>
            {displayName}
            {item.installed && (
              <span className="flex items-center gap-0.5 text-meta text-green-500 font-normal">
                <Check size={10} />
                Installed
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item.description}
          </DialogDescription>
          <div className="flex items-center gap-1.5 pt-1">
            {item.category && (
              <Badge
                variant="outline"
                className={
                  item.category === "workflows"
                    ? "text-meta text-amber-500 border-amber-500/30"
                    : "text-meta text-muted-foreground"
                }
              >
                {item.category === "workflows" ? "workflow" : item.category}
              </Badge>
            )}
            {item.components?.agents ? (
              <Badge
                variant="outline"
                className="text-meta text-chart-2 border-chart-2/30"
              >
                {item.components.agents} agent
                {item.components.agents !== 1 ? "s" : ""}
              </Badge>
            ) : null}
            {item.components?.skills ? (
              <Badge
                variant="outline"
                className="text-meta text-chart-5 border-chart-5/30"
              >
                {item.components.skills} skill
                {item.components.skills !== 1 ? "s" : ""}
              </Badge>
            ) : null}
            {item.components?.commands ? (
              <Badge
                variant="outline"
                className="text-meta text-chart-3 border-chart-3/30"
              >
                {item.components.commands} cmd
                {item.components.commands !== 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {loading ? (
            <LoadingSkeleton />
          ) : grouped && details ? (
            <>
              {totalComponents > 0 && (
                <p className="text-xs text-muted-foreground">
                  {componentSummary}
                  {estimatedTokensTotal > 0 && (
                    <>
                      {" \u00b7 "}
                      <span className="font-mono">
                        {formatTokenEstimate(estimatedTokensTotal)}
                      </span>
                    </>
                  )}
                </p>
              )}

              {totalComponents >= 5 && (
                <div className="relative">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    value={componentFilter}
                    onChange={(e) => setComponentFilter(e.target.value)}
                    placeholder="Filter components..."
                    className="w-full h-7 text-xs pl-7 rounded border border-border bg-background px-2"
                  />
                </div>
              )}

              {totalComponents > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    onClick={() =>
                      setSelectedIds(
                        new Set(details.components.map((c) => c.id)),
                      )
                    }
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground/50">•</span>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear
                  </button>
                  <span className="text-muted-foreground/50">•</span>
                  <span>{selectionCount} selected</span>
                  {selectionCount > 0 && (
                    <>
                      <span className="text-muted-foreground/50">•</span>
                      <span className="font-mono">
                        {formatTokenEstimate(selectedEstimatedTokens)}
                      </span>
                    </>
                  )}
                </div>
              )}

              <SectionList
                label="Agents"
                icon={<Bot size={14} />}
                items={grouped.agents}
                colorClass="text-chart-2"
                selectedIds={selectedIds}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
              />
              <SectionList
                label="Skills"
                icon={<Sparkles size={14} />}
                items={grouped.skills}
                colorClass="text-chart-5"
                selectedIds={selectedIds}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
              />
              <SectionList
                label="Commands"
                icon={<Terminal size={14} />}
                items={grouped.commands}
                colorClass="text-chart-3"
                selectedIds={selectedIds}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
              />
              <SectionList
                label="MCP Servers"
                icon={<Server size={14} />}
                items={grouped.mcps}
                colorClass="text-blue-500"
                selectedIds={selectedIds}
                onToggleSelect={(id) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })}
              />

              {totalComponents === 0 &&
                !componentFilter &&
                (details.readme ? (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      README
                    </h4>
                    <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 rounded-md p-2.5 max-h-[300px] overflow-y-auto">
                      {details.readme}
                    </pre>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No components found in this package.
                  </p>
                ))}
              {componentFilter &&
                grouped.agents.length === 0 &&
                grouped.skills.length === 0 &&
                grouped.commands.length === 0 &&
                grouped.mcps.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No components match &ldquo;{componentFilter}&rdquo;
                  </p>
                )}
            </>
          ) : null}
          {!item.installed && (
            <SecurityAnalysisSection key={`${item.type}:${item.url}`} item={item} />
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {item.installed ? (
            <Button
              size="sm"
              className="h-8"
              onClick={onUninstall}
              disabled={uninstalling}
            >
              {uninstalling ? (
                <Loader2 size={12} className="animate-spin mr-1.5" />
              ) : (
                <Trash2 size={12} className="mr-1.5" />
              )}
              Uninstall
            </Button>
          ) : (
            <>
              {onInstallAll && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() =>
                    onInstallAll(
                      selectionCount > 0 ? selectedComponents : undefined,
                    )}
                  disabled={installingAll || installing || installDisabled || loading}
                >
                  {installingAll ? (
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                  ) : (
                    <Download size={12} className="mr-1.5" />
                  )}
                  {installAllLabel || "Install to all providers"}
                </Button>
              )}
              <Button
                size="sm"
                className="h-8"
                onClick={() =>
                  onInstall(selectionCount > 0 ? selectedComponents : undefined)}
                disabled={installing || installDisabled || loading}
              >
                {installing ? (
                  <Loader2 size={12} className="animate-spin mr-1.5" />
                ) : (
                  <Download size={12} className="mr-1.5" />
                )}
                {installLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
