import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AnalysisConversation,
  ComparisonMessage,
  ScopeOptions,
} from "@/types/session";

export function useAnalysisConversations(opts?: {
  status?: "active" | "archived";
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["analysis-conversations", opts],
    queryFn: async (): Promise<{
      conversations: AnalysisConversation[];
      total: number;
    }> => {
      const params = new URLSearchParams();
      if (opts?.status) params.set("status", opts.status);
      if (opts?.limit) params.set("limit", String(opts.limit));
      if (opts?.offset) params.set("offset", String(opts.offset));
      const res = await fetch(`/api/analysis-conversations?${params}`);
      if (!res.ok) throw new Error("Failed to fetch analysis conversations");
      return res.json();
    },
  });
}

export function useAnalysisConversation(id: string | null) {
  return useQuery({
    queryKey: ["analysis-conversation", id],
    queryFn: async (): Promise<AnalysisConversation> => {
      const res = await fetch(`/api/analysis-conversations/${id}`);
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useSaveAnalysisConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      title: string;
      sessionIds: string[];
      enabledSessionIds: string[];
      scope?: ScopeOptions;
      model?: string;
      messages?: ComparisonMessage[];
    }): Promise<AnalysisConversation> => {
      const res = await fetch("/api/analysis-conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create conversation");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["analysis-conversations"],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useUpdateAnalysisConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      title?: string;
      enabledSessionIds?: string[];
      scope?: ScopeOptions;
      model?: string;
      messages?: ComparisonMessage[];
      status?: "active" | "archived";
    }): Promise<AnalysisConversation> => {
      const res = await fetch(`/api/analysis-conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update conversation");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ["analysis-conversations"],
      });
      queryClient.invalidateQueries({
        queryKey: ["analysis-conversation", data.id],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

export function useDeleteAnalysisConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/analysis-conversations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete conversation");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["analysis-conversations"],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
