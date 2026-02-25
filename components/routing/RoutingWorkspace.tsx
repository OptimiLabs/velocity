"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useRoutingGraph,
  useEntrypoints,
  useScanRoutingGraph,
} from "@/hooks/useRoutingGraph";
import { useSidebarResize } from "@/hooks/useSidebarResize";
import { useRoutingStore } from "@/stores/routingStore";
import { buildXYFlowGraph } from "@/lib/routing/graph-builder";
import { cn } from "@/lib/utils";
import { RoutingToolbar } from "./RoutingToolbar";
import { RoutingSidebar } from "./RoutingSidebar";
import { RoutingCanvas } from "./RoutingCanvas";
import { RoutingDetailPanel } from "./RoutingDetailPanel";
import { ScanProgressOverlay } from "./ScanProgressOverlay";

const DETAIL_PANEL_STORAGE_KEY = "routing-detail-panel-open";

export function RoutingWorkspace() {
  const {
    canvasMode,
    setCanvasMode,
    selectedNodeId,
    setSelectedNodeId,
    setSelectedFilePath,
    graphScope,
    layoutMode,
    visibleNodeTypes,
    visibleEdgeTypes,
    showGlobalNodes,
    setShowGlobalNodes,
    collapsedFolders,
    triggerSearchFocus,
    isFullscreen,
    toggleFullscreen,
    activeProvider,
  } = useRoutingStore();

  // Resolve provider param for API calls (undefined for "all")
  const providerParam = activeProvider === "all" ? undefined : activeProvider;

  // Data: entrypoints for scope picker
  const { data: entrypoints } = useEntrypoints(providerParam);

  // Data: knowledge graph (server-scoped by entrypoint and provider)
  const { data: scopedGraph } = useRoutingGraph(graphScope, providerParam);

  // Determine if viewing a project scope (vs "all")
  const isProjectScope = useMemo(() => {
    if (graphScope === "all") return false;
    const ep = entrypoints?.find((e) => e.id === graphScope);
    return ep?.projectRoot != null;
  }, [graphScope, entrypoints]);

  // Filter out global nodes when toggle is off
  const filteredGraph = useMemo(() => {
    if (!scopedGraph) return null;
    if (!isProjectScope || showGlobalNodes) return scopedGraph;
    const nodes = scopedGraph.nodes.filter((n) => n.projectRoot !== null);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = scopedGraph.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );
    return { ...scopedGraph, nodes, edges };
  }, [scopedGraph, isProjectScope, showGlobalNodes]);

  // If filters/scope remove the selected node, close the stale detail panel.
  useEffect(() => {
    if (!selectedNodeId) return;
    if (!filteredGraph) return;
    const stillVisible = filteredGraph.nodes.some((n) => n.id === selectedNodeId);
    if (stillVisible) return;
    setSelectedNodeId(null);
    setSelectedFilePath(null);
  }, [filteredGraph, selectedNodeId, setSelectedNodeId, setSelectedFilePath]);

  // Scan
  const { startScan, cancelScan, progress, isScanning } =
    useScanRoutingGraph();
  const [showOverlay, setShowOverlay] = useState(false);
  const [fullscreenFilesOpen, setFullscreenFilesOpen] = useState(false);
  const [detailPanelOpen, setDetailPanelOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem(DETAIL_PANEL_STORAGE_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const handleSetDetailPanelOpen = useCallback((open: boolean) => {
    setDetailPanelOpen(open);
    try {
      localStorage.setItem(DETAIL_PANEL_STORAGE_KEY, String(open));
    } catch {
      // ignore storage access issues
    }
  }, []);

  // Sidebar resize
  const { sidebarWidth, sidebarCollapsed, handleDragStart, toggleCollapse } =
    useSidebarResize("routing-sidebar-width");

  // Build xyflow graph from filtered graph
  const flowData = useMemo(() => {
    if (!filteredGraph) return { nodes: [], edges: [] };
    return buildXYFlowGraph(filteredGraph, {
      layoutMode,
      visibleNodeTypes,
      visibleEdgeTypes,
      collapsedFolders,
      provider: activeProvider,
    });
  }, [
    filteredGraph,
    layoutMode,
    visibleNodeTypes,
    visibleEdgeTypes,
    collapsedFolders,
    activeProvider,
  ]);

  const handleScan = useCallback(() => {
    setShowOverlay(true);
    startScan(activeProvider);
  }, [startScan, activeProvider]);

  const handleDismissOverlay = useCallback(() => {
    setShowOverlay(false);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (isFullscreen) {
      setFullscreenFilesOpen(false);
    }
    toggleFullscreen();
  }, [isFullscreen, toggleFullscreen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        triggerSearchFocus();
      }

      if (e.key === "Escape") {
        if (isFullscreen && fullscreenFilesOpen) {
          setFullscreenFilesOpen(false);
        } else if (isFullscreen) {
          handleToggleFullscreen();
        } else if (selectedNodeId && detailPanelOpen) {
          handleSetDetailPanelOpen(false);
        } else if (canvasMode !== "browse") {
          setCanvasMode("browse");
        } else if (selectedNodeId) {
          setSelectedNodeId(null);
          setSelectedFilePath(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    canvasMode,
    setCanvasMode,
    selectedNodeId,
    setSelectedNodeId,
    setSelectedFilePath,
    triggerSearchFocus,
    isFullscreen,
    handleToggleFullscreen,
    fullscreenFilesOpen,
    detailPanelOpen,
    handleSetDetailPanelOpen,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(1200px_500px_at_20%_-10%,rgba(59,130,246,0.08),transparent),radial-gradient(900px_400px_at_100%_0%,rgba(16,185,129,0.06),transparent)]">
      <div
        className={cn(
          "shrink-0",
          isFullscreen
            ? "border-b border-border/50 bg-background/85 backdrop-blur"
            : "px-2 pt-2",
        )}
      >
        <div
          className={cn(
            !isFullscreen &&
              "rounded-xl border border-border/60 bg-background/80 shadow-sm backdrop-blur",
          )}
        >
          <RoutingToolbar
            onScan={handleScan}
            isScanning={isScanning}
            graph={filteredGraph}
            visibleNodeCount={flowData.nodes.length}
            visibleEdgeCount={flowData.edges.length}
            entrypoints={entrypoints ?? []}
            showGlobalToggle={isProjectScope}
            showGlobalNodes={showGlobalNodes}
            onToggleGlobalNodes={() => setShowGlobalNodes(!showGlobalNodes)}
            isFullscreen={isFullscreen}
            knowledgeFilesVisible={fullscreenFilesOpen}
            onToggleKnowledgeFiles={
              isFullscreen
                ? () => setFullscreenFilesOpen((prev) => !prev)
                : undefined
            }
            onToggleFullscreen={handleToggleFullscreen}
          />
        </div>
      </div>

      <div className={cn("relative flex flex-1 min-h-0 overflow-hidden", !isFullscreen && "p-2")}>
        <div
          className={cn(
            "relative flex flex-1 min-h-0 overflow-hidden",
            isFullscreen
              ? "bg-background"
              : "rounded-xl border border-border/60 bg-background/75 shadow-sm backdrop-blur",
          )}
        >
          {!isFullscreen && (
            <RoutingSidebar
              nodes={filteredGraph?.nodes ?? []}
              width={sidebarWidth}
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleCollapse}
              onResizeStart={handleDragStart}
            />
          )}

          {isFullscreen && fullscreenFilesOpen && (
            <>
              <button
                type="button"
                aria-label="Close knowledge files panel"
                className="absolute inset-0 z-20 bg-background/35"
                onClick={() => setFullscreenFilesOpen(false)}
              />
              <div className="absolute left-0 top-0 bottom-0 z-30 border-r border-border/50 bg-background/95 shadow-2xl backdrop-blur-md">
                <RoutingSidebar
                  nodes={filteredGraph?.nodes ?? []}
                  width={sidebarWidth}
                  collapsed={false}
                  onToggleCollapse={() => setFullscreenFilesOpen(false)}
                  onResizeStart={handleDragStart}
                />
              </div>
            </>
          )}

          <RoutingCanvas
            flowNodes={flowData.nodes}
            flowEdges={flowData.edges}
            graph={
              filteredGraph ?? {
                version: 1,
                lastScannedAt: "",
                scanDurationMs: 0,
                totalTokensUsed: 0,
                nodes: [],
                edges: [],
              }
            }
          />

          <div className="shrink-0 border-l border-border/50 bg-background/85">
            <button
              type="button"
              onClick={() => handleSetDetailPanelOpen(!detailPanelOpen)}
              className={cn(
                "flex h-full w-9 items-center justify-center transition-colors",
                detailPanelOpen
                  ? "text-foreground/80 hover:bg-muted/60"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
              title={
                detailPanelOpen
                  ? "Collapse details panel"
                  : "Expand details panel"
              }
              aria-label={
                detailPanelOpen
                  ? "Collapse details panel"
                  : "Expand details panel"
              }
            >
              {detailPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>

          <RoutingDetailPanel
            graph={filteredGraph}
            open={detailPanelOpen}
            onOpenChange={handleSetDetailPanelOpen}
          />

          {showOverlay && (
            <ScanProgressOverlay
              progress={progress}
              isScanning={isScanning}
              onCancel={cancelScan}
              onDismiss={handleDismissOverlay}
            />
          )}
        </div>
      </div>
    </div>
  );
}
