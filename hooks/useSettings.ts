import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClaudeSettings } from "@/lib/claude-settings";

const SETTINGS_KEY = ["settings"] as const;

export function useSettings(enabled = true) {
  return useQuery({
    queryKey: SETTINGS_KEY,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async (): Promise<ClaudeSettings> => {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      return res.json();
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partial: Partial<ClaudeSettings>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error("Failed to update settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
