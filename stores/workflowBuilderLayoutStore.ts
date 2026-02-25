import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkflowBuilderLayoutMode = "normal" | "fullscreen";

interface PanelState {
  leftOpen: boolean;
  rightOpen: boolean;
}

interface WorkflowBuilderLayoutState {
  isFullscreen: boolean;
  normal: PanelState;
  fullscreen: PanelState;
  setFullscreen: (fullscreen: boolean) => void;
  toggleFullscreen: () => void;
  setLeftOpen: (mode: WorkflowBuilderLayoutMode, open: boolean) => void;
  setRightOpen: (mode: WorkflowBuilderLayoutMode, open: boolean) => void;
  toggleLeft: (mode: WorkflowBuilderLayoutMode) => void;
  toggleRight: (mode: WorkflowBuilderLayoutMode) => void;
}

export const useWorkflowBuilderLayoutStore = create<WorkflowBuilderLayoutState>()(
  persist(
    (set) => ({
      isFullscreen: false,
      normal: {
        leftOpen: true,
        rightOpen: true,
      },
      fullscreen: {
        leftOpen: false,
        rightOpen: false,
      },
      setFullscreen: (isFullscreen) => set({ isFullscreen }),
      toggleFullscreen: () =>
        set((state) => ({ isFullscreen: !state.isFullscreen })),
      setLeftOpen: (mode, open) =>
        set((state) => ({
          [mode]: {
            ...state[mode],
            leftOpen: open,
          },
        })),
      setRightOpen: (mode, open) =>
        set((state) => ({
          [mode]: {
            ...state[mode],
            rightOpen: open,
          },
        })),
      toggleLeft: (mode) =>
        set((state) => ({
          [mode]: {
            ...state[mode],
            leftOpen: !state[mode].leftOpen,
          },
        })),
      toggleRight: (mode) =>
        set((state) => ({
          [mode]: {
            ...state[mode],
            rightOpen: !state[mode].rightOpen,
          },
        })),
    }),
    {
      name: "workflow-builder-layout",
      version: 1,
    },
  ),
);
