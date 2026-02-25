import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WorkspaceState {
  inventoryCollapsed: boolean;
  inventorySection: "agents" | "workflows" | "prompts" | "marketplace";
  searchQuery: string;
  detailMode: "view" | "edit" | "create";
  buildWorkflowId: string | null;
  workspaceAgents: string[];
  buildWorkspaceAgents: string[];
  toggleInventory: () => void;
  setInventorySection: (
    s: "agents" | "workflows" | "prompts" | "marketplace",
  ) => void;
  setSearchQuery: (q: string) => void;
  setDetailMode: (m: "view" | "edit" | "create") => void;
  setBuildWorkflowId: (id: string | null) => void;
  addToWorkspace: (name: string) => void;
  removeFromWorkspace: (name: string) => void;
  clearWorkspace: () => void;
  addToBuildWorkspace: (name: string) => void;
  removeFromBuildWorkspace: (name: string) => void;
  clearBuildWorkspace: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      inventoryCollapsed: false,
      inventorySection: "agents",
      searchQuery: "",
      detailMode: "view",
      buildWorkflowId: null,
      workspaceAgents: [],
      buildWorkspaceAgents: [],
      toggleInventory: () =>
        set((s) => ({ inventoryCollapsed: !s.inventoryCollapsed })),
      setInventorySection: (inventorySection) => set({ inventorySection }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setDetailMode: (detailMode) => set({ detailMode }),
      setBuildWorkflowId: (buildWorkflowId) => set({ buildWorkflowId }),
      addToWorkspace: (name) =>
        set((s) => ({
          workspaceAgents: [...s.workspaceAgents, name],
        })),
      removeFromWorkspace: (name) =>
        set((s) => ({
          workspaceAgents: s.workspaceAgents.filter((n) => n !== name),
        })),
      clearWorkspace: () => set({ workspaceAgents: [] }),
      addToBuildWorkspace: (name) =>
        set((s) => {
          if (s.buildWorkspaceAgents.includes(name)) return s;
          return { buildWorkspaceAgents: [...s.buildWorkspaceAgents, name] };
        }),
      removeFromBuildWorkspace: (name) =>
        set((s) => ({
          buildWorkspaceAgents: s.buildWorkspaceAgents.filter(
            (n) => n !== name,
          ),
        })),
      clearBuildWorkspace: () => set({ buildWorkspaceAgents: [] }),
    }),
    {
      name: "agent-workspace",
      version: 2,
      partialize: (state) => ({ workspaceAgents: state.workspaceAgents }),
      skipHydration: typeof window === "undefined",
    },
  ),
);
