import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { GeminiSettings } from "@/lib/gemini/settings";

const GEMINI_SETTINGS_KEY = ["settings", "gemini"] as const;

export function useGeminiSettings() {
  return useQuery({
    queryKey: GEMINI_SETTINGS_KEY,
    queryFn: async (): Promise<GeminiSettings> => {
      const res = await fetch("/api/settings?provider=gemini");
      if (!res.ok) throw new Error("Failed to fetch Gemini settings");
      return res.json();
    },
  });
}

export function useUpdateGeminiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (partial: Partial<GeminiSettings>) => {
      const res = await fetch("/api/settings?provider=gemini", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error("Failed to update Gemini settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GEMINI_SETTINGS_KEY });
    },
  });
}
