import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ConfigProvider } from "@/types/provider";

interface ProviderScopeState {
  providerScope: ConfigProvider;
  setProviderScope: (provider: ConfigProvider) => void;
}

function isConfigProvider(value: unknown): value is ConfigProvider {
  return value === "claude" || value === "codex" || value === "gemini";
}

export const useProviderScopeStore = create<ProviderScopeState>()(
  persist(
    (set) => ({
      providerScope: "claude",
      setProviderScope: (provider) => set({ providerScope: provider }),
    }),
    {
      name: "provider-scope",
      partialize: (state) => ({ providerScope: state.providerScope }),
      version: 1,
      migrate: (persistedState) => {
        const state = persistedState as
          | Partial<ProviderScopeState>
          | undefined;
        const providerScope = isConfigProvider(state?.providerScope)
          ? state.providerScope
          : "claude";
        return { providerScope };
      },
    },
  ),
);
