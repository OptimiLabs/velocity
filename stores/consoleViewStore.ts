import { create } from "zustand";

interface ConsoleViewState {
  isFullscreen: boolean;
  setFullscreen: (fullscreen: boolean) => void;
  toggleFullscreen: () => void;
}

export const useConsoleViewStore = create<ConsoleViewState>()((set) => ({
  isFullscreen: false,
  setFullscreen: (isFullscreen) => set({ isFullscreen }),
  toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
}));
