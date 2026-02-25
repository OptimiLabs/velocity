import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AIProvider, ProviderSlug } from "@/types/instructions";

type ProviderListItem = Omit<AIProvider, "apiKeyEncrypted">;

export function useProviders() {
  return useQuery<ProviderListItem[]>({
    queryKey: ["ai-providers"],
    queryFn: async () => {
      const res = await fetch("/api/instructions/providers");
      if (!res.ok) throw new Error("Failed to fetch providers");
      return res.json();
    },
  });
}

export function useSaveProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      provider: string;
      providerSlug?: ProviderSlug;
      displayName: string;
      apiKey: string;
      modelId?: string;
      endpointUrl?: string;
    }) => {
      const res = await fetch("/api/instructions/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save provider");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: () => toast.error("Failed to save provider"),
  });
}

export function useDeleteProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (providerSlug: string) => {
      const res = await fetch(
        `/api/instructions/providers?provider=${encodeURIComponent(providerSlug)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete provider");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: () => toast.error("Failed to delete provider"),
  });
}

export function useUpdateProviderConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      providerSlug: string;
      temperature?: number | null;
      topK?: number | null;
      topP?: number | null;
      thinkingBudget?: number | null;
      maxTokens?: number | null;
    }) => {
      const res = await fetch("/api/instructions/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update provider config");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
    onError: () => toast.error("Failed to update provider config"),
  });
}

export function useValidateProvider() {
  return useMutation({
    mutationFn: async (data: {
      providerSlug: ProviderSlug;
      apiKey: string;
      endpointUrl?: string;
    }): Promise<{ valid: boolean; error?: string }> => {
      const res = await fetch("/api/providers/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Validation request failed");
      return res.json();
    },
  });
}
