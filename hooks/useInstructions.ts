import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  InstructionFile,
  InstructionFileType,
  InstructionAttachment,
  ComposeRequest,
  ComposeResult,
} from "@/types/instructions";
import type { ProviderTargetMode } from "@/types/provider-artifacts";
import {
  completeProcessingJob,
  failProcessingJob,
  startProcessingJob,
  summarizeForJob,
} from "@/lib/processing/jobs";

// --- Instruction Files ---

export function useInstructions(filters?: {
  projectId?: string;
  fileType?: InstructionFileType;
  search?: string;
  category?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.projectId) params.set("projectId", filters.projectId);
  if (filters?.fileType) params.set("fileType", filters.fileType);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.category) params.set("category", filters.category);
  const qs = params.toString();

  return useQuery({
    queryKey: ["instructions", filters],
    queryFn: async (): Promise<InstructionFile[]> => {
      const res = await fetch(`/api/instructions${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch instructions");
      return res.json();
    },
  });
}

export function useInstruction(id: string | null) {
  return useQuery({
    queryKey: ["instruction", id],
    queryFn: async (): Promise<InstructionFile> => {
      const res = await fetch(`/api/instructions/${id}`);
      if (!res.ok) throw new Error("Failed to fetch instruction");
      return res.json();
    },
    enabled: !!id,
  });
}

export function useUpdateInstruction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: {
        content?: string;
        tags?: string[];
        isActive?: boolean;
        description?: string;
      };
    }) => {
      const res = await fetch(`/api/instructions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update instruction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      queryClient.invalidateQueries({ queryKey: ["instruction"] });
    },
    onError: () => toast.error("Failed to update instruction"),
  });
}

export function useDeleteInstruction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/instructions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete instruction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: () => toast.error("Failed to delete instruction"),
  });
}

export function useGenerateSkill() {
  return useMutation({
    mutationFn: async (data: {
      name: string;
      prompt: string;
      provider?: string;
      targetProvider?: ProviderTargetMode;
      sourceContext?: string;
      previousContent?: string;
      category?: string;
    }) => {
      const jobId = startProcessingJob({
        title: "Generate skill draft",
        subtitle: summarizeForJob(`${data.name}: ${data.prompt}`),
        source: "instructions",
        provider: data.provider,
      });
      try {
        const res = await fetch("/api/instructions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate-skill", ...data }),
        });
        if (!res.ok) {
          throw new Error((await res.json()).error || "Generation failed");
        }
        const result = (await res.json()) as {
          success: boolean;
          content: string;
          tokensUsed: number;
          cost: number;
          targetProvider?: ProviderTargetMode;
          results?: unknown[];
        };
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(`Generated ${data.name}`),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(`${data.name}: ${data.prompt}`),
        });
        throw error;
      }
    },
  });
}

export function useConvertToSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "convert-to-skill", id }),
      });
      if (!res.ok)
        throw new Error((await res.json()).error || "Conversion failed");
      return res.json() as Promise<{ success: boolean; skillName: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instructions"] });
      qc.invalidateQueries({ queryKey: ["knowledge-files"] });
    },
  });
}

export function useScanInstructions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      });
      if (!res.ok) throw new Error("Failed to scan instructions");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      queryClient.invalidateQueries({ queryKey: ["knowledge-files"] });
    },
    onError: () => toast.error("Failed to scan instructions"),
  });
}

export function useAddManualPath() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (path: string) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-path", path }),
      });
      if (!res.ok) throw new Error("Failed to add path");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: () => toast.error("Failed to add path"),
  });
}

// --- Compose / Summarize ---

export function useComposeInstructions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ComposeRequest): Promise<ComposeResult> => {
      const jobId = startProcessingJob({
        title: "Compose instructions with AI",
        subtitle: summarizeForJob(data.prompt),
        source: "instructions",
        provider: data.provider,
      });
      try {
        const res = await fetch("/api/instructions/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Compose failed" }));
          throw new Error(err.error || "Compose failed");
        }
        const result = (await res.json()) as ComposeResult;
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob(result.filePath || "Compose complete"),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(data.prompt),
        });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: () => toast.error("Failed to compose instructions"),
  });
}

// --- AI Editing ---

export function useAIEdit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      provider,
      prompt,
    }: {
      id: string;
      provider: string;
      prompt: string;
    }) => {
      const jobId = startProcessingJob({
        title: "Edit instructions with AI",
        subtitle: summarizeForJob(prompt),
        source: "instructions",
        provider,
      });
      try {
        const res = await fetch(`/api/instructions/${id}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, prompt }),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "AI editing failed" }));
          throw new Error(err.error || "AI editing failed");
        }
        const result = await res.json();
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob("Edit complete"),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(prompt),
        });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      queryClient.invalidateQueries({ queryKey: ["instruction"] });
    },
    onError: () => toast.error("AI editing failed"),
  });
}

// --- Providers (re-exported from dedicated module) ---

export {
  useProviders,
  useSaveProvider,
  useDeleteProvider,
  useValidateProvider,
} from "./useProviders";

// --- Attachments ---

export function useAttachmentsForInstruction(instructionId: string | null) {
  return useQuery({
    queryKey: ["instruction-attachments", instructionId],
    queryFn: async (): Promise<InstructionAttachment[]> => {
      const res = await fetch(
        `/api/instructions/attachments?instructionId=${instructionId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch attachments");
      return res.json();
    },
    enabled: !!instructionId,
  });
}

export function useAttachInstruction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      instructionId: string;
      targetType: string;
      targetName: string;
      priority?: number;
    }) => {
      const res = await fetch("/api/instructions/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "attach", ...data }),
      });
      if (!res.ok) throw new Error("Failed to attach instruction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instruction-attachments"] });
    },
    onError: () => toast.error("Failed to attach instruction"),
  });
}

export function useDetachInstruction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      instructionId: string;
      targetType: string;
      targetName: string;
    }) => {
      const res = await fetch("/api/instructions/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "detach", ...data }),
      });
      if (!res.ok) throw new Error("Failed to detach instruction");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instruction-attachments"] });
    },
    onError: () => toast.error("Failed to detach instruction"),
  });
}

export function useKnowledgeFiles(category?: string, search?: string) {
  return useInstructions({ fileType: "knowledge.md", category, search });
}

export function useCreateKnowledgeFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      filename: string;
      category: string;
      content?: string;
    }) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Create failed" }));
        throw new Error(err.error || "Create failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Knowledge file created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateGlobalFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      fileType: string;
      filename: string;
      content?: string;
      trigger?: string;
    }) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-global", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Create failed" }));
        throw new Error(err.error || "Create failed");
      }
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      const labels: Record<string, string> = {
        "CLAUDE.md": "Instruction",
        "agents.md": "Agent",
        "skill.md": "Command",
      };
      toast.success(`${labels[variables.fileType] || "File"} created`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCopyKnowledgeFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { sourceId: string; filename?: string }) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "copy", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Copy failed" }));
        throw new Error(err.error || "Copy failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Knowledge file duplicated");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useCreateProjectFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      projectId: string;
      projectPath: string;
      fileType: string;
      filename: string;
      content?: string;
    }) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-project-file", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Create failed" }));
        throw new Error(err.error || "Create failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Project file created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useScanDirectory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dirPath: string) => {
      const res = await fetch("/api/instructions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scan-dir", dirPath }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Scan failed" }));
        throw new Error(err.error || "Scan failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// --- Router Sync ---

export function useSyncRouter() {
  return useMutation({
    mutationFn: async (claudeMdPath?: string) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", ...(claudeMdPath ? { claudeMdPath } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Sync failed" }));
        throw new Error(err.error || "Sync failed");
      }
      return res.json();
    },
    onError: () => toast.error("Failed to sync router from CLAUDE.md"),
  });
}

// --- Router Add / Remove Entry ---

export function useAddRouterEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      trigger: string;
      path: string;
      category: string;
    }) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-entry", ...data }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Add entry failed" }));
        throw new Error(err.error || "Add entry failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: () => toast.error("Failed to add router entry"),
  });
}

export function useUpdateRouterEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { path: string; trigger: string }) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-entry", ...data }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Update entry failed" }));
        throw new Error(err.error || "Update entry failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: () => toast.error("Failed to update router entry"),
  });
}

export function useRemoveRouterEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (filePath: string) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-entry", path: filePath }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Remove entry failed" }));
        throw new Error(err.error || "Remove entry failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: () => toast.error("Failed to remove router entry"),
  });
}

// --- Import from URL ---

export function useFetchUrl() {
  return useMutation({
    mutationFn: async ({ url }: { url: string }) => {
      const res = await fetch("/api/instructions/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Fetch failed" }));
        throw new Error(err.error || "Fetch failed");
      }
      return res.json();
    },
    onError: () => toast.error("Failed to fetch URL"),
  });
}

export function useSaveKnowledge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      content: string;
      category: string;
      filename: string;
      sourceUrl?: string;
    }) => {
      const res = await fetch("/api/instructions/import-url/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "Save failed" }));
        throw new Error(err.error || "Save failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Knowledge file imported");
    },
    onError: () => toast.error("Failed to save knowledge file"),
  });
}

export function useSummarizeContent() {
  return useMutation({
    mutationFn: async ({
      content,
      provider,
      prompt,
    }: {
      content: string;
      provider?: string;
      prompt?: string;
    }) => {
      const jobId = startProcessingJob({
        title: "Summarize content with AI",
        subtitle: summarizeForJob(prompt || content),
        source: "instructions",
        provider,
      });
      try {
        const res = await fetch("/api/instructions/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, provider, prompt }),
        });
        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Summarization failed" }));
          throw new Error(err.error || "Summarization failed");
        }
        const result = await res.json();
        completeProcessingJob(jobId, {
          subtitle: summarizeForJob("Summary ready"),
        });
        return result;
      } catch (error) {
        failProcessingJob(jobId, error, {
          subtitle: summarizeForJob(prompt || content),
        });
        throw error;
      }
    },
    onError: () => toast.error("Failed to summarize content"),
  });
}

export function useToggleAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      instructionId: string;
      targetType: string;
      targetName: string;
      enabled: boolean;
    }) => {
      const res = await fetch("/api/instructions/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", ...data }),
      });
      if (!res.ok) throw new Error("Failed to toggle attachment");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instruction-attachments"] });
    },
    onError: () => toast.error("Failed to toggle attachment"),
  });
}

// --- Category CRUD ---

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; claudeMdPath?: string }) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add-category", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Create category failed" }));
        throw new Error(err.error || "Create category failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Category created");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRenameCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { oldName: string; newName: string; claudeMdPath?: string }) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename-category", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Rename category failed" }));
        throw new Error(err.error || "Rename category failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Category renamed");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { name: string; claudeMdPath?: string }) => {
      const res = await fetch("/api/instructions/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-category", ...data }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Delete category failed" }));
        throw new Error(err.error || "Delete category failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instructions"] });
      toast.success("Category deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
