import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
} from "@/types/workflow";
import type { ConfigProvider } from "@/types/provider";
import {
  completeProcessingJob,
  failProcessingJob,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";
import { useProcessingStore } from "@/stores/processingStore";

const WORKFLOW_PROCESSING_POLL_MS = 2_000;
const WORKFLOW_POST_FINISH_POLL_WINDOW_MS = 8_000;

function useWorkflowProcessingRefresh(): boolean {
  return useProcessingStore((state) => {
    const now = Date.now();
    return state.jobs.some((job) => {
      if (job.source !== "workflows") return false;
      if (job.status === "running") return true;
      if (typeof job.finishedAt !== "number") return false;
      return now - job.finishedAt < WORKFLOW_POST_FINISH_POLL_WINDOW_MS;
    });
  });
}

export function useWorkflows() {
  const hasRunningWorkflowJob = useWorkflowProcessingRefresh();
  return useQuery({
    queryKey: ["workflows"],
    queryFn: async (): Promise<Workflow[]> => {
      const res = await fetch("/api/workflows");
      if (!res.ok) throw new Error("Failed to fetch workflows");
      return res.json();
    },
    refetchInterval: hasRunningWorkflowJob
      ? WORKFLOW_PROCESSING_POLL_MS
      : false,
  });
}

export function useWorkflow(id: string | null) {
  const hasRunningWorkflowJob = useWorkflowProcessingRefresh();
  return useQuery({
    queryKey: ["workflow", id],
    queryFn: async (): Promise<Workflow> => {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) throw new Error("Failed to fetch workflow");
      return res.json();
    },
    enabled: !!id,
    refetchInterval:
      hasRunningWorkflowJob && id ? WORKFLOW_PROCESSING_POLL_MS : false,
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
      _suppressSuccessToast?: boolean;
      _suppressErrorToast?: boolean;
    }) => {
      const {
        _suppressSuccessToast: _suppressSuccessToast,
        _suppressErrorToast: _suppressErrorToast,
        ...payload
      } = data;
      void _suppressSuccessToast;
      void _suppressErrorToast;
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      return res.json() as Promise<Workflow>;
    },
    onSuccess: (wf, variables) => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      queryClient.setQueryData(["workflow", wf.id], wf);
      if (!variables._suppressSuccessToast) {
        toast.success("Workflow created");
      }
    },
    onError: (_error, variables) => {
      if (!variables?._suppressErrorToast) {
        toast.error("Failed to create workflow");
      }
    },
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
      const jobId = startProcessingJob({
        title: "Suggest workflow command",
        subtitle: summarizeForJob(workflowId),
        source: "workflows",
      });
      try {
        const res = await fetch(`/api/workflows/${workflowId}/suggest-command`, {
          method: "POST",
        });
        if (!res.ok) {
          throw new Error("Failed to suggest command");
        }
        const result = (await res.json()) as {
          commandName: string;
          description: string;
          activationContext: string;
        };
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(
            result.commandName
              ? `Suggested /${result.commandName}`
              : "Suggestion ready",
          ),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(workflowId),
        });
        throw error;
      }
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
      complexity?: "auto" | "simple" | "balanced" | "complex";
    }) => {
      const jobId = startProcessingJob({
        title: "Generate workflow plan",
        subtitle: summarizeForJob(data.prompt),
        source: "workflows",
      });
      try {
        const res = await fetch("/api/workflows/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          let message = "Failed to generate workflow";
          try {
            const payload = (await res.json()) as {
              error?: string;
              details?: string;
            };
            if (payload?.error) {
              message = payload.error;
            }
            if (payload?.details) {
              message = `${message}: ${payload.details}`;
            }
          } catch {
            // Ignore parse errors and fall back to generic message.
          }
          throw new Error(message);
        }
        const result = (await res.json()) as {
          plan: string;
          name?: string;
          nodes: WorkflowNode[];
          edges: WorkflowEdge[];
        };
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(
            result.name
              ? `Generated ${result.name} (${result.nodes.length} steps)`
              : `Generated ${result.nodes.length} steps`,
          ),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(data.prompt),
        });
        throw error;
      }
    },
    // No onError toast here — callers use mutateAsync and handle errors themselves
    // (adding onError would cause duplicate toasts)
  });
}
