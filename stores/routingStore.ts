import { create } from "zustand";

type CanvasMode = "browse" | "connect";
export type LayoutMode = "hierarchical" | "dagre";
export type RoutingNodeType = "claude-md" | "skill" | "agent" | "knowledge" | "folder" | "entrypoint";
export type RoutingEdgeType =
  | "reference"
  | "manual"
  | "contains"
  | "table-entry"
  | "entrypoint";

export const ROUTING_EDGE_ALL_TYPES: RoutingEdgeType[] = [
  "reference",
  "manual",
  "contains",
  "table-entry",
  "entrypoint",
];
export const ROUTING_EDGE_FOCUS_TYPES: RoutingEdgeType[] = [
  "reference",
  "manual",
];

interface RoutingState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectedFilePath: string | null;
  setSelectedFilePath: (path: string | null) => void;
  detailMode: "view" | "edit";
  setDetailMode: (m: "view" | "edit") => void;
  canvasMode: CanvasMode;
  setCanvasMode: (m: CanvasMode) => void;
  // Scope filter: "all" or an entrypoint file path (CLAUDE.md)
  graphScope: string;
  setGraphScope: (scope: string) => void;
  // For fitView on node focus
  focusNodeId: string | null;
  setFocusNodeId: (id: string | null) => void;
  // Layout mode
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  // Visible node type filters
  visibleNodeTypes: Set<RoutingNodeType>;
  toggleNodeType: (type: RoutingNodeType) => void;
  // Visible edge filters (default to all edge types)
  visibleEdgeTypes: Set<RoutingEdgeType>;
  toggleEdgeType: (type: RoutingEdgeType) => void;
  setEdgeFocusMode: () => void;
  setAllEdgeTypes: () => void;
  // Show/hide global (~/) nodes when viewing a project scope
  showGlobalNodes: boolean;
  setShowGlobalNodes: (show: boolean) => void;
  // Collapsed folder state
  collapsedFolders: Set<string>;
  toggleFolderCollapse: (nodeId: string) => void;
  // Fullscreen mode
  isFullscreen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
  toggleFullscreen: () => void;
  // Search input focus trigger (increment to refocus)
  focusTrigger: number;
  triggerSearchFocus: () => void;
}

export const useRoutingStore = create<RoutingState>()((set) => ({
  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  selectedFileId: null,
  setSelectedFileId: (selectedFileId) => set({ selectedFileId }),
  selectedNodeId: null,
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  selectedFilePath: null,
  setSelectedFilePath: (selectedFilePath) => set({ selectedFilePath }),
  detailMode: "view",
  setDetailMode: (detailMode) => set({ detailMode }),
  canvasMode: "browse",
  setCanvasMode: (canvasMode) => set({ canvasMode }),
  graphScope: "all",
  setGraphScope: (graphScope) => set({ graphScope }),
  focusNodeId: null,
  setFocusNodeId: (focusNodeId) => set({ focusNodeId }),
  layoutMode: "dagre",
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  visibleNodeTypes: new Set<RoutingNodeType>(["claude-md", "skill", "agent", "knowledge", "folder", "entrypoint"]),
  toggleNodeType: (type) =>
    set((state) => {
      const next = new Set(state.visibleNodeTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { visibleNodeTypes: next };
    }),
  visibleEdgeTypes: new Set<RoutingEdgeType>(ROUTING_EDGE_ALL_TYPES),
  toggleEdgeType: (type) =>
    set((state) => {
      const next = new Set(state.visibleEdgeTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return { visibleEdgeTypes: next };
    }),
  setEdgeFocusMode: () =>
    set({ visibleEdgeTypes: new Set<RoutingEdgeType>(ROUTING_EDGE_FOCUS_TYPES) }),
  setAllEdgeTypes: () =>
    set({ visibleEdgeTypes: new Set<RoutingEdgeType>(ROUTING_EDGE_ALL_TYPES) }),
  showGlobalNodes: true,
  setShowGlobalNodes: (showGlobalNodes) => set({ showGlobalNodes }),
  collapsedFolders: new Set<string>(),
  toggleFolderCollapse: (nodeId) =>
    set((state) => {
      const next = new Set(state.collapsedFolders);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { collapsedFolders: next };
    }),
  isFullscreen: false,
  setFullscreen: (isFullscreen) => set({ isFullscreen }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  focusTrigger: 0,
  triggerSearchFocus: () => set((state) => ({ focusTrigger: state.focusTrigger + 1 })),
}));
