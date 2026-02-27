import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppSettings } from "@/lib/app-settings";

const APP_SETTINGS_KEY = ["app-settings"] as const;

export function useAppSettings(enabled = true) {
  return useQuery({
    queryKey: APP_SETTINGS_KEY,
    refetchOnWindowFocus: false,
    enabled,
    queryFn: async (): Promise<AppSettings> => {
      const res = await fetch("/api/settings?provider=app");
      if (!res.ok) throw new Error("Failed to fetch app settings");
      return res.json();
    },
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (partial: Partial<AppSettings>) => {
      const res = await fetch("/api/settings?provider=app", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) throw new Error("Failed to update app settings");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: APP_SETTINGS_KEY });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
