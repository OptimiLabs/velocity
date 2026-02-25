"use client";

import {
  Cable,
  Loader2,
  Radar,
  Info,
  FileCheck,
  Zap,
  Bot,
  BookOpen,
  Globe,
  FolderOpen,
  Filter,
  Network,
  Maximize2,
  Minimize2,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useRoutingStore,
  type RoutingEdgeType,
  type RoutingNodeType,
  ROUTING_EDGE_FOCUS_TYPES,
} from "@/stores/routingStore";
import type {
  RoutingGraph,
  RoutingEntrypoint,
} from "@/types/routing-graph";
import { ProviderFilter } from "@/components/ui/provider-filter";
import { getSessionProvider } from "@/lib/providers/session-registry";

interface RoutingToolbarProps {
  onScan: () => void;
  isScanning: boolean;
  graph: RoutingGraph | null;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  entrypoints: RoutingEntrypoint[];
  showGlobalToggle: boolean;
  showGlobalNodes: boolean;
  onToggleGlobalNodes: () => void;
  isFullscreen?: boolean;
  knowledgeFilesVisible?: boolean;
  onToggleKnowledgeFiles?: () => void;
  detailPanelOpen?: boolean;
  onToggleDetailPanel?: () => void;
  onToggleFullscreen?: () => void;
}

const NODE_TYPE_FILTERS: {
  type: RoutingNodeType;
  icon: typeof FileCheck;
  label: string;
}[] = [
  { type: "claude-md", icon: FileCheck, label: "Entry Files" },
  { type: "skill", icon: Zap, label: "Skills" },
  { type: "agent", icon: Bot, label: "Agents" },
  { type: "knowledge", icon: BookOpen, label: "Knowledge" },
  { type: "folder", icon: FolderOpen, label: "Folders" },
  { type: "entrypoint", icon: Network, label: "Entrypoints" },
];

const EDGE_TYPE_FILTERS: {
  type: RoutingEdgeType;
  label: string;
  hint: string;
  swatchClass: string;
}[] = [
  {
    type: "reference",
    label: "References",
    hint: "Path and mention links",
    swatchClass: "bg-zinc-500",
  },
  {
    type: "manual",
    label: "Manual",
    hint: "User-linked edges",
    swatchClass: "bg-violet-500",
  },
  {
    type: "contains",
    label: "Contains",
    hint: "Folder structure edges",
    swatchClass: "bg-zinc-400",
  },
  {
    type: "table-entry",
    label: "Table",
    hint: "Structured index rows",
    swatchClass: "bg-teal-500",
  },
  {
    type: "entrypoint",
    label: "Entrypoints",
    hint: "Root/provider scaffolding",
    swatchClass: "bg-blue-500",
  },
];

function entrypointLabel(ep: RoutingEntrypoint, showProvider: boolean): string {
  const providerLabel = getSessionProvider(ep.provider)?.label ?? ep.provider;
  const providerSuffix = showProvider ? ` (${providerLabel})` : "";
  if (!ep.projectRoot) return `${ep.label} (global)${providerSuffix}`;
  const projectName = ep.projectRoot.split("/").pop() || ep.projectRoot;
  return `${projectName} · ${ep.label}${providerSuffix}`;
}

export function RoutingToolbar({
  onScan,
  isScanning,
  graph,
  visibleNodeCount,
  visibleEdgeCount,
  entrypoints,
  showGlobalToggle,
  showGlobalNodes,
  onToggleGlobalNodes,
  isFullscreen = false,
  knowledgeFilesVisible = false,
  onToggleKnowledgeFiles,
  detailPanelOpen = true,
  onToggleDetailPanel,
  onToggleFullscreen,
}: RoutingToolbarProps) {
  const {
    canvasMode,
    setCanvasMode,
    graphScope,
    setGraphScope,
    visibleNodeTypes,
    toggleNodeType,
    visibleEdgeTypes,
    toggleEdgeType,
    setEdgeFocusMode,
    setAllEdgeTypes,
    triggerSearchFocus,
    toggleFullscreen,
    activeProvider,
    setActiveProvider,
  } = useRoutingStore();

  const totalFilters = NODE_TYPE_FILTERS.length + (showGlobalToggle ? 1 : 0);
  const activeFilters =
    NODE_TYPE_FILTERS.filter((f) => visibleNodeTypes.has(f.type)).length +
    (showGlobalToggle && showGlobalNodes ? 1 : 0);

  const totalEdgeFilters = EDGE_TYPE_FILTERS.length;
  const activeEdgeFilters = EDGE_TYPE_FILTERS.filter((f) =>
    visibleEdgeTypes.has(f.type),
  ).length;
  const isEdgeFocusMode =
    visibleEdgeTypes.size === ROUTING_EDGE_FOCUS_TYPES.length &&
    ROUTING_EDGE_FOCUS_TYPES.every((type) => visibleEdgeTypes.has(type));

  const showProviderInEntrypointLabel = activeProvider === "all";

  return (
    <div className="shrink-0 border-b border-border/50 bg-background/70 px-4 py-2.5">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
          <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1">
            <span className="h-2 w-2 rounded-full bg-chart-2 shadow-[0_0_0_3px] shadow-chart-2/15" />
            <div className="leading-tight">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                Knowledge
              </div>
              <div className="text-xs font-medium text-foreground">
                Routing Graph
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <ProviderFilter
              value={activeProvider === "all" ? null : activeProvider}
              onChange={(p) => setActiveProvider(p ?? "all")}
            />
          </div>

          {entrypoints.length > 0 && (
            <div className="max-w-full shrink-0">
              <Select
                value={graphScope}
                onValueChange={(nextScope) => {
                  setGraphScope(nextScope);
                  triggerSearchFocus();
                }}
              >
                <SelectTrigger
                  size="sm"
                  className="max-w-[240px] text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All entrypoints</SelectItem>
                  {entrypoints.map((ep) => (
                    <SelectItem key={ep.id} value={ep.id}>
                      {entrypointLabel(ep, showProviderInEntrypointLabel)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5">
                <Filter size={14} />
                Nodes
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                    activeFilters < totalFilters
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {activeFilters}/{totalFilters}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" align="start">
              <div className="space-y-0.5">
                {NODE_TYPE_FILTERS.map(({ type, icon: Icon, label }) => {
                  const active = visibleNodeTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        toggleNodeType(type);
                        triggerSearchFocus();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "text-foreground hover:bg-muted/80"
                          : "text-muted-foreground/50 line-through hover:bg-muted/50",
                      )}
                    >
                      <Icon
                        size={13}
                        className={
                          active ? "text-foreground" : "text-muted-foreground/40"
                        }
                      />
                      <span className="flex-1 text-left">{label}</span>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          active ? "bg-primary" : "bg-muted-foreground/20",
                        )}
                      />
                    </button>
                  );
                })}
                {showGlobalToggle && (
                  <>
                    <div className="my-1 border-t border-border/40" />
                    <button
                      onClick={() => {
                        onToggleGlobalNodes();
                        triggerSearchFocus();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                        showGlobalNodes
                          ? "text-foreground hover:bg-muted/80"
                          : "text-muted-foreground/50 line-through hover:bg-muted/50",
                      )}
                    >
                      <Globe
                        size={13}
                        className={
                          showGlobalNodes
                            ? "text-foreground"
                            : "text-muted-foreground/40"
                        }
                      />
                      <span className="flex-1 text-left">Global</span>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          showGlobalNodes
                            ? "bg-primary"
                            : "bg-muted-foreground/20",
                        )}
                      />
                    </button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="shrink-0 gap-1.5">
                <GitBranch size={14} />
                Edges
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums",
                    activeEdgeFilters < totalEdgeFilters
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {activeEdgeFilters}/{totalEdgeFilters}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="mb-2 flex items-center gap-1">
                <button
                  onClick={setEdgeFocusMode}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    isEdgeFocusMode
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  Focus
                </button>
                <button
                  onClick={setAllEdgeTypes}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                    activeEdgeFilters === totalEdgeFilters
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  All
                </button>
              </div>
              <div className="space-y-0.5">
                {EDGE_TYPE_FILTERS.map(({ type, label, hint, swatchClass }) => {
                  const active = visibleEdgeTypes.has(type);
                  return (
                    <button
                      key={type}
                      onClick={() => toggleEdgeType(type)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "text-foreground hover:bg-muted/80"
                          : "text-muted-foreground/50 hover:bg-muted/50",
                      )}
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          swatchClass,
                          !active && "opacity-35",
                        )}
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <div className={cn(active ? "" : "line-through")}>
                          {label}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground/70">
                          {hint}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          active ? "bg-primary" : "bg-muted-foreground/20",
                        )}
                      />
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>

          {canvasMode === "connect" ? (
            <div className="animate-in fade-in flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              <Cable size={12} />
              Connect Mode
              <button
                onClick={() => setCanvasMode("browse")}
                className="ml-1 text-primary/60 hover:text-primary"
              >
                x
              </button>
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setCanvasMode("connect")}
                  >
                    <Cable size={14} className="mr-1.5" />
                    Connect
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Draw connections between nodes by dragging. Double-click an edge
                  to remove it.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1.5">
          {onToggleKnowledgeFiles && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={knowledgeFilesVisible ? "default" : "outline"}
                    className="shrink-0"
                    onClick={onToggleKnowledgeFiles}
                  >
                    <FolderOpen size={14} className="mr-1.5" />
                    Files
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle knowledge files panel</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {onToggleDetailPanel && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={detailPanelOpen ? "default" : "outline"}
                    className="shrink-0"
                    onClick={onToggleDetailPanel}
                  >
                    <Info size={14} className="mr-1.5" />
                    Inspector
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {detailPanelOpen
                    ? "Hide selected file details"
                    : "Show selected file details"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={onScan}
                  disabled={isScanning}
                >
                  {isScanning ? (
                    <Loader2 size={14} className="mr-1.5 animate-spin" />
                  ) : (
                    <Radar size={14} className="mr-1.5" />
                  )}
                  {isScanning ? "Scanning..." : "Scan"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Index provider instruction files (CLAUDE.md, AGENTS.md, GEMINI.md)
                and map their references into a graph
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={onToggleFullscreen ?? toggleFullscreen}
                >
                  {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="mt-2 flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5">
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-2 py-1">
            <span className="text-meta tabular-nums text-foreground">
              {visibleNodeCount}
            </span>
            <span className="text-meta text-muted-foreground">nodes</span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-meta tabular-nums text-foreground">
              {visibleEdgeCount}
            </span>
            <span className="text-meta text-muted-foreground">edges</span>
          </div>

          {graph && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                  <Info size={12} />
                  <span>Details</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visible nodes</span>
                    <span className="font-medium tabular-nums">
                      {visibleNodeCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visible edges</span>
                    <span className="font-medium tabular-nums">
                      {visibleEdgeCount}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total discovered</span>
                    <span className="font-medium tabular-nums">
                      {graph.nodes.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last scanned</span>
                    <span className="font-medium">
                      {new Date(graph.lastScannedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Scan duration</span>
                    <span className="font-medium tabular-nums">
                      {(graph.scanDurationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
