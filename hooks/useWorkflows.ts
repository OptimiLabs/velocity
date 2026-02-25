import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
} from "@/types/workflow";
import type { ConfigProvider } from "@/types/provider";

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async (): Promise<Workflow[]> => {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to fetch workflows");
      return res.json();
    },
  });
}

export function useWorkflow(id: string | null) {
  return useQuery({
    queryKey: ["workflow", id],
    queryFn: async (): Promise<Workflow> => {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) throw new Error("Failed to fetch workflow");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      provider?: ConfigProvider;
      name: string;
      description?: string;
      cwd?: string;
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
      generatedPlan?: string;
    }) => {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      return res.json() as Promise<Workflow>;
    },
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.setQueryData(["workflow", wf.id], wf);
      toast.success("Workflow created");
    },
    onError: () => toast.error("Failed to create workflow"),
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<
        Pick<
          Workflow,
          | "name"
          | "provider"
          | "description"
          | "generatedPlan"
          | "nodes"
          | "edges"
          | "cwd"
          | "swarmId"
          | "commandName"
          | "commandDescription"
          | "activationContext"
          | "autoSkillEnabled"
        >
      >;
    }) => {
      const res = await fetch(`/api/workflows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update workflow");
      return res.json() as Promise<Workflow>;
    },
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.invalidateQueries({ queryKey: ["workflow", wf.id] });
    },
    onError: () => toast.error("Failed to save workflow"),
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete workflow");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Workflow deleted");
    },
    onError: () => toast.error("Failed to delete workflow"),
  });
}

export function useBulkDeleteWorkflows() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/workflows", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to delete workflows");
      return res.json() as Promise<{ deleted: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(`Deleted ${data.deleted} workflow${data.deleted === 1 ? "" : "s"}`);
    },
    onError: () => toast.error("Failed to delete workflows"),
  });
}

export function useDuplicateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/workflows/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate" }),
      });
      if (!res.ok) throw new Error("Failed to duplicate workflow");
      return res.json() as Promise<Workflow>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Workflow duplicated");
    },
    onError: () => toast.error("Failed to duplicate workflow"),
  });
}

export function useSuggestCommand() {
  return useMutation({
    mutationFn: async (workflowId: string) => {
      const res = await fetch(`/api/workflows/${workflowId}/suggest-command`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to suggest command");
      return res.json() as Promise<{
        commandName: string;
        description: string;
        activationContext: string;
      }>;
    },
  });
}

export function useGenerateWorkflow() {
  return useMutation({
    mutationFn: async (data: {
      prompt: string;
      cwd?: string;
      existingAgents?: { name: string; description: string }[];
      model?: string;
    }) => {
      const res = await fetch("/api/workflows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to generate workflow");
      return res.json() as Promise<{
        plan: string;
        name?: string;
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
      }>;
    },
    // No onError toast here — callers use mutateAsync and handle errors themselves
    // (adding onError would cause duplicate toasts)
  });
}
