import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Agent } from "@/types/agent";
import type { ConfigProvider } from "@/types/provider";

export function useAgents(provider: ConfigProvider = "claude") {
  return useQuery({
    queryKey: ["agents", provider],
    queryFn: async (): Promise<Agent[]> => {
      const res = await fetch(`/api/agents?provider=${provider}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch agents");
      return res.json();
    },
  });
}

export function useSaveAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agent: Partial<Agent>) => {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agent),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || "Failed to save agent");
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Failed to save agent"),
  });
}

export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (target: {
      name: string;
      provider?: ConfigProvider;
      projectPath?: string;
    }) => {
      const params = new URLSearchParams();
      if (target.provider) params.set("provider", target.provider);
      if (target.projectPath) params.set("projectPath", target.projectPath);
      const qs = params.toString();
      const res = await fetch(
        `/api/agents/${encodeURIComponent(target.name)}${qs ? `?${qs}` : ""}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to delete agent");
      return target;
    },
    onError: () => {
      toast.error("Failed to delete agent");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}
