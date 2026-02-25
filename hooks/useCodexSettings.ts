import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CodexSettings } from "@/lib/codex/settings";
import type { CodexSettingsEnvelope } from "@/lib/codex/settings-analysis";

const CODEX_SETTINGS_KEY = ["settings", "codex"] as const;

export function useCodexSettings() {
  return useQuery({
    queryKey: CODEX_SETTINGS_KEY,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CodexSettingsEnvelope> => {
      const res = await fetch("/api/settings?provider=codex&includeMeta=1");
      if (!res.ok) throw new Error("Failed to fetch Codex settings");
      return (await res.json()) as CodexSettingsEnvelope;
    },
  });
}

export function useUpdateCodexSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partial: Partial<CodexSettings>) => {
      const res = await fetch("/api/settings?provider=codex", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error("Failed to update Codex settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CODEX_SETTINGS_KEY });
    },
  });
}
